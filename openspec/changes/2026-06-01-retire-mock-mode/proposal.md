# Retire MOCK_MODE — the runtime has no mock/dev-client mode

## Why

The middleware ships a `MOCK_MODE` env flag that, in non-production, swaps the
real `Fetch*` clients for hand-written `Dev*` stand-ins (`DevGroundXClient` /
`DevGroundXPartnerClient` / `DevLlmClient`) and routes chat through canned
fixtures (`chatMocks.ts`), extract through a type-plausible stub
(`fieldExtractor.extractField` `mockMode` branch), and report render through an
in-code fixture (`reportRenderer.renderReport` `mockMode` branch +
`UTILITY_REPORT_DOC_INDEX`). This is a second, divergent runtime that:

- forks the data path the product actually runs (a class of "works in dev,
  breaks live" bugs that no test catches, because the tests run the mock too);
- couples ~12 test files to a *runtime env flag* instead of an injected seam —
  flipping `MOCK_MODE` is how they get deterministic data, so the tests assert
  the mock, not the product;
- makes "the runtime always uses real clients or test-injected fakes" un-true,
  which the durable spec should state and a guard should hold.

The product should have **no mock mode**. Dev and test SHALL use the real
`Fetch*` clients or explicitly-injected fakes at the dependency seam — never a
`MOCK_MODE` env path.

### Hard dependency — `2026-06-01-live-report-render` MUST land first

Report rendering's **only implementation today is the `MOCK_MODE` fixture
branch** in `reportRenderer.renderReport` (`UTILITY_REPORT_DOC_INDEX` + the
in-code section templates); outside `MOCK_MODE` that function deliberately
`throw`s `"live report render is not yet wired (Phase 7 / WF-10)"`. Removing
`MOCK_MODE` **before** a live report-render path exists would break the Report
chapter outright (every render throws).

Therefore this change is **GATED** on `2026-06-01-live-report-render` having
landed (it relocates the report-fixture coupling and supplies the live render
path, and it owns the corresponding `smart-report` + `scenarios` durable
requirements — this change does NOT re-litigate them). The **first task is a
gate check** that fails closed if that dependency has not shipped. If
`live-report-render` is not yet merged, this change does not start.

## What Changes

- **Remove the `MOCK_MODE` env field + production guard** (`config/env.ts`):
  drop the `MOCK_MODE` zod field and the `NODE_ENV === "production" &&
  MOCK_MODE` superRefine guard.
- **Always use the real `Fetch*` clients** (`index.ts`): delete `useDevClients`,
  the four `Dev*`-vs-`Fetch*` ternaries, the `devClients` boot-log field, the
  `import` of `devClients.js`, and the `MOCK_MODE` env-echo entry. The
  `lightLlmClient` no longer short-circuits on `useDevClients`.
- **Delete the dev clients** (`services/devClients.ts` + `devClients.test.ts`):
  the file and its test go away entirely (no consumer remains).
- **Delete the chat mocks** (`services/chatMocks.ts`): the canned
  `mockResponseFor` path is unreachable once `routeChat` loses its
  `deps.mockMode` short-circuit; real chat already routes via the live
  `ragPipeline` / structured / hybrid paths.
- **Drop `mockMode` from the chat router** (`chatRouter.ts` +
  `chatRouterTypes.ts`): remove the `deps.mockMode` branch and the `mockMode`
  field from `ChatRouterDeps`; tighten the now-unconditional comments.
- **Drop `mockMode` from extract + report deps**: remove the `deps.mockMode`
  branch + the `mockValueFor` stub in `fieldExtractor.extractField`, and (post
  `live-report-render`) remove the `deps.mockMode` field + the fixture branch +
  the `"live report render is not yet wired"` throw in
  `reportRenderer.renderReport`. The report fixture model
  (`UTILITY_REPORT_DOC_INDEX`, section templates) is **kept only as a test
  fixture** (moved out of the runtime module) or deleted if
  `live-report-render` already relocated it — never a runtime branch.
- **Make the conditional client-requirement guards unconditional**: the
  `"required outside MOCK_MODE"` guards in `ragPipeline.ts` (~62, 65) and
  `fieldExtractor.ts` (~231, 234) become plain unconditional
  client/model-required checks.
- **Drop `mockMode: env.MOCK_MODE` at the three `app.ts` call sites** (~1174
  extract, ~1243 / ~1348 report) once the dependency removes the param.
- **Re-ground every `MOCK_MODE`-dependent test on injected fakes** (the bulk of
  the work — its own task group, TDD, no test weakened): the middleware suites
  (`app.test.ts`, `reportRenderer.test.ts`, `chatRouter.test.ts`, and the
  deleted `devClients.test.ts`) and the app suites (`SmartReportRender.test.tsx`,
  `ProposeSchemaFieldCard.test.tsx`, `OnboardingShell.test.tsx`,
  `SchemaView.test.tsx`, `reportFixtures.test.ts`) inject `Fake*` clients /
  real-shaped fixtures at the test seam instead of flipping `MOCK_MODE`.
- **Strip `MOCK_MODE` from env files + scripts + the e2e webServer + test
  fakes**: `.env.local`, `middleware/.env.example`,
  `scripts/setup-local-env.mjs`, `scripts/test-setup-local-env.mjs`,
  `scripts/smoke-dev.mjs` (the `MOCK_MODE: "true"` + the `mode === "development"`
  assertions), `app/playwright.config.ts` (the `MOCK_MODE=true` webServer env —
  the e2e middleware must boot against real/injected clients deterministically),
  and `MOCK_MODE: false` in `middleware/src/test/fakes.ts` (`testEnv`).
- **Update the in-repo docs** that describe `MOCK_MODE` as a runtime mode
  (`docs/agents/*` LLM-runtime / scenario-fixtures references) to describe the
  injected-fake test seam instead. (The user's memory store is updated
  separately.)
- **Durable spec**: ADD to `app-architecture` — "the runtime SHALL have no
  mock/dev-client mode; services always use real clients or test-injected
  fakes," with a drift guard. MODIFY the two durable scenarios that assert a
  `MOCK_MODE` runtime path (`onboarding-schema-editor` SchemaView source,
  `ui-views` onboarding-frame-views) to re-ground on the injected-fixture seam.
  The `smart-report` + `scenarios` report-fixture requirements are owned by
  `2026-06-01-live-report-render` and are intentionally untouched here.
