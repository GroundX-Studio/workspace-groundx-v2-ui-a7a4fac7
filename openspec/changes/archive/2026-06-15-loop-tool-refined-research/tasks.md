# Tasks — loop-tool-refined-research

Picked up 2026-06-15 (split out of `agentic-tool-loop`'s deferred list).

- [x] **T1 — Failing user-visible test first** (discipline §1).
  Added "re-runs the SCOPED search with the refined query, same RBAC filter, and
  feeds snippets back" to `toolLoopCorpus.test.ts` at the `groundedAnswerOverScope`
  seam: the scripted model calls `search_documents` with a refined query;
  asserts a SECOND scoped search ran with that query AND an identical `filter` to
  the primary (no widening), the loop re-called the model, and the tool is
  server-executed (toolActivity, never a routed toolCall). Confirmed RED — only
  the primary search ran because the tool didn't exist.

- [x] **T2 — Implement per proposal + spec delta.**
  `ServerExecuteContext` gains `researchDocuments(refinedQuery) => Promise<string>`
  (`toolCatalog.ts`). New `search_documents` server-executed `read` tool
  (serverExecute + activityLabel, no intentBuilder) added + registered in
  `SERVER_TOOL_CATALOG`. `groundedAnswerOverScope` binds `researchDocuments` to
  the TURN's `scope` + `searchOptions` (same `rbacFilter`) and re-runs
  `searchGroundX`; a small bounded local formatter (`formatResearchSnippets`,
  4000-char cap, reuses `RAG_SNIPPET_CHARS`) formats the result — deliberately
  NOT `buildSnippetBlock` (avoids a ragPipeline↔groundedAnswer import cycle).
  - ↳ Review: model supplies only `query`; scope/filter are captured, never
    model-settable → cannot widen scope. New test GREEN.

- [x] **T3 — Drift guards + adversarial review; validate --strict; suites green.**
  Updated EXPECTED_NAMES + the two per-step lists (toolCatalog.test.ts), the
  chatRouter universal-tools list, and the app parity `SERVER_ONLY` set.
  - ↳ Review: spec conformance + no-scope-widening (structural) + composable
    (new axis value, no framework) + edge cases (no client / empty / bad args /
    cap) + no import cycle + no dormant plumbing. middleware 957, app 1750 green;
    production build (tsc all workspaces) clean.

- [x] **T4 — Independent adversarial review (post-archive, 2026-06-15).**
  Two fixes: (1) re-search reused the full `searchOptions`, clobbering the
  primary search's SINGULAR `debug.groundx` accumulator → now passes filter-only
  options (RBAC filter preserved, debug untouched). (2) the no-widening test
  could pass vacuously (`undefined===undefined`) and never asserted the
  `documents` scope's `documentIds` → now asserts the explicit non-empty filter
  AND `documentIds` parity. Spec requirement unchanged (implementation/test
  hardening). middleware 957 green; build clean.

- [x] **T5 — Second independent adversarial review ("fresh scan", 2026-06-15).**
  Two more fixes: (1) `formatResearchSnippets` had an UNREACHABLE fallback branch
  (per-snippet cap 600 ≪ total cap 4000 ⇒ the first entry always fits, so
  `entries` is never empty) → simplified to always include the first snippet and
  drop the dead `else`. (2) the test asserted the loop re-called + body contains
  "1.5%" but NEVER verified the re-search snippets reached the model (the scripted
  prose says "1.5%" regardless) → now asserts the round-2 LLM request carries a
  role:"tool" message whose content is the formatted re-search result. middleware
  957 green; build clean.
