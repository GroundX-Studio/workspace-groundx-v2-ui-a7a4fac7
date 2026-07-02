## Why

Chat navigation is fragile in a way that gets worse with every widget we add.
The router picks one of three modes (`rag` / `structured` / `hybrid`) from a
fuzzy light-LLM guess, and the widget/action **tools are advertised on the `rag`
path only**. So whether "take me to the extracted fields" works depends entirely
on the planner routing that phrasing to `rag`; routed to `hybrid` (deliberately
tool-less) the model *can't* navigate and answers "I don't have that control
here", while "show me the report" routes to `rag` and works. Confirmed live
(2026-07-01): the failing turn returns `mode: "hybrid"` with no tools. Because
every nav/action tool lives behind one mode, any misroute strips **all** of them
at once, and the misroute surface grows with the catalog. Per-phrasing planner
prompt-tuning is whack-a-mole and never converges.

The fix is to stop coupling *capability* to a *content-source guess*: navigation
is orthogonal to where an answer's content comes from.

## What Changes

- **One grounded tool-loop is the only answer path.** `structured` and `hybrid`
  collapse into it; it always advertises + routes the tool catalog (through the
  existing `toolsForStep(stepKind, callerRole)` role+step filter — the filter is
  preserved, not bypassed).
- **The separate turn planner is removed.** Its "should I search / load product
  knowledge" judgment moves INTO the loop: `search_documents` and
  `lookup_groundx_knowledge` become tools the model calls, plus a cheap default
  document search up front so the common document question still answers in one
  round-trip. No pre-flight classifier to misroute.
- **App-state becomes always-on context, not a mode.** The small "where you are"
  block (active entity, journey stage + active step, saved-schema count, recent
  viewer trail) is injected as grounded `structuredContext` on every turn. This
  assembly is EXTRACTED from `runHybridQuery` into a shared helper (no fork).
- **All account/workspace lookups become reader tools (one path).** Pages
  remaining, saved schemas, projects, API keys are answered via reader tools
  through the one loop — the deterministic no-LLM shortcut is REMOVED. The
  existing `answerMyProjects` / `answerApiKeys` (and pages/schemas) readers are
  CONSOLIDATED into those tools' `serverExecute` (no duplicate Partner-fetch).
- **BREAKING (internal):** the `structured` / `hybrid` modes, the light-LLM
  planner, and the keyword `classifyChatMode` are deleted. The public `POST
  /api/chat/messages` envelope is unchanged; `reply.mode` reports `"rag"` for the
  single answer path (no consumer branches on the old values — verified: nothing
  in `app/src` reads `reply.mode === "hybrid"|"structured"`).
- Adding a widget/intent becomes: **add one entry to the shared tool catalog** —
  no router branch, no planner phrasing, works on every turn.

## Conformance to core architectural decisions

- **Principle 1 (composable over forked):** this REMOVES a fork — three
  capability-tiered modes + a classifier collapse into one mechanism (the grounded
  tool-loop) with orthogonal *value* axes (a tool in the catalog; context injected).
  A new widget is a new catalog value, not a new branch. No new abstraction is
  introduced without a caller: the reader tools have a real caller (the model);
  the extracted app-state helper has two real callers (chat + the deleted hybrid's
  behavior it absorbs).
- **Principle 5 (done = user-visible + no orphans):** the deterministic readers are
  consolidated INTO the reader tools (no dead `answerMyProjects` left); the mode
  fork + planner + keyword classifier are deleted, not left dormant. User-visible
  test: a nav command navigates regardless of phrasing.
- **Principle 6 (one source of truth):** each account fact has ONE reader (the
  tool); the tool catalog stays the single source, mirrored app↔middleware under
  the parity guard.

## Impact

- `middleware/src/services/chatRouter.ts` (mode fork + planner routing deleted),
  `structuredHandler.ts` (hybrid/structured removed; app-state helper extracted;
  Partner readers moved into reader tools), `ragPipeline.ts` / `groundedAnswer.ts`
  (single tool-loop always carries the catalog + injected app-state context;
  default up-front search), `prompts/turnRouter.ts` + `chatClassifier.ts` (deleted),
  `toolCatalog.ts` + app `*.tools.ts` mirror (search/knowledge/account reader tools,
  both sides).
- Tests: `chatRouter.test.ts`, `structuredHandler.test.ts`, `toolLoopCorpus.test.ts`,
  `catalog-parity.test.ts`, plus new user-visible tests that a nav command navigates
  regardless of phrasing.
- Docs: `docs/agents/architecture.md`, `docs/agents/chat-session-model.md`.
- Cross-plan: touches the shared `groundedAnswerOverScope` chat caller; `progressive-report-render`
  touches its report caller. Different callers (low collision) but SERIALIZE per
  `docs/agents/cross-plan-execution-order.md` if implemented concurrently.
- No DB schema change. No public API shape change.
