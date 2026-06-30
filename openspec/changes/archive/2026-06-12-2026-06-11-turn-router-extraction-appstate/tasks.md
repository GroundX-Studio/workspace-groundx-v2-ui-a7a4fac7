# Tasks — turn-router `extractionContext` + `appState`

Execution is SEQUENTIAL throughout (every task touches the same router/seam
files; no independent fan-out units). Every task ends with its adversarial
review gate (principle 3): falsify each claim against the real code, open the
test file (real + green + not retargeted), `npm run build` + drift guards
green, no dormant plumbing.

## 1. `extractionContext` — record + gate (SEQUENTIAL)

- [x] 1.1 **Failing tests first:** (a) turnRouter.test — `planTurn` parses
      `extractionContext`, omitted flag normalizes to `true`,
      `FALLBACK_TURN_PLAN.extractionContext === true`; (b)
      groundedAnswer.test — with plan `{documentSearch: true,
      productKnowledge: false, extractionContext: false}` the injected GroundX
      client receives NO `/ingest/document/extract/*` request and the LLM call
      carries no extraction block; with `extractionContext: true` the fetch
      runs as today.
- [x] 1.2 Implement: extend `turnPlanSchema` (`z.boolean().optional()`),
      `TurnPlan`, `FALLBACK_TURN_PLAN`, the planner's normalization; gate the
      `fetchDocumentExtraction` call in `groundedAnswerOverScope` on
      `plan.extractionContext !== false`.
- [x] 1.3 Extend the two fixed-plan literals (`structuredHandler.ts` hybrid,
      `reportRenderer.ts` report) with `extractionContext: true`; add the
      coherence assertions to their existing tests (extraction still fetched,
      planner never called).
- [x] 1.4 Update `buildTurnRouterPrompt` to the three-flag shape — this task
      ships the `extractionContext` definition + true-when-unsure bias line
      (`appState` lands in 2.3) — with its failing prompt test first.
- [x] 1.5 **Adversarial review gate** for Task 1 (incl.: prove the `false`
      path makes zero extract HTTP calls, not just an empty block; prove
      fallback path unchanged byte-for-byte against the pre-change tests).

## 2. `appState` — record + mode subsumption (SEQUENTIAL, after 1)

- [x] 2.1 **Failing tests first:** (a) turnRouter.test — `appState` parses;
      omitted → `CLASSIFIER_DECIDES`; `FALLBACK_ROUTE_PLAN.appState ===
      CLASSIFIER_DECIDES` and `FALLBACK_TURN_PLAN` is the same plan minus
      `appState`; sentinel not emittable by model output; (b)
      chatRouter.test — mode-derivation table (`appState`×`documentSearch` →
      structured/hybrid/rag), sentinel → `classifyChatMode` parity over the
      classifier's existing fixture set, intent-hinted request routes with
      ZERO planner calls (spy), planned rag turn makes AT MOST ONE planner
      call end-to-end (spy across router + seam); (c) planner-routed
      structured/hybrid with missing `repository`/`chatSessionId` degrades to
      rag running `FALLBACK_TURN_PLAN` (search on — NOT the planner's
      `documentSearch: false` plan; no throw); keyword/intent-routed keeps
      throwing; (d) type-level: the route plan type requires `appState`, and
      fixed-plan/fallback LITERALS typed as the seam plan reject it via
      excess-property checks (structural typing can't forbid it on non-literal
      values — the router's explicit strip is the runtime guarantee).
- [x] 2.2 Implement: `CLASSIFIER_DECIDES` sentinel + the `RoutePlan` type
      (`TurnPlan` + required `appState`; `TurnPlan` itself stays
      `appState`-free — fixed seam plans cannot carry it);
      hoist planning into `routeChat` (intent-hint fast path → mode without
      planner; else one `planTurn` call → mode derivation → thread the plan to
      `runRagPipeline` via `options.turnPlan`); `runRagPipeline` accepts and
      forwards a pre-computed plan.
- [x] 2.3 Extend `buildTurnRouterPrompt` to the final four-flag shape with the
      `appState` definition + false-when-unsure bias (failing prompt test
      first).
- [x] 2.4 **Adversarial review gate** for Task 2 (incl.: prove
      `classifyChatMode` keyword steps are unreachable when the planner
      answered — no double-classification; prove fallback routing is
      byte-for-byte `classifyChatMode`; prove report/hybrid paths never
      construct a planner).

## 3. Closure (SEQUENTIAL, after 2)

- [x] 3.1 Full middleware suite + `npm run build` + drift guards.
- [x] 3.2 `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all
      --strict` green; no delta vs shipped behavior left undocumented.
- [x] 3.3 Live probe with the light model configured: small-talk turn (no
      extract fetch in debug), "how many pages do I have left on my plan?"
      (routes structured), "what is the meter number?" (rag, extraction
      present). Record results in the change before archive.
      **RESULTS (2026-06-11, gpt-5.4-mini live, zero planner fallbacks in
      the server log):** "hi there!" → rag, `userContentChars: 173` (no
      search snippets, no EXTRACTED FIELDS — the planner suppressed both;
      pre-change this carried ~7KB); "good morning :)" → rag,
      `userContentChars: 814` (snippets only, extraction skipped); "how many
      pages do I have left on my plan?" → **structured** (no keyword hint
      matches this paraphrase — the planner routed it); "what is the meter
      number?" → rag, `userContentChars: 7219` (snippets + full extraction
      block), answer listed the bill's five meter numbers.
- [x] 3.4 **Final adversarial review gate** across the whole change, then
      archive. Passed 2026-06-11: 851/851 middleware tests, tsc build clean,
      app catalog-parity guard green, openspec strict-validate green, live
      probes recorded in 3.3; stale doc headers (chatRouter, chatClassifier,
      turnRouter, groundedAnswer options) updated to match shipped behavior.
