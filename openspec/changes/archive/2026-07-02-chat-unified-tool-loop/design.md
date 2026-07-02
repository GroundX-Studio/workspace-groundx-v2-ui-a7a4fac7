## Context

`routeChat` (middleware/src/services/chatRouter.ts) classifies each turn into
`rag` / `structured` / `hybrid` from `modeFromIntent` → light-LLM `planTurn`
(`appState`×`documentSearch`) → keyword `classifyChatMode` fallback. The three
modes have **different capabilities**:

- `rag` → `runRagPipeline` → `callGroundedLlm`: search + grounded answer **+ the
  full tool catalog advertised/routed** (nav, action, propose, pin…).
- `structured` → `runStructuredQuery`: deterministic DB/Partner lookups for a
  fixed topic list; **no LLM, no tools**.
- `hybrid` → `runHybridQuery`: grounded answer over scope with a workspace-state
  `structuredContext` block; **tools deliberately NOT passed** ("any emitted calls
  would be dropped").

The grounded tool-loop, the tool catalog (`SERVER_TOOL_CATALOG` ↔ app `*.tools.ts`
mirror, parity-guarded), `groundedAnswerOverScope`, and streaming already exist.
The workspace-state block is small and already assembled by `hybrid`.

The defect: capability is a function of the mode guess. A phrasing the planner
sends to `hybrid`/`structured` loses navigation entirely. This is the fork that
principle 1 warns against — a cross-product of (content-source × capability)
instead of one mechanism with an orthogonal context axis.

## Goals / Non-Goals

**Goals:**
- Navigation/action tools reachable on **every** user-facing chat turn, regardless
  of the planner's content-source guess.
- Adding a widget/intent = one catalog entry, reachable from chat with no router or
  planner change.
- App-state answers ("where am I", saved counts, projects, keys) still work — as
  always-on context + reader tools, not a separate capability tier.
- Preserve the streaming envelope contract and the deterministic-lookup latency win.

**Non-Goals:**
- No change to the public `POST /api/chat/messages` request/response shape.
- Not removing the light-LLM planner — only demoting it to context-preload flags.
- Not redesigning the tool catalog or the citation/verification pipeline.
- Not touching the progressive-report-render work (separate change).

## Decisions

**D1 — One grounded tool-loop is the single answer path.** `structured` and
`hybrid` fold into `runRagPipeline`/`callGroundedLlm`. There is one place that
answers a user turn, and it always advertises + routes the tool catalog.
*Alternative considered:* also advertise tools on the `hybrid` path but keep three
modes. Rejected — it keeps the fork (three code paths to keep in sync) and the
"which mode am I" guess still decides whether workspace context is present; the
brittleness just moves. Collapsing removes the cross-product.

**D2 — App-state is context, not a mode.** The small block (active entity, journey
stage + active step, saved-schema count, recent ~5 viewer events) is assembled on
every turn and passed as `structuredContext` to `buildGroundedSystem` (the seam it
already accepts). Cost is a few hundred tokens + the DB reads `hybrid` already does.
*Alternative:* make app-state a tool the model fetches. Rejected for the *small
always-relevant* block — it's cheap and near-always useful, so preloading beats a
round-trip. (Live-fetch app-state is the exception — D3.)

**D2a — Extract the app-state assembly (don't fork).** The workspace-state block is
built INLINE inside `runHybridQuery` (`structuredHandler.ts:456-499`) and depends on
`getChatSession` / `listChatSessionEntities` / `listViewerEvents` / `groundxUsername`.
D2 is therefore an EXTRACT-then-call refactor: pull it into a shared helper both the
chat loop and (transitionally) any remaining caller invoke. `runRagPipeline`'s session
deps (`repository`, `chatSessionId`, `groundxUsername`) are OPTIONAL on
`ChatRouterDeps`; when absent, the helper SHALL omit the block (anonymous/no-session
degrade), never throw.

**D3 — ALL account/workspace lookups become reader tools (one path — Q2 decision).**
Projects, API keys (Partner API) AND pages-remaining / saved-schemas (DB) become
`read`-category `serverExecute` tools, mirrored app↔middleware. The model calls them
on demand. The EXISTING readers `answerMyProjects` / `answerApiKeys` (and the
pages/schemas answerers) are MOVED INTO these tools' `serverExecute` — one Partner/DB
fetch + redaction implementation, not two (principle 6). API key values stay name +
last-4 only.

**D4 — The planner is REMOVED, not demoted (Q1 decision).** There is no separate
pre-flight classifier. Its "should I search / load product knowledge" judgment moves
into the loop: `search_documents` + `lookup_groundx_knowledge` are tools the model
calls, and the loop runs ONE cheap default document search up front so the common
document question answers in a single round-trip. `planTurn`, `chatClassifier`, the
`RoutePlan`/`appState` derivation, and the CLASSIFIER_DECIDES path are all deleted.
*Alternative considered:* keep the planner demoted to context-preload flags. Rejected
per Q1 — the planner traded a light-LLM call to *maybe* skip a cheap GroundX search;
net it rarely wins on latency and it's another component to keep correct. Dissolving
it into tools + a default search gets both simplicity and one-round-trip efficiency.
*Trade-off:* a pure greeting/product turn does one cheap wasted document search; the
model ignores irrelevant snippets and we save the planner call.

**D5 — No deterministic shortcut (Q2 decision).** There is no no-LLM fast-path;
account questions go through the loop via the D3 reader tools. Simplest, one code
path, most composable. *Trade-off:* "pages remaining" now costs one LLM round-trip
(~1-2s) where it was instant; accepted for the one-path win.

**D6 — `reply.mode` semantics.** The envelope keeps the `mode` field for back-compat;
every user-facing turn runs the loop and reports `mode: "rag"`. `"structured"` /
`"hybrid"` are no longer produced. Verified safe: nothing in `app/src` branches on
`reply.mode === "hybrid"|"structured"` (only an unrelated `resolution.mode` in
`PinToReportAction`). Keep the enum value(s) in the wire schema for one release.

## Risks / Trade-offs

- **[Always-advertising the catalog costs tokens on former structured/hybrid turns]**
  → the catalog is ~10-15 tools; the `rag` path already pays this every turn today.
  Net new cost applies only to the minority of turns that were structured/hybrid.
  Acceptable; measure before/after.
- **[More turns can now emit tool calls → risk of spurious navigation]** → the
  grounded prompt already gates tool use ("call a nav tool only when the user asks
  to go somewhere"); reuse it. Add a corpus test that content questions don't
  spuriously navigate.
- **[Removing `hybrid`/`structured` regresses a consumer that branches on mode]**
  → verified: nothing in `app/src` reads `reply.mode === "hybrid"|"structured"`
  (only `PinToReportAction`'s unrelated `resolution.mode`). Still keep `mode` in the
  envelope + migrate hybrid's `show-extract`/`try-chat` chips into the loop's
  suggested-action path before deleting `runHybridQuery` (principle 7).
- **[No planner → every turn does a document search, wasting a search on greetings/
  product turns]** → GroundX search is sub-second and the model ignores irrelevant
  snippets; the deleted planner call offsets it. Measure before/after; if a cheap
  non-LLM heuristic later proves worth it, it's an optimization, never a gate.
- **[Two Partner-fetch implementations if the old readers aren't consolidated]** →
  D3 MOVES `answerMyProjects`/`answerApiKeys` into the reader tools' `serverExecute`;
  a task asserts no residual duplicate reader (principle 5/6).

## Migration Plan

1. Add the account reader tools + `search_documents`/`lookup_groundx_knowledge` tools
   (D3, D4), extract + always-inject the app-state context helper (D2, D2a) on the
   `rag` loop — behavior-additive, no mode/planner change yet. Ship + verify.
2. Route former `hybrid` turns through the loop (D1); migrate its chips; delete
   `runHybridQuery`.
3. Remove the planner + keyword classifier (D4) and the `structured` mode / dead-end
   (D5); consolidate the old account readers into the reader tools; add the default
   up-front search. Verify account questions answer + no dead-end + nav works on
   every phrasing.
4. Update `docs/agents/architecture.md` + `chat-session-model.md`; drift guards green.

Rollback: each step is independently revertable; step 1 is additive and safe to ship
alone. The public endpoint contract is invariant throughout.

## Open Questions

- None blocking. (Planner fate = removed per Q1; account-lookup path = one-path/reader
  tools per Q2; FE mode-branching = verified none.) Concurrency vs the report-render
  change: different `groundedAnswerOverScope` callers — serialize per
  `cross-plan-execution-order.md` if built at the same time.
