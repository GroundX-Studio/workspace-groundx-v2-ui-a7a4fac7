# Harden citation emission — contract, parser, truncation, observability

## Why

Live finding (2026-06-12): on extraction-grounded content questions ("what
taxes and surcharges were applied to meter 91496726?") the chat reply ships
with ZERO citations ~60% of turns (8 of 13 instrumented live runs) even
though the answer is correct. The verification pipeline is healthy — when the
model emits the citations block, entries validate and ship (6/6, 1/1
observed). The losses are upstream of verification:

1. **Permissive, self-undermining contract.** `CITATIONS_CONTRACT`
   (`prompts/fragments.ts`) says the model "MAY append" the block and to
   "skip the block for non-content turns" — nothing requires citing a content
   claim. It also threatens drops three times ("the client drops the rest",
   "dropped to a lower-confidence…", "fabricated paths … are dropped"),
   which incentivizes omission, and it shows TWO conflicting "single block"
   examples (snippet-form, then extraction-form appended as a second fence).
2. **Residual parser gaps + unchecked truncation.** (Reconciled 2026-06-12
   against the landed multi-fence parser fix: `parseGroundedAnswer` now scans
   ALL ```json fences, merges citation entries across blocks, and strips only
   metadata blocks — first-fence-only and content-fence stripping are FIXED.)
   Remaining: the fence regex still requires `\n`-bounded fences (misses
   one-line fences, ```JSON casing, and a bare trailing `{"citations":…}`
   object; CRLF DOES already parse — `\s*` eats the `\r`, verified
   2026-06-12); merged blocks can yield DUPLICATE entries (no dedup); a
   `page` emitted as a numeric string is dropped. And `callGroundedLlm` sets
   no output-token bound and nothing checks `finish_reason` — a length-cut
   completion silently amputates the trailing citations fence while the
   prose survives.
3. **The EXTRACTED FIELDS block is truncated mid-JSON.** The live utility
   sample extraction serializes to 6,159 chars; `EXTRACTION_PROMPT_CHARS` is
   6,000, so the prompt block ends in syntactically invalid JSON +
   "…(truncated)", with no log when this fires. The "~2KB" sizing comment is
   stale. The model is asked to cite verbatim paths from JSON it can see is
   broken.
4. **Zero observability.** A turn where the model omitted the block is
   indistinguishable — in the reply, `_debug`, and logs — from a turn where it
   emitted N entries that were ALL silently dropped (one such all-dropped turn
   was observed live). `verifyExtractionCitation` has eight silent `return null`/drop
   points; the parser has five.

## What

Four units on the chat-routing capability (details in `design.md`):

- **U1 — Contract rewrite.** Content claims MUST end with the citations
  block; the skip license applies ONLY to non-content turns. ONE example
  showing snippet-form and extraction-form entries side by side in the same
  `citations` array. Threat language softened to confidence-tier framing.
- **U2 — Parser + completion hardening.** On the landed multi-fence parser:
  tolerant fence pattern (`(?:json)?` tag any case, one-line fences) + a
  trailing bare `{"citations":[…]}` fallback; dedup identical entries across
  merged blocks; coerce numeric-string `page`. Bound output tokens with
  `max_completion_tokens` (the in-repo precedent: the summarizer already uses
  it for this gpt-5-family provider) on EVERY loop round's request and log
  `finish_reason: "length"` per round; the truncated flag tracks the final
  round.
- **U3 — Structural extraction truncation.** Raise the budget (12,000 chars)
  and truncate by dropping whole trailing array items / fields so the prompt
  block is ALWAYS valid JSON; log payload size + dropped-item count when
  truncation fires.
- **U4 — Citation funnel observability.** One prod-safe log + `_debug.citations`
  per grounded turn: `{emitted, validSnippetForm, validExtractionForm,
  shipped, dropReasons: {docId, path, value, branchNode, geometry, parse}}` —
  the single signal that says which loss dominates live.

## Out of scope (tracked, not dormant)

- **Retry backstop** (re-ask for citations when a content turn ships zero):
  deferred until U1–U4's residual omission rate is measured — adds latency to
  every miss. Tracked as a follow-up task in `tasks.md` (T-DEFER-1).
- **Geometry-miss hard drop of validated extraction citations**: the durable
  chat-routing spec REQUIRES the drop ("no pageless citation form"). U4 makes
  the drop visible; revisiting the requirement is data-driven follow-up
  (T-DEFER-2), not a silent contradiction of a locked spec.
- **Native function-calling/`response_format` citation surface**: contradicts
  the A.3 decision (citations are answer metadata, not a tool surface) and
  collides with `agentic-tool-loop`; reconsider only if U1+U2 leave omission
  high.

## Ordering vs in-flight changes

RECONCILED 2026-06-12 (second pass): `agentic-tool-loop` has LANDED in the
working tree — `callGroundedLlm` is now a bounded multi-round dispatch
(`serverToolLoop`, per-round provider requests) and `groundedAnswerOverScope`
takes a `toolLoop` option. This change therefore lands ON TOP of the loop:
U2's output-token bound applies to EVERY round's request, and the
`finish_reason: "length"` check applies per round (any length-cut round warns;
the truncated flag is set when the FINAL round — the one whose prose becomes
the answer — was cut). Shared files (`ragPipeline.ts`, `groundedAnswer.ts`,
`prompts/fragments.ts`) must be re-diffed at T1 start if the tree moves again.

## Conformance to core architectural decisions

- **Composable, not forked (P1):** no new components. U1 edits prompt
  literals in their one home (`services/prompts/`); U2 hardens the existing
  parser in place (every caller — rag, report, hybrid, future tool-loop —
  inherits it; the ≥2-caller axis is already real); U3 replaces the slice in
  the existing `fetchDocumentExtraction`; U4 attaches counts to the existing
  `_debug` seam. No new abstraction is introduced, so no second-caller test
  is owed.
- **Done-able (P5):** user-visible closure = a live content answer carries
  citation chips; round-trip = the funnel counters prove emitted→shipped on a
  fixture turn and the regression suite stays green.
- **One source of truth (P6):** no new types; `_debug.citations` is added to
  the shared `chatReplyDebugSchema` in `shared/src/index.ts` —
  `ChatRouterDebug` is an ALIAS of the shared Zod inference, and the closed
  `z.object` would silently strip an unknown key, so the schema is the only
  valid home; no twin of `Citation` or the parse result.
- **TDD (P2) / adversarial gates (P3):** every task in `tasks.md` starts RED
  and carries its gate.
