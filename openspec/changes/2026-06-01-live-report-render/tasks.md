# Tasks — Live multi-doc report render (Phase 7 / WF-10)

> **Per-task adversarial-review gate (Discipline §10).** A task is NOT done until an adversarial
> review of its output passes — against this plan AND the real code, not the seam — run BEFORE
> marking it done and BEFORE starting the next task. Default gate: falsify every claim against the
> code; confirm no no-op / dormant plumbing (the live branch must actually search + generate +
> verify, not return a stubbed body); `openspec validate 2026-06-01-live-report-render --strict`
> with no delta vs the shipped/archived `smart-report` spec; open the named test file and confirm
> it is real + green + not retargeted-away (the live test runs WITHOUT `mockMode`); cross-plan
> collision check on `reportRenderer.ts` + `app.ts` against any in-flight change touching the
> render path (esp. `2026-06-01-retire-mock-mode`); `npm run build` + drift guards green. Failed
> gate → back to `in-progress`, never advance. TDD is mandatory: write the failing test first.

## 1. Live render deps on `RenderReportDeps`

- [ ] Write FAILING test in `reportRenderer.test.ts`: outside MOCK_MODE (`mockMode: false`),
      `renderReport` over a sample scope with NO `groundxClient` / `groundxApiKey` / `llmModelId`
      throws a clear "live render requires …" error (mirroring `extractField` / `runRagPipeline`'s
      required-deps guard), NOT the old "not yet wired (Phase 7 / WF-10)" message.
- [ ] Add `groundxClient?`, `groundxApiKey?`, `llmClient?`, `llmModelId?` to `RenderReportDeps`
      (~251), mirroring `ExtractFieldDeps` (`fieldExtractor.ts` ~56). Outside MOCK_MODE they are
      required; absent → the new guard throw. Keep `mockMode`, `samplesBucketId`, `docIndex`.
- [ ] **Adversarial review:** confirm the new deps are OPTIONAL on the interface (MOCK_MODE callers
      pass none) but REQUIRED at runtime outside MOCK_MODE via an explicit guard throw — and that
      the old `throw new Error("live report render is not yet wired …")` string is gone, not merely
      shadowed. Verify the deps names/shapes byte-match `ExtractFieldDeps` (no novel API).

## 2. Per-section live render (search → generate → verify → cited section)

- [ ] Write FAILING test in `reportRenderer.test.ts`: with `mockMode: false` and INJECTED fake
      `groundxClient` + `llmClient` (NOT MOCK_MODE) returning canned snippets + a grounded answer
      with a verbatim quote, `renderReport` over the Utility sample scope returns `sections[]` whose
      bodies are the LLM output and whose `cites` are verified citations with a WF-06b `tier`
      (`exact`/`normalized`/`ambient`) and a `confidence` — proving search + generation + verify ran.
- [ ] Implement the live branch in `renderReport` (replacing the throw at ~478): for each section
      to render (in template order, honoring the `sectionIds` subset), produce a grounded cited
      answer for the section `question` over the resolved doc set's `ContentScope` by **COMPOSING the
      EXISTING shared pieces** — `searchGroundX` (search), `buildSnippetBlock` (ragPipeline ~636,
      snippet→prompt block), `llmClient.forward("/chat/completions")` (generation), `parseGroundedAnswer`
      (ragPipeline ~349, parse the cited answer), then `verifyQuote` → `assignTier` → `confidenceFor`
      (`attribution.ts`, WF-06b). Then pass the result through the SAME degradation path `renderSection`
      uses (variable substitution, unresolved-`{var}` warning, no-source em-dash).
      **COMPOSABLE-OVER-FORKED (this is the crux of the change):** do NOT copy `extractField`'s inline
      prompt/parse loop into a third place. Reuse `buildSnippetBlock`/`parseGroundedAnswer`/`searchGroundX`/
      attribution verbatim. **Earn-every-axis decision:** report is now the 3rd caller of
      "search a question over a scope → grounded, verified, cited answer" (extract + rag are the others).
      EITHER (preferred if clean) extract ONE shared `groundedAnswerOverScope(question, scope, deps):
      Promise<GeneratedResult>` orchestration that composes those pieces AND migrate `extractField`'s
      body to call it too (≥2 real callers → axis earned, single source for the loop) — OR, if migrating
      `extractField` proves out of scope, compose the existing shared pieces inline here and DO NOT create
      a new helper (never a 1-caller abstraction). State which path you took + why in the commit.
- [ ] **Adversarial review:** confirm the live branch genuinely calls the injected `searchGroundX`
      + `llmClient` + `verifyQuote`/`assignTier`/`confidenceFor` per section (not a hardcoded body),
      ordering matches template order + the `sectionIds` subset, and the no-source / unresolved-var
      degradations still fire on the live result. Falsify: a section with no snippet support yields
      the `—` + `⚠ no support in docs` degradation, same as the fixture.
      **Composable check (mandatory):** grep that NO new private copy of the snippet-block build, the
      grounding prompt, or the answer-parse exists in `reportRenderer.ts` — it reuses `buildSnippetBlock`
      / `parseGroundedAnswer` / `searchGroundX` / attribution. If a `groundedAnswerOverScope` helper was
      extracted, confirm `extractField` ALSO calls it (≥2 callers — not a dormant 1-caller abstraction);
      if not extracted, confirm nothing new was abstracted. **One-source-of-truth check:** the live
      section result is built on the shared `RenderedSection` / `GeneratedResult` core
      (`@groundx/shared` — `body`/`cites`/`confidence`/`warnings`), NOT a new local result shape; the
      emitted `RenderedSectionWire` derives from it (the anchoring shipped in `generated-result-shared`).

## 3. `renderReport` async + same response shape (widget unchanged)

- [ ] Write FAILING test in `reportRenderer.test.ts`: assert `renderReport(...)` returns a Promise
      and that BOTH the MOCK_MODE result and the live result satisfy the SAME `RenderReportResponse`
      shape — ordered `sections[]` of `RenderedSectionWire` (`name`, `render_as`, `body`, `cites`,
      `confidence?`, `warnings?`), plus `report_id`, `template_id`, `status`, `resolved_variables`,
      `export_formats`, `preview_only`. Behavior-parity assertion: the wire keys are identical
      between mock and live.
- [ ] Change `renderReport`'s signature to
      `Promise<RenderReportResponse | RenderGateResponse>`; `await` the live search/LLM work; keep
      the MOCK_MODE branch returning the fixture result (now awaited). Update the app.ts render
      route (~1232) to `await renderReport(...)` and pass the live deps the same way the extract
      route (~1160) does (`llmClient`, `groundxClient`, `groundxApiKey` from
      `sessionApiKey(reqSession) ?? env.GROUNDX_PARTNER_API_KEY`, `llmModelId` from
      `env.LLM_MODEL_ID`). The gate and idle branches remain synchronous-shaped (awaited, no change).
- [ ] **Adversarial review:** confirm the app.ts route awaits the Promise (no unhandled-promise /
      `[object Promise]` JSON), the response JSON shape is byte-identical to today's for MOCK_MODE,
      and the render-surface widget + `CiteChip` need NO change (grep for the response keys the
      surface reads). `npm run build` + middleware vitest green.

## 4. Gate + idle parity (unchanged behavior, regression-pinned)

- [ ] Write FAILING test (or extend) in `reportRenderer.test.ts`: with `mockMode: false`, a BYO
      scope still returns the gate envelope (`gated: true`, `gate: "byo"`) BEFORE any
      search/LLM call (inject clients that throw if called — they must NOT be touched on a BYO
      scope); and a sample scope that resolves to an empty doc set still returns the idle empty
      render (`sections: []`, `status: "complete"`, `preview_only: true`) without calling the LLM.
- [ ] Confirm the BYO gate (~464) and empty-scope idle render (~484) run before / instead of the
      live fan-out — no code change expected beyond ordering; the test pins the invariant (#10 gate,
      idle render) against the new live path so it can't regress.
- [ ] **Adversarial review:** prove the injected throwing clients are NOT invoked on the BYO and
      empty-scope paths (the gate/idle branches short-circuit before the live fan-out). Confirm this
      matches Extract's anon/gate parity requirement in the durable spec.

## Closeout

- [ ] `openspec validate 2026-06-01-live-report-render --strict` passes.
- [ ] Full middleware vitest + `npm run build` + drift guards green; the live-render test runs
      WITHOUT MOCK_MODE and is not retargeted to the fixture.
- [ ] Delete any inline `TODO(2026-06-01-live-report-render)` and confirm the
      "not yet wired (Phase 7 / WF-10)" throw is fully removed from `reportRenderer.ts`.
- [ ] Confirm scope boundary: MOCK_MODE is **still present** — `renderReport` works both with the
      fixture and live. Removing MOCK_MODE is the dependent change `2026-06-01-retire-mock-mode`;
      do NOT touch it here.
- [ ] Cross-plan check: no collision with in-flight changes on `reportRenderer.ts` / `app.ts`;
      hand off the "MOCK_MODE removable" precondition to `2026-06-01-retire-mock-mode`.
