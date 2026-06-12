# Design — harden-citation-emission

## Evidence base (live, 2026-06-12)

13 instrumented runs of the tax/surcharge question against real GroundX +
gpt-5.5, capturing the raw completion before parsing:

| outcome | runs |
|---|---|
| block omitted entirely (no fence in raw answer) | 8 |
| block emitted, all entries shipped | 4 (6/6, 6/6, 1/1, 1/1) |
| block emitted (6 entries), ALL dropped in validation | 1 |

Live extraction payload: 6,159 chars vs `EXTRACTION_PROMPT_CHARS = 6_000` —
the prompt block is cut mid-string ("issued_on":"2025-07-08…(truncated)").
All cited tax fields sit inside the cap; the cut tail is wrapper fields, but
the model sees malformed JSON.

An independent fresh-eyes audit additionally identified: no `max_tokens` /
`finish_reason` handling on the grounded call; parser fence-shape fragility;
the "single block" contract showing two example fences; threat wording; zero
emission-compliance test coverage (all suites inject completions that
already contain the block).

RECONCILED 2026-06-12 against the landed multi-fence parser fix
(`ragPipeline.ts#parseGroundedAnswer` now scans all ```json fences via
`matchAll`, merges entries across blocks, strips only metadata blocks):
first-fence-only and content-fence stripping are FIXED and out of scope.
Remaining parser scope: newline-bound fence regex (one-line / ```JSON /
bare trailing object all miss; CRLF already parses — `\s*` eats the `\r`,
verified, so it is NOT a RED case), no dedup across merged blocks
(duplicate chips), numeric-string `page` dropped.

## Approaches considered

- **A. Prompt-only fix** (MUST wording + cap raise). Cheapest; addresses the
  dominant cause but leaves length-truncation, parser misses, and the
  all-dropped blind spot unmeasurable. Rejected as insufficient alone.
- **B. Layered hardening (CHOSEN).** U1 contract + U2 parser/completion +
  U3 structural truncation + U4 funnel observability, then measure. Each unit
  is independently small, testable, and lands in existing seams.
- **C. Structural enforcement** (citations via native tool call or
  `response_format` json_schema). Strongest emission guarantee, but reverses
  the A.3 decision (citations are metadata, deliberately NOT a tool surface),
  collides head-on with `agentic-tool-loop`'s transcript handling, and is
  provider-dependent. Held as the documented fallback if B's measured
  residual omission stays high (T-DEFER-1 carries the measurement).

## U1 — Contract rewrite (`prompts/fragments.ts`, `grounded.ts`)

Single `CITATIONS_CONTRACT` builder that takes `hasExtraction: boolean` and
renders ONE contract with ONE example block:

- Requirement language: "If your answer states ANY fact drawn from the
  snippets or the EXTRACTED FIELDS block, you MUST end the answer with the
  citations block — one entry per claim. Omit the block ONLY when the answer
  draws on neither (greetings, small talk, product questions)."
- One example `citations` array containing a snippet-form entry
  (`page`+`quote`) and — only when `hasExtraction` — an extraction-form entry
  (`field`+`value`) side by side, with one sentence on when to use each form.
- Threat language replaced: "Entries that don't match the source are shown
  with lower confidence" (true: unverified quotes ship as `ambient`).
- `EXTRACTION_CITATIONS_CONTRACT` is folded in and deleted (its sole consumer
  is `buildGroundedSystem`).
- The no-extraction prompt does NOT need to stay byte-identical (that
  invariant belonged to the extraction-grounded-citations change, now
  archived); `prompts.test.ts` substring guards update with the wording.

## U2 — Parser + completion hardening (`ragPipeline.ts`)

`parseGroundedAnswer` (building on the landed multi-fence merge — scan-all,
metadata-only stripping, and content-fence preservation stay as shipped):

- Loosen the fence pattern to `/```(?:json)?\s*([\s\S]*?)```/gi` (handles
  one-line fences, CRLF, ```JSON, bare ```), plus a trailing un-fenced
  `{"citations":[…]}` object as a last resort. Metadata-key detection (not
  the fence tag) remains the strip criterion, so content fences (now
  including untagged ones) still stay in the body unless they carry a
  metadata key.
- Dedup merged entries: identical `(documentId, page, quote, answerSpan)` /
  `(documentId, field, value, answerSpan)` tuples collapse to one (N4 —
  duplicate chips under the multi-block merge). `answerSpan` is IN the key:
  two claims legitimately citing the same quote each keep their entry.
- Per-entry coercion: accept `page` as a numeric string (`"2"` → 2); existing
  arm validation otherwise unchanged.
- Parse-level losses (fence found but JSON.parse failed / wrong shape /
  zero valid entries) are COUNTED and returned on the parse result for U4 —
  no behavior change to the null contract.

`callGroundedLlm` (now the agentic-tool-loop's bounded MULTI-ROUND dispatch
— reconciled 2026-06-12; one provider request per round):

- Bound the completion with `max_completion_tokens: 4096` on EVERY round's
  request body (generous — observed answers are <500 tokens; the point is a
  deterministic ceiling). Param-name decision is settled by in-repo
  precedent: the summarizer already sends `max_completion_tokens` to this
  same gpt-5-family provider ("gpt-5 family deprecated max_tokens" —
  `conversationCompressor.ts`, asserted at `chatHandler.test.ts:1116`). NOTE:
  that summarizer test's comment ("the RAG grounding call does not carry
  max_completion_tokens") goes stale — update the comment; its discriminator
  survives because 4096 ≠ 250. No temperature pin (out of scope — nothing
  motivates one; dropped per adversarial review m4).
- Read `choices[0].finish_reason` each round; on `"length"`, `logger.warn`
  with the round index + answer char count. The response-level
  `truncated: true` flag is set when the FINAL round (whose prose becomes the
  answer and carries the citations fence) was length-cut. T3's gate includes
  a live smoke against the real provider.

## U3 — Structural truncation (`groundedAnswer.ts#fetchDocumentExtraction`)

- `EXTRACTION_PROMPT_CHARS` → 12,000.
- Over budget: instead of slicing the string, deterministically: find the
  array (anywhere in the payload) with the LARGEST serialized size, drop its
  LAST element, re-serialize; repeat until under budget or all arrays are
  empty; then (if still over) drop trailing top-level fields; FINALLY, if a
  single oversized scalar remains (the pathological fixture in
  `chatRouter.test.ts:942` is exactly this — one 20k-char string field),
  truncate that string VALUE in place (keeping valid JSON) rather than
  emitting an empty object. The block handed to the prompt is ALWAYS
  `JSON.parse`-able. Append a JSON-safe marker
  field (`"_truncated": "<n> items omitted"`) instead of prose ellipsis.
- `logger.warn` with `{payloadChars, promptChars, droppedItems}` whenever
  truncation fires.
- Validation (`verifyExtractionCitation`) keeps using the FULL parsed payload
  (already the case) — truncation only affects what the model sees.

## U4 — Citation funnel observability (`groundedAnswer.ts`, `shared/src/index.ts`)

- `verifiedCitations` returns `{citations, funnel}` (internal shape) where
  `funnel = {emitted, validSnippetForm, validExtractionForm, shipped,
  dropReasons: {parse, docId, page, path, value, branchNode, geometry}}`;
  every currently-silent `return null`/filter increments its reason — there
  are EIGHT such sites in `verifyExtractionCitation` alone (242/245/249/259/
  268/271/274 + the bboxless drop), several sharing a line but not a cause:
  the no-ctx vs docId-mismatch pair at :242 maps to `docId`; path misses to
  `path`; branch-node + value to `branchNode`/`value`; X-Ray/geometry to
  `geometry`.
- `groundedAnswerOverScope` merges parse-level counts (U2) and logs ONE
  prod-safe `logger.info({citationFunnel})` per grounded turn, and attaches
  it to `options.debug` WHEN the caller passed a debug accumulator (chat
  dev-mode does; report + hybrid pass none and get the log only) — surfaced
  as `_debug.citations`, dev-only like the rest of `_debug`.
- The optional `citations` branch is added to the shared
  `chatReplyDebugSchema` (`shared/src/index.ts:653`) — `ChatRouterDebug` is
  `export type ChatRouterDebug = SharedChatReplyDebug`, an alias of the Zod
  inference, and the closed `z.object` STRIPS unknown keys on parse, so
  adding the branch anywhere else ships dormant plumbing that never reaches
  the wire.
- Public `GroundedAnswer` shape is unchanged (funnel rides the debug seam,
  not the result) — report/hybrid callers unaffected.

## Risks (adversarial-review findings, 2026-06-12)

- **Over-citation regression.** Hardening "MAY" to MUST risks the model
  citing on NON-content turns (product questions, small talk); unverifiable
  quotes there ship as `ambient` chips — re-creating the exact
  "what is GroundX?"-with-utility-chips bug the no-invented-citations rule
  killed. Mitigations: the contract keeps the explicit draws-on-neither
  omission license; the T6 live probe includes a product question asserting
  ZERO citations; the funnel (U4) makes any drift measurable.
- **Provider param compatibility** (see U2 note): `max_tokens` vs
  `max_completion_tokens`, temperature rejection — resolved at T3's live
  smoke, never assumed.
- **Tolerant fence pattern over-matching:** `/```(?:json)?\s*…/gi` also
  captures non-JSON fences (e.g. ```typescript — the tag parses as content).
  Harmless by construction: such blocks fail `JSON.parse` or carry no
  metadata key and stay in the body; the dedicated test pins this.
- **Example-echo fences.** With untagged fences now parsed, a model echoing
  the contract's own example (user: "show me your citations format") parses
  as REAL emitted entries — stripped from the body and merged, then
  (normally) dropped by doc-id validation, inflating funnel `dropReasons`.
  Accepted: validation already contains it; the contract's example uses
  placeholder ids that can never validate. Documented so funnel readers
  don't misread the noise.
- **`_truncated` marker citation.** The model may cite the marker field; the
  path resolves in the prompt block but NOT the full payload → dropped as a
  `path` loss. One contract line ("never cite `_truncated`") in U1 prevents
  it.
- **Unterminated fence** (length-cut mid-fence): no closing ``` → no match →
  prose keeps the partial fence. Acceptable; the `finish_reason` warn (U2)
  plus funnel `parse` counter make it visible. No recovery attempted.

## Testing

- U1: `prompts.test.ts` — contract contains the MUST sentence, exactly one
  ```json example fence, both entry forms when extraction present; guard test
  (`promptLiterals.guard.test.ts`) untouched (location-only).
- U2: table-driven `parseGroundedAnswer` cases (one-line fence, CRLF, ```JSON,
  bare trailing object, page-as-string, duplicate entries across two blocks
  deduped, untagged content fence preserved in body); `callGroundedLlm`
  request-shape test asserts `max_tokens`/`temperature`;
  finish_reason=length fixture logs + flags.
- U3: oversized fixture payload (>12k) → block parses as JSON, `_truncated`
  marker present, warn logged; under-budget payload byte-identical.
- U4: fixture turn with 2 emitted / 1 dropped-by-value → funnel counts exact;
  omitted-block turn → `emitted: 0` distinguishable from all-dropped.
- Closure: live emission probe (scripted in tasks, not CI-gated) — N=6 live
  runs of the tax question, expect ≥5 with shipped citations; result recorded
  in the task gate. CI-gating a live LLM behavioral rate is flaky by nature;
  the funnel log is the durable measurement (T-DEFER-1 reads it).
