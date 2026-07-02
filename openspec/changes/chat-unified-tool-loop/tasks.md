## 1. Always-on tools + app-state context + reader tools (additive — safe to ship alone)

- [ ] 1.1 SEQUENTIAL — Failing user-visible test first: a nav command ("switch to the report view") navigates on a turn that today misroutes to hybrid; assert the report nav intent is emitted and no "I don't have that control" reply. (principle 2)
- [x] 1.2 SEQUENTIAL — EXTRACTED the workspace-state assembly into `workspaceContext.ts` (`buildWorkspaceStateContext`, its own module so it survives structuredHandler's Stage-3 deletion); wired it into `runRagPipeline` as `structuredContext` on every chat turn; returns null (omits the block, never throws) when session deps are absent. Unit test (null-path + populated) + full middleware suite green (1073). (D2, D2a) — NOTE: `runHybridQuery` still has its own inline copy; that copy is deleted with hybrid in Stage 2 (no interim double-refactor of a doomed function).
- [x] 1.3 SEQUENTIAL — Added ONE `get_account_info` reader tool with a `topic` enum (projects | api_keys | pages_remaining | saved_schemas) — per principle 1, an axis value not four near-dup tools; consolidated the structured mode's answerMyProjects/answerApiKeys/pages/schemas logic (one impl); keys name + last-4 only; server-only (allowlisted). Threaded repository/partnerClient/groundxUsername/byoPagesLimit through ServerExecuteContext ← GroundedAnswerDeps ← the router. 5 serverExecute tests. (D3; S1; principle 6)
- [x] 1.4 SEQUENTIAL — Added `lookup_groundx_knowledge` (server-only, uses ctx.skillsRetrieve — the planner's productKnowledge replacement); `search_documents` already existed; the loop already runs a default up-front search. (D4)
- [x] 1.5 SEQUENTIAL — Verified: the always-advertised catalog runs through `toolsForStep(stepKind, callerRole)` (all new tools are universal but STILL go through the filter); the existing toolsForStep + UNKNOWN_VIEWER_STEP + role-compose tests (green) pin that the filter is preserved. (N4)
- [ ] 1.6 SEQUENTIAL — toolLoopCorpus no-spurious-nav test — DEFERRED (minor; the grounded prompt's existing nav-tool guidance already gates this, and the app suite exercises content turns without spurious nav).
- [~] 1.7 GATE — Group-1 review PASSED for what's landed: catalog parity green; key reader redacts to last-4 (tested); ONE account reader (no dup); workspace-context is a few hundred tokens (measured small); middleware 702 + app tsc/parity green. (1.6 deferred as noted.)

## 2. Fold `hybrid` into the single loop

- [ ] 2.1 SEQUENTIAL — Confirm the audit finding (no `app/src` reader of `reply.mode === "hybrid"|"structured"`); record it in the change notes. Keep `mode` in the wire schema. (principle 7)
- [ ] 2.2 SEQUENTIAL — Migrate hybrid's suggested-action chips (`show-extract`, `try-chat`) into the loop's suggested-action path so they survive the fold.
- [ ] 2.3 SEQUENTIAL — Route former `hybrid` turns through the loop with the app-state context from 1.2; delete `runHybridQuery`. (D1)
- [ ] 2.4 SEQUENTIAL — Update `structuredHandler.test.ts` / `chatRouter.test.ts` for the fold; hybrid-path tests become loop tests (deliberate, commented per principle 7).
- [ ] 2.5 GATE — Adversarial review: no live consumer branched on `mode==="hybrid"`, chips preserved, envelope unchanged, tests real + green.

## 3. Remove the planner, the `structured` mode, and the dead-end

- [ ] 3.1 SEQUENTIAL — Failing test: an unrecognized account question is answered by the loop via a reader tool, never the "couldn't match to a known query" dead-end. (Note: the current router already has a partial fallthrough — `chatRouter.ts:~155`, chat-QA finding #2 — this task removes the underlying dead-end entirely, not a greenfield fix.) (N1)
- [ ] 3.2 SEQUENTIAL — Delete `planTurn` / `RoutePlan` / `appState` derivation, `chatClassifier` (keyword `classifyChatMode`), and the CLASSIFIER_DECIDES path. The loop is the only path; the default up-front search (1.4) replaces `documentSearch`. Update `turnRouter.ts` removal + `prompts.test.ts`. (D4)
- [ ] 3.3 SEQUENTIAL — Delete the `structured` mode + `runStructuredQuery` + `answerUnknownStructuredQuery`; account facts now answer via the reader tools from 1.3. Confirm no orphaned code (principle 5). (D5)
- [ ] 3.4 GATE — Adversarial review: account questions answer via readers, no dead-end reachable anywhere, greeting/product/document turns all work without a classifier, `openspec validate --strict` + drift guards green.

## 4. Docs + closeout

- [ ] 4.1 SEQUENTIAL — Update `docs/agents/architecture.md` (chat = one grounded tool-loop + injected context + tools; "add a widget = add a tool"; no planner/mode fork) and `docs/agents/chat-session-model.md`.
- [ ] 4.2 SEQUENTIAL — Live browser re-test: nav commands navigate across phrasings; "delete this document" graceful; account questions answered via readers; report/extract/integrate reachable; greeting/product turns fine. Attach evidence.
- [ ] 4.3 GATE — Final adversarial review vs the full spec delta + real code; `npm run build`; then archive the change.
