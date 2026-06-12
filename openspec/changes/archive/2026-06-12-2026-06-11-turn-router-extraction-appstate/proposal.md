# Turn-router extensions — `extractionContext` + `appState` flags

## Why

The chat-architecture-hardening turn router shipped with two named-but-unbuilt
scenarios, both now causing real cost:

| Finding | Problem |
|---|---|
| E1 | `fetchDocumentExtraction` (groundedAnswer.ts) fires UNCONDITIONALLY whenever a primary document exists — every turn, including pure small talk, pays the extract fetch and up to ~6KB of EXTRACTED FIELDS prompt content it never uses. The turn plan already gates search and skill retrieval; extraction is the one retrieval input left ungated. |
| A1 | `classifyChatMode` (chatClassifier.ts) is the carved-out second classifier the durable spec explicitly names as "the subsumption target for a future `appState` flag". Its keyword heuristics (`"saved schema"`, `"my workspace"`, …) miss paraphrases ("how many pages do I have left on my plan?") and mis-route them to rag, where the answer is hallucination-prone. The spec bans parallel classifiers; this one is living on a named exemption. |

Both extensions are exactly what the decision record was designed for: a new
flag consumed at its gate, never a new classifier.

## What changes

| # | Change |
|---|---|
| 1 | **`extractionContext` flag.** The planner record gains `extractionContext: boolean` (schema-optional, tolerant of older outputs). `groundedAnswerOverScope` consumes it at the extraction gate: `false` skips `fetchDocumentExtraction` entirely; `true` or absent preserves today's fetch-when-primary-doc-exists behavior. `FALLBACK_TURN_PLAN.extractionContext = true` — the deterministic fallback is byte-for-byte today's behavior (no sentinel needed: unlike the skill retriever, the extraction path has no internal scoring gate to delegate to). |
| 2 | **`appState` flag + mode subsumption.** The planner record gains `appState: boolean`; the consumed value is `boolean \| "classifier-decides"` (a `CLASSIFIER_DECIDES` sentinel mirroring `RETRIEVER_DECIDES`). Planning hoists from inside `groundedAnswerOverScope` to `routeChat`, which derives the mode from the plan: `appState && !documentSearch` → structured, `appState && documentSearch` → hybrid, else rag. The explicit UI intent-hint step stays deterministic and WINS without a planner call. The whole keyword classifier survives unchanged as the deterministic fallback (sentinel / no light client / timeout / garbage → `classifyChatMode`, byte-for-byte today's routing). |
| 3 | **One planner call per turn.** The rag path threads the `routeChat`-computed plan into `groundedAnswerOverScope` via the existing `options.turnPlan`; the seam never plans twice. Report + hybrid keep FIXED plans, extended with `extractionContext: true` (both fetch extraction today — coherence preserved). |
| 4 | **Prompt.** `prompts/turnRouter.ts` extends the strict-JSON shape to four booleans with per-flag definitions and unsure-bias rules (`extractionContext`: true when unsure; `appState`: false when unsure — mis-routing to rag is today's behavior, mis-routing to structured is a regression). |

## Scope

**In:** the two flags, the `routeChat` plan hoist, prompt extension, fixed-plan
literals in `structuredHandler.ts` + `reportRenderer.ts`, spec deltas, tests.
**Out:** deleting `classifyChatMode` (it IS the fallback); collapsing the
three-mode dispatch into the grounded seam; any new retrieval source; changing
the 3s planner abort budget; structured-mode canned-answer tone.

## Non-goals / accepted behavior changes

- Structured/hybrid turns WITHOUT a UI intent hint now pay one light-LLM
  planner call (previously free keyword match). Bounded by the existing 3s
  abort with a deterministic fallback; rag turns pay net zero extra (the call
  moves from the seam to the router). Accepted: correct routing of paraphrased
  app-state questions is worth ≤3s worst-case on a path that was mis-routing
  them anyway.
- Small-talk turns stop carrying the EXTRACTED FIELDS block when the planner
  says so. Pure prompt-size/latency win; fallback preserves the old behavior.

## Conformance to core architectural decisions

- **Principle 1 — composable, not forked.** Both scenarios are new VALUES on
  the existing decision-record axis, consumed at their gates. No new
  classifier, no new pipeline. The `CLASSIFIER_DECIDES` sentinel is the same
  explicit-fallback pattern `RETRIEVER_DECIDES` already established — the
  second real caller of that pattern, not a new abstraction.
- **Principle 2 — TDD.** tasks.md leads each task with the failing
  user-visible test (planner parsing, extraction-gate behavior, mode
  derivation, fallback parity, one-call-per-turn).
- **Principle 5 — done = user-visible.** Each flag has a consumption gate and
  observable behavior delta (no extract HTTP call / different route taken) —
  no dormant record fields. The flags land WITH their gates in the same task.
- **Principle 6 — one source of truth.** The plan record stays the single
  routing surface; `classifyChatMode` is demoted to fallback, not duplicated.
  Spec deltas MODIFY the three existing chat-routing requirements rather than
  adding rival ones.
