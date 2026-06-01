# Tasks — 2026-06-01-retire-mock-mode

> **Per-task adversarial gate (Discipline §10).** A task is NOT done until an
> adversarial review of its output passes — against this plan AND the real code,
> not the seam — run BEFORE marking it done and BEFORE the next task. Default
> gate: falsify every claim against code; no-op / dormant-plumbing check
> (a removal that leaves a dead import, a stale comment, or an unreferenced
> fixture is NOT done); confirm the named test file is real + green + not
> retargeted-away; `openspec validate 2026-06-01-retire-mock-mode --strict` with
> no delta vs shipped/archived; cross-plan collision check on shared files
> (`index.ts`, `env.ts`, `app.ts`, `chatRouter*`, `reportRenderer.ts`,
> `fakes.ts`, `playwright.config.ts`); `npm run build` + drift guards green.
> TDD throughout: write the failing test first, implement, refactor — no test
> weakened, no assertion deleted to make red go green. Failed gate → back to
> in-progress, never advance.

## 1. Dependency gate (FIRST — fail closed)

- [ ] **Gate: `2026-06-01-live-report-render` has landed.** Verify the live
      report-render path exists and that `reportRenderer.renderReport` no longer
      depends on a `MOCK_MODE` fixture branch to produce a render (its only impl
      today). Confirm by: (a) the `live-report-render` change is archived /
      merged; (b) `renderReport` has a live (non-fixture) code path that does NOT
      `throw "live report render is not yet wired"`; (c) the `smart-report` +
      `scenarios` report-fixture durable requirements have been updated by that
      change. If ANY of (a)–(c) is false, STOP — do not start this change.
- [ ] **Adversarial review:** prove against code (not the plan) that removing
      every `mockMode` report branch in this change will NOT break report render —
      grep `reportRenderer.ts` + `app.ts` report call sites and confirm a live
      path returns sections without the fixture.

## 2. Durable rule + drift guard (TDD)

- [ ] Write a FAILING drift-guard test asserting no non-test runtime file under
      `middleware/src/` references `MOCK_MODE`, `useDevClients`, a `Dev*` client
      class, `chatMocks`, or a `mockMode` deps field (and no `config/env`
      `MOCK_MODE` field). It is red today.
- [ ] **Adversarial review:** confirm the guard actually walks runtime files,
      excludes `*.test.*` + fixtures intentionally, and would catch each token
      (not a no-op regex). Confirm it is red for the right reason now.

## 3. Env field + production guard (TDD)

- [ ] Write a FAILING test (`env.test.ts`) asserting `loadEnv` parses with no
      `MOCK_MODE` key and that the schema has no `MOCK_MODE` field; remove the
      `MOCK_MODE` zod field (`config/env.ts` ~26) and the
      `NODE_ENV === "production" && MOCK_MODE` superRefine guard (~121–127).
      Update `AppEnv` consumers (`testEnv` in `test/fakes.ts` drops
      `MOCK_MODE: false`).
- [ ] **Adversarial review:** `tsc` is clean (no lingering `env.MOCK_MODE`
      reference anywhere); the production guard's removal leaves no behavior gap
      (there was no real-client requirement it guarded that isn't covered by the
      existing `GROUNDX_PARTNER_API_KEY` / `LLM_*` production guards).

## 4. Boot wiring — always real clients (TDD)

- [ ] Write/adjust a FAILING boot test asserting the constructed app deps are the
      real `Fetch*` clients with no selector. Then in `index.ts`: delete
      `useDevClients`, the four `Dev*`-vs-`Fetch*` ternaries (~36–38), the
      `lightLlmClient` `useDevClients` short-circuit (~27–31), the `devClients`
      boot-log field (~44), the `import` of `devClients.js` (~6), and the
      `MOCK_MODE` env-echo entry (~62) + the comment mention (~51).
- [ ] **Adversarial review:** `index.ts` has zero `Dev*` / `MOCK_MODE` /
      `useDevClients` references; `lightLlmClient` still degrades correctly via
      `isLightLlmConfigured`; boot log no longer claims a `devClients` field.

## 5. Delete dev clients (TDD)

- [ ] Delete `services/devClients.ts` and `services/devClients.test.ts`. Confirm
      no remaining importer (grep). The deleted test's coverage of "dev fallback"
      is intentionally dropped — capture in the closeout that the real clients are
      now exercised via injected fakes elsewhere.
- [ ] **Adversarial review:** `npm run build` + `vitest` resolve with the files
      gone; no orphaned import; no test silently skipped to hide a break.

## 6. Chat router — drop mockMode + delete chatMocks (TDD)

- [ ] Re-ground `chatRouter.test.ts`: replace any `mockMode: true` deps with
      injected `Fake*` clients exercising the real `rag` / `structured` / `hybrid`
      paths (failing first where the fixture assertion changes). Then remove the
      `deps.mockMode` branch (`chatRouter.ts` ~88–90), the `mockResponseFor`
      import (~35), the `mockMode` field on `ChatRouterDeps`
      (`chatRouterTypes.ts` ~186) + its comment mentions (~162, 169, 190, 202),
      and DELETE `services/chatMocks.ts`.
- [ ] **Adversarial review:** every previously mock-asserted chat case is now
      asserted against a real routing path with an injected fake (NOT deleted);
      no `chatMocks` importer remains; the structured "needs reader" frank replies
      still behave as specced.

## 7. Field extractor — drop mockMode, unconditional guards (TDD)

- [ ] Re-ground the extract tests (`ProposeSchemaFieldCard.test.tsx` +
      middleware extract coverage) to inject a fake GroundX/LLM client returning a
      real-shaped extract (failing first). Then remove the `deps.mockMode` branch
      + `mockValueFor` stub (`fieldExtractor.ts` ~223–229, ~75), drop `mockMode`
      from `ExtractFieldDeps` (~61), and make the client/model guards
      unconditional (~230–235: "required" with no "outside MOCK_MODE" qualifier).
- [ ] **Adversarial review:** the unconditional guards throw on genuinely-missing
      client/model (test proves it); `mockValueFor` is fully removed (not just
      orphaned); the propose-card → field-card flow asserts injected real-shaped
      values.

## 8. RAG pipeline — unconditional guards (TDD)

- [ ] Adjust `ragPipeline` tests to assert the client/model requirement
      unconditionally (failing first if wording/branch changes), then rewrite the
      `ragPipeline.ts` guards (~62, ~65) to drop "outside MOCK_MODE".
- [ ] **Adversarial review:** no behavior change beyond the qualifier removal;
      the guards still fire for the missing-client case.

## 9. Report renderer — remove fixture runtime branch (TDD; gated on Task 1)

- [ ] Re-ground `reportRenderer.test.ts` + `SmartReportRender.test.tsx` +
      `reportFixtures.test.ts` onto the live render path / injected fixtures
      (failing first). Then remove the `deps.mockMode` field
      (`reportRenderer.ts` ~252), the fixture branch + the
      `"live report render is not yet wired"` throw (~478–481), and either DELETE
      `UTILITY_REPORT_DOC_INDEX` + the section-template fixture model OR relocate
      them to a TEST-ONLY fixture module (whichever `live-report-render` left
      room for — they MUST NOT remain a runtime branch). Drop the three
      `mockMode: env.MOCK_MODE` passes in `app.ts` (~1174, ~1243, ~1348) and the
      stale `MOCK_MODE` comments (~1187).
      Re-ground the report tests so the **fresh-customer real-mode expectation
      is the live path's graceful no-template state** (`live-report-render`,
      re-revised, does NOT seed a sample report template): with no template,
      smart-report renders the **no-template** state (NOT a fixture-rendered
      report, NOT a broken/empty error); with a real template, the live render
      runs and returns sections. Any prior test that asserted a
      fixture-rendered report for a new customer MUST be re-grounded to the
      no-template state, not retargeted to a fixture.
- [ ] **Adversarial review:** confirm against code that report render returns
      sections via the live path with NO `mockMode`; the fixture model is either
      gone or test-only (grep proves no runtime importer); `app.ts` report routes
      pass no `mockMode`; and that the fresh-customer path renders the
      no-template state (not an error and not a fixture report) — assert against
      the live `smart-report` behavior `live-report-render` shipped.

## 10. App-side widget tests + reportFixtures (TDD)

- [ ] Re-ground `OnboardingShell.test.tsx`, `SchemaView.test.tsx`, and the
      `app/src/widgets/reportFixtures.ts` consumers so the demo surfaces receive
      injected real-shaped live extract/report data at the test seam, not a
      `MOCK_MODE` assumption. Update the SchemaView "MOCK_MODE" test name + GIVEN
      to the injected-seam wording (matches the modified `onboarding-schema-editor`
      durable scenario). Decide `reportFixtures.ts` fate: keep as a client-side
      test/demo fixture module (clearly labeled, not a runtime mock toggle) or
      fold into the live `smartReport` client per `live-report-render`.
- [ ] **Adversarial review:** every app test that mentioned MOCK_MODE now asserts
      against an injected source; no test is weakened or its assertion deleted;
      comments no longer describe a runtime MOCK_MODE.

## 11. Env files, scripts, e2e webServer, smoke (TDD where assertable)

- [ ] Remove `MOCK_MODE=true` from root `.env.local`; remove the `MOCK_MODE`
      lines + the "ignored while MOCK_MODE=true" comments from
      `middleware/.env.example`; remove `MOCK_MODE=true` from
      `scripts/setup-local-env.mjs` (~119) + `scripts/test-setup-local-env.mjs`
      (~79); rewrite `scripts/smoke-dev.mjs` (drop `MOCK_MODE: "true"` ~73 and the
      `mode === "development"` assertions ~146, ~166 + the summary line ~188) to
      smoke the real-client path (or skip cleanly when creds are absent —
      explicit, not silent). Update `app/playwright.config.ts` webServer (~25) to
      boot the e2e middleware WITHOUT `MOCK_MODE=true`, in **REAL mode against
      the live GroundX backend** using the Partner API key — NOT a mock/fake
      harness and NOT `MOCK_MODE`. The deterministic e2e data is the fixed
      **seeded sample doc `c3bfff49…` in bucket `28454`**, which is stable. The
      webServer env passes through `GROUNDX_PARTNER_API_KEY` + the GroundX base
      URL from the environment (sourced from a CI **secret** in CI; from
      `.env.local` locally). (Removed alternative: there is no injected fake
      harness for e2e — the decision is real GroundX. UNIT tests still inject
      fakes at the seam; that is unaffected.)
- [ ] **CI Partner-key handling (no silent skip).** Ensure CI provides
      `GROUNDX_PARTNER_API_KEY` (+ GroundX base URL) to the e2e job as a
      **secret**, and that the e2e job **fails loudly** if the key is absent
      rather than skipping the Playwright suite. If the repo's CI does not yet
      run e2e, capture the secret + fail-on-missing requirement so the wiring is
      explicit (ticket it rather than orphan it). No "quietly green because it
      didn't run."
- [ ] **Adversarial review:** no `MOCK_MODE` token remains in any env file,
      script, or playwright config (grep); the e2e suite runs in REAL mode
      against the seeded bucket `28454` doc `c3bfff49…` (named explicitly), with
      NO mock/fake harness; prove CI cannot pass e2e green while silently
      skipping for a missing Partner key (the job fails loudly when the secret is
      absent); smoke either passes against real clients or fails honestly with a
      clear message.

## 12. In-repo docs

- [ ] Update the in-repo agent docs that describe `MOCK_MODE` as a runtime mode
      (LLM-runtime / scenario-fixtures references under `docs/agents/`) to
      describe the injected-fake test seam. Do NOT touch the user's memory store.
- [ ] **Adversarial review:** grep the in-repo docs — no doc still instructs a
      reader to set `MOCK_MODE`; the new wording matches the durable spec.

## Closeout

- [ ] `openspec validate 2026-06-01-retire-mock-mode --strict` passes.
- [ ] Repo-wide grep: zero `MOCK_MODE` / `useDevClients` / `DevGroundX` /
      `DevLlm` / `chatMocks` / `mockMode` (deps) tokens outside intentionally
      relocated test-only fixtures (and the user's memory store, which is out of
      scope for this change).
- [ ] `npm run build` (app + middleware) + all drift guards + the new mock-mode
      drift guard green; full `vitest` + the re-grounded e2e suite green.
- [ ] Remove any inline `TODO(2026-06-01-retire-mock-mode)` left during the work.
- [ ] Capture in the closeout note: which previously-mock-asserted behaviors are
      now covered by injected fakes (the explicit coverage map); the e2e
      deterministic-data decision (**RESOLVED: real GroundX — seeded bucket
      `28454` doc `c3bfff49…`, no injected harness**) plus the CI Partner-key
      secret + fail-on-missing requirement; and the fresh-customer report
      behavior (**no template → live no-template state**, no fixture report).
