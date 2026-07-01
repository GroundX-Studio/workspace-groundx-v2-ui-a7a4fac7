## 1. Always-on tools + app-state context + reader tools (additive — safe to ship alone)

- [ ] 1.1 SEQUENTIAL — Failing user-visible test first: a nav command ("switch to the report view") navigates on a turn that today misroutes to hybrid; assert the report nav intent is emitted and no "I don't have that control" reply. (principle 2)
- [ ] 1.2 SEQUENTIAL — EXTRACT the workspace-state assembly out of `runHybridQuery` (`structuredHandler.ts:456-499`) into a shared helper; inject its output as `structuredContext` on the rag loop for every turn. When session deps (`repository`/`chatSessionId`/`groundxUsername`, all OPTIONAL on `ChatRouterDeps`) are absent, the helper omits the block — never throws. (D2, D2a; principle 1 "no fork")
- [ ] 1.3 SEQUENTIAL — Add `list_projects` / `list_api_keys` / `pages_remaining` / `saved_schemas` reader tools (`read`, `serverExecute`) to the middleware catalog AND the app `*.tools.ts` mirror; parity guard green; keys name + last-4 only. CONSOLIDATE the existing `answerMyProjects` / `answerApiKeys` (and pages/schemas) fetch+format INTO these tools — no duplicate implementation. (D3; S1; principle 6)
- [ ] 1.4 SEQUENTIAL — Add `search_documents` + `lookup_groundx_knowledge` tools + a default up-front document search on the loop, so a document question answers in one round-trip. (D4 — the planner's replacement)
- [ ] 1.5 SEQUENTIAL — Confirm the always-advertised catalog still runs through `toolsForStep(stepKind, callerRole)` (role+step filter preserved); add a test that a step/role-restricted tool is NOT advertised out of scope. (N4)
- [ ] 1.6 SEQUENTIAL — toolLoopCorpus test: a content question does NOT spuriously call a nav tool now that the catalog is always present. Assert via tool-call inspection, not timing. (N2-style determinism)
- [ ] 1.7 GATE — Adversarial review of group 1 against code: catalog parity green, no secret leak in key reader, single reader per fact (no duplicate), context-block token cost measured, build + drift guards green. (principle 3)

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
