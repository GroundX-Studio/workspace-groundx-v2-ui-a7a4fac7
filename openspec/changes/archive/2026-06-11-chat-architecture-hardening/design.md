# Design — chat architecture hardening

Decisions locked with the user (2026-06-11 brainstorm): T1 catalog-drift fix INCLUDED;
hybrid FULL-MERGE into the grounded seam; retrieval gating via an **LLM turn
router** (not a lexicon, not IDF) with an extensible decision set.

## 1. Prompt module (Task 2)

`middleware/src/services/prompts/` becomes the only place model-facing prompt
text lives:

```
prompts/
  fragments.ts    VOICE_RULE, CITATIONS_CONTRACT, snippetHeader(s, i)
  grounded.ts     buildGroundedSystem({extraction?, skillKnowledge?, structuredContext?, tools…})
  turnRouter.ts   buildTurnRouterPrompt(question, ctx)   (Task 4)
  extractor.ts    buildExtractorPrompt(field, snippets)  (moves from fieldExtractor)
  summarizer.ts   buildChunkSummaryPrompt / buildMetaSummaryPrompt (move as-is)
  README.md       inventory of every model-facing prompt + the test pinning each
```

Rules: a consumer service imports builders/fragments — inline prompt strings in
service files become a review smell. Existing prompt-shape tests move with the
builders; each prompt has at least one pinning test, listed in the README.

## 2. Hybrid full-merge (Task 3)

`GroundedAnswerOptions` gains `structuredContext?: string` — a pre-composed
block (active entity, last frames, recent viewer events, saved counts) the
grounded system prompt includes under a "WORKSPACE STATE (private context)"
section with the same never-expose voice framing. `runHybridQuery` composes the
block from the SAME readers it uses today, then calls `groundedAnswerOverScope`
— becoming its third caller (chat, report, hybrid). `HYBRID_SYSTEM_PROMPT` is
deleted. **Accepted behavior change:** hybrid replies gain quote-verified
citations and the no-invented-citations contract (previously loose "quote short
phrases" guidance). The hybrid reply keeps `mode: "hybrid"`.

Two shipped hybrid behaviors the merge must handle explicitly:
- **No double search.** `chatRouter` currently runs `searchGroundX` for hybrid
  and hands `ragSnippets` in; `groundedAnswerOverScope` searches internally.
  Task 3 DELETES the router-level hybrid search — the seam's single search is
  the only one.
- **Degraded paths, split correctly (per today's actual behavior).** Today
  no-groundx-client and search-failure still produce an LLM-composed answer
  (the router proceeds with empty snippets); only a missing LLM client takes
  the deterministic formatter. The merge preserves that split: (a)
  no-groundx-client / search-failure → the grounded seam runs with EMPTY
  snippets (LLM prose preserved); (b) no LLM client **or no model id**, and
  grounded-seam LLM failure (non-2xx / throw / empty answer — Task 3 wraps
  the seam call) → the deterministic structured fallback, now SNIPPET-LESS
  (the router search that fed its preview/citations is deleted — accepted
  change, pinned by test). No prompt is involved on path (b), so "no separate
  hybrid system prompt" holds.
- **Reply envelope pinned.** Hybrid passes `tools: undefined` to the seam (no
  tool advertising; any `toolCalls` field stays absent — no silent drops);
  the merged reply KEEPS the existing `suggestedActions` seeding
  (`show-extract`, `try-chat`) and ADDS the citations-gated "Show all
  sources" chip exactly as chat does.
- **Hybrid's turn plan is FIXED** at `{documentSearch: true, productKnowledge: false}`
  — `classifyChatMode` already routed the turn (no second classification),
  and workspace-state questions don't need product knowledge.

## 3. LLM turn router (Task 4) — the user-directed design

A pre-retrieval classification step using the LIGHT model (CF-16
`lightLlmClient`). The planner runs ONLY when a light client is configured —
it never borrows the main chat client (no main-model latency tax); an absent
light client takes the deterministic fallback:

```ts
// shared decision record — THE extensibility axis. Add a scenario = add a flag.
const turnPlanSchema = z.object({
  documentSearch: z.boolean(),    // run searchGroundX?
  productKnowledge: z.boolean(),  // run skillsRetrieve?
}).passthrough();                  // unknown future flags tolerated, ignored
type TurnPlan = z.infer<typeof turnPlanSchema>;

planTurn(question, deps): Promise<TurnPlan>
```

- Implemented as ONE cheap completion with a strict-JSON prompt (built in the
  prompts module), `temperature` low, ~200ms-1s budget with an abort timeout.
- **Gate composition (explicit):** the retriever has no boolean keyword gate —
  injection today is decided by section scoring (`distinct >= minDistinct &&
  score >= 2`, with STRONG_TRIGGERS merely lowering `minDistinct` to 1). So
  the consumed plan value is `productKnowledge: boolean | "retriever-decides"`
  (the LLM still emits a plain boolean; the sentinel is internal). `true` =
  run retrieval with the minDistinct/score ENTRY BAR bypassed (section ranking
  + caps remain; nothing injects only when the pack is missing or no section
  scores at all). `false` = skip retrieval entirely. `"retriever-decides"` =
  run `retrieveGroundxKnowledge` with its internal gate intact — never
  replicate the scoring in the router (that would fork the retriever).
- **Deterministic fallback** — on missing light client, timeout, parse failure,
  or schema failure: `{ documentSearch: true, productKnowledge: "retriever-decides" }`.
  The fallback path is byte-for-byte today's behavior because it delegates the
  decision to the unmodified retriever (planned paths intentionally are not —
  that's the S1 fix). The fallback IS the test-determinism story: unit/corpus
  tests inject a fake planner or rely on the fallback.
- Plumbing: `lightLlmClient` already arrives at `chatHandler` deps (CF-16);
  Task 4 threads it (and the light model id) into the grounded-answer deps the
  same way `skillsRetrieve` is threaded today.
- `groundedAnswerOverScope` consumes the plan: skips `searchGroundX` when
  `documentSearch` is false (product questions stop paying the SEARCH call —
  the unconditional extraction fetch still fires on documents scopes until
  the deferred `extractionContext` flag exists — and cannot acquire snippets
  → zero citations, consistent with the citations contract); skips
  `skillsRetrieve` when `productKnowledge` is false (document questions stop
  paying 3-4.5KB of irrelevant skill content — the S1 fix).
- Injectable seam: `deps.planTurn?` mirrors `skillsRetrieve`/`wordMapFetch`.
- **Report caller:** `reportRenderer` (the seam's second caller) passes the
  fixed plan `{documentSearch: true, productKnowledge: false}` — report
  sections never inject GROUNDX KNOWLEDGE (intentional change: today's
  `skillsRetrieve` default fires on the report path too).
- **Classifier ban scope:** "never a parallel classifier" applies to
  RETRIEVAL-PLANNING decisions. The existing keyword `classifyChat` mode
  router stays (carved out explicitly); its subsumption is the named future
  `appState` flag, not built here.
- Future flags (named, NOT built): `extractionContext` (gate the extract
  fetch), `appState` (could subsume the keyword `classifyChat` router). The
  record's `.passthrough()` + per-flag consumption means adding one is local.

Corpus cleanup rides along: `sync-groundx-skills.mjs` stops copying
`ROUTING.md` + `CHANGELOG.md` (and the loader skips them defensively).

## 4. Toggle helper (Task 5)

```ts
// orchestrator-local util; the compared slot is the config axis
function togglesOffOnRepeat<T>(source, activeStep, current: T | undefined, incoming: T): boolean
```

Both `highlightCitation` (compares `{page,bbox}`) and `showCitations` (compares
`litRegions`) call it. Pure refactor: the existing four toggle tests must pass
UNCHANGED — that is the review gate.

## 5. Tool-guidance dedup (Task 6)

The grounded prompt's hand-written `propose_schema_field` / `suggest_intent`
paragraphs are replaced by a generated "TOOL NOTES" section derived from the
catalog entries' own `description` (+ a new optional `promptGuidance` field on
`ServerTool` for the few tools needing more than their description — guidance
declared WITH the tool, not in the prompt). `fieldExtractor` adopts
`snippetHeader()` from the prompts module.

## 6. Full-shape catalog parity (Task 7) — revised by adversarial review

The original "generated JSON manifest via a tsx script" idea was killed by the
plan review: (a) `app/src/tools/catalog-parity.test.ts` records a
**gate-answered decision (2026-05-31): NOT a committed manifest** — the app
catalog is assembled via Vite's `import.meta.glob`, which only resolves under
the Vite runner, so an out-of-band `scripts/*.mjs` generator cannot load the
`*.tools.ts` files (they use `@/` aliases + `@groundx/shared`); (b) that parity
test ALREADY compares name + role + verbatim description. The stale
`toolCatalog.ts` header note promising a manifest "past ~10 tools" is the older
of the two conflicting records and loses.

So Task 7 = **extend the existing cross-package parity guard to full shape**:

- Add `category`, `availableSteps`, and input-schema comparison (both sides
  rendered to JSON-Schema via the middleware's `zodToJsonSchema`, imported
  cross-package exactly like `SERVER_TOOL_CATALOG` already is).
- Failure messages name the tool AND the drifted field.
- Retire the duplicated hand-pinned `EXPECTED_NAMES` list in
  `middleware/src/services/toolCatalog.test.ts` only if it is fully subsumed;
  otherwise keep it as the middleware-local smoke (no Vite dependency).
- Replace the `toolCatalog.ts` header's stale manifest promise with the actual
  mechanism ("parity guard in app/src/tools/catalog-parity.test.ts is the
  drift gate; no manifest by gate-answered decision").

## 7. Spec deltas (Task 1) — summary

- PREREQ: archive the completed `groundx-knowledge-prompt` change first; its
  skill-knowledge requirement is then RENAMED + MODIFIED here (keyword routing
  → turn-plan gating), resolving the in-flight collision.
- `chat-routing` MODIFIED: "RAG citations SHALL be claim-level…" — ambient no
  longer includes an "all-snippets fallback"; new scenario: uncited answer ⇒
  zero citations. Skill-knowledge requirement (renamed): vendored pinned pack,
  section retrieval, caps, **one-shot constraint recorded**, lookup-tool named
  as evolution, planner-replaces-keyword-gate composition.
- `chat-routing` ADDED: extraction-context block; voice rules
  (internal-vocabulary ban on every user-facing prompt, single-sourced
  fragment); LLM turn router (decision record, light-client-only planning,
  deterministic fallback, extensibility); hybrid-merge (one grounded seam).
- `agent-tools` MODIFIED/ADDED/REMOVED: tool guidance single-sourced from tool
  declarations; catalog parity upgraded to full shape (no manifest — the
  cross-package guard is the mechanism, per the gate-answered decision); the
  stale "names and roles" requirement REMOVED as subsumed.

## Testing map

| Task | RED-first test |
|---|---|
| 2 | prompt-shape tests fail against the module until builders return the assembled prompts; grep-style guard: no `VOICE:` literal outside prompts/ |
| 3 | hybrid router test asserting the LLM body is built by the grounded builder w/ structuredContext + citations machinery applied |
| 4 | planner unit tests (fake light client: JSON good/garbage/timeout → plan/fallback); groundedAnswer tests: plan {false,true} skips search, {true,false} skips skills; probe-derived regression: "what is the meter number?" with a planner returning {true,false} injects no skill text |
| 5 | existing toggle tests stay green (the refactor's gate); new unit for the helper |
| 6 | prompt contains TOOL NOTES derived from catalog descriptions; literal paragraphs gone |
| 7 | extended parity guard fails RED on the currently-uncompared fields (category/steps/schema) if any drift exists; mutation test proves it bites |
