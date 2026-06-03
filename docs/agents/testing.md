# Testing

Test layers, conventions, what runs when.

## Layers

| Layer | Tool | Where | When |
|---|---|---|---|
| App unit + RTL | vitest + @testing-library/react + jsdom | `app/src/**/*.test.tsx` (co-located) | Every `npm test` |
| Middleware unit | vitest | `middleware/src/**/*.test.ts` (co-located) | Every `npm test` |
| Middleware contract | vitest + supertest | `middleware/src/apiRouteContract.test.ts` | Every `npm test` |
| Deploy assets | plain node script | `scripts/test-deploy-assets.mjs` | Every `npm test` via `test:deploy` |
| Secret scan | plain node script | `scripts/scan-secrets.mjs` | `npm run scan:secrets` (manual, pre-push) |
| Vite alias | plain node script | `scripts/test-vite-alias.mjs` | Every `npm test` via `test:alias` |
| Setup-env smoke | plain node script | `scripts/test-setup-local-env.mjs` | Every `npm test` via `test:setup-env` |
| E2E browser | Playwright + Chromium | `app/e2e/*.spec.ts` | `npm run test:e2e` (demand-driven, slow) |

Current counts:
- App: 481 vitest tests
- Middleware: 158 vitest tests
- Total inner-loop: 639

## TDD discipline applied per layer

| Layer | "Failing test first" looks like |
|---|---|
| App view | Write `<View>.test.tsx` asserting the rendered shape (testids, text content) BEFORE writing the JSX |
| Frontend hook / store | Write a Harness component that exercises the hook, assert state transitions, BEFORE writing the reducer |
| Middleware route | Add a `request(app).post(...)` block in `apiRouteContract.test.ts` BEFORE adding the route in `app.ts` |
| Middleware service | Co-located `.test.ts` with the function signature you want — assert against a stub'd dependency BEFORE implementing |
| Deploy asset | Extend `scripts/test-deploy-assets.mjs` with the structural assertion (regex / `includes` / `assert.deepStrictEqual`) BEFORE editing the workflow or chart |

## Common test harnesses

### `renderWithOnboardingProviders` (`app/src/test/`)

The standard render for any view that needs the onboarding context
graph. Options:

```ts
renderWithOnboardingProviders(<MyView />, {
  initialFrame: "f2",          // sets session.currentFrame
  initialScenario: "utility",  // activates the entity + URL
  initialAuthState: "anonymous",
  initialScenarios: allTestScenarios,  // override the registry
  initialUrl: "/onboarding/28454/utility?focus=meters",  // custom URL
  registryBucketId: 28454,
});
```

If you don't pass `initialUrl`, it derives one from
`initialScenario` so the URL ↔ state sync doesn't immediately
deactivate your seeded entity.

### `scenarioFixtures` (`app/src/test/scenarioFixtures.ts`)

Canonical fixture scenarios for Utility / Loan / Solar. Same
manifest shape the runtime registry produces. If you add fields
to `ScenarioManifest`, update these fixtures too.

### Probe components

For testing context behavior, use a tiny probe inside the harness:

```tsx
function FrameProbe({ onFrame }: { onFrame: (f: string) => void }) {
  const { state } = useOnboardingSession();
  onFrame(state.currentFrame);
  return null;
}
```

Then mount it next to the SUT and assert the captured value.

### Middleware setup

```ts
function setup() {
  const repository = new MemoryAppRepository();
  const partnerClient = new FakePartnerClient();
  const groundxClient = new FakeGroundXClient();
  const llmClient = new FakeLlmClient();
  const scenarioRegistry = new FakeScenarioRegistry();
  const app = createApp({ env: testEnv, repository, partnerClient,
    groundxClient, llmClient, scenarioRegistry });
  return { app, partnerClient, groundxClient, llmClient,
    repository, scenarioRegistry };
}
```

All fake clients in `middleware/src/test/fakes.ts` record their
calls (`partnerClient.calls`) so you can assert on the upstream
request shape without hitting the network.

### Frontend API fakes

Frontend runtime network calls flow through `ApiProvider` + `useApi()`
for migrated domains. Tests should use the render-harness `api` option
or `withApiProvider(..., overrides)` to override only the method under
assertion:

```tsx
renderWithOnboardingProviders(<OnboardingShell />, {
  api: {
    session: { ensureAnonSession: vi.fn().mockResolvedValue({ sessionId: "s1", anonymous: true }) },
    chat: { ensureServerChatSession: vi.fn(async () => undefined) },
  },
});
```

Do not add per-file `vi.mock("@/api/...")` for migrated network
boundaries. The pattern is the frontend equivalent of middleware
`createApp({ ...fakeClients })`: one fake client per harness, not one
module mock per test file.

## Timer + animation tests

Many views use timers (typing indicators, scan animations,
streaming notes). The conventions:

- `vi.useFakeTimers()` at the start, `vi.useRealTimers()` in
  `afterEach`.
- Walk forward in `act(() => vi.advanceTimersByTime(NN))` chunks
  matching the production interval. Each chunk gives React time
  to commit setState → render → next setTimeout.
- One big `vi.advanceTimersByTime(20_000)` does NOT work — only
  the first scheduled timer fires; the chain of setTimeouts
  scheduled by subsequent useEffects doesn't get to run because
  the render-commit cycle hasn't reached them yet.
- `framer-motion`'s `useReducedMotion()` returns true in jsdom
  (no matchMedia). Mock it to `false` if your test exercises a
  timing-based motion:

```ts
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => false };
});
```

## Contract tests

`test-deploy-assets.mjs` enforces the deploy plumbing shape:

- workflow_dispatch input set is exactly what we want (the test
  is the diff-fence — drift triggers immediately).
- Helm chart templates contain the expected probes / publish-mode
  branches.
- `imagePullPolicy: Always` is set.
- All 7 tables get a CREATE TABLE statement.
- Tag scheme is `<repo>` / `<repo>-<env>`.
- The Pick-a-view "advance-to-f3" alias testid is present.

Add new assertions here when introducing structural constraints
that mustn't drift.

## E2E

Playwright lives in `app/e2e/`. Today's suites:

| Suite | What |
|---|---|
| `onboarding-utility.spec.ts` | Golden journey F1 → F2 → F3 → F5. axe a11y sweep |
| `onboarding-loan.spec.ts` | Loan scenario with the JSON render-mode toggle + cross-doc citation chips |

Run via `npm run test:e2e`. Slow (~30s+); demand-driven only. The
unit + contract layers carry most of the regression weight.

### E2E runs against LIVE GroundX — assert invariants, not fixtures (2026-06-02)

There is no MOCK_MODE; the middleware boots in real mode and the chat is a real
LLM. So e2e MUST assert **live-stable structural invariants** — frame testids,
`field-row-*` / `cite-chip-*` presence, step transitions, gate lifecycle — and
MUST NOT assert deterministic fixture strings (exact extracted values, canned
LLM answers, fixture doc titles). It exercises the **actually-seeded** scenarios
(Utility today); an unseeded scenario (Loan/Solar) is `describe.skip`ped with a
seeding ticket, never asserted against absent data and never faked.

Gotchas (all hit during `2026-06-02-e2e-live-data-realignment`):
- **`test.use({ reducedMotion })` does NOT reach `window.matchMedia`** in the
  `vite preview` setup (matchMedia stays false). Drive it with an explicit
  `await page.emulateMedia({ reducedMotion: "reduce" })` in `beforeEach` — still
  the real media-query path. (`reduced-motion.spec.ts`.)
- **F2 auto-advances to F3** after its thinking stream (~10–18s); the legacy
  `advance-to-f3` pill is preempted — wait for `onboarding-frame-f3`, don't click.
- **`/home` is an auth-aware redirect** (ARCH-21): an authed user bootstraps a
  session and deep-links to the steady `/c/<id>` shell — don't assert the deleted
  scaffold "Studio Workspace" / first-run-wizard.
- **Port preconditions:** ensure nothing is on `:3001` (stop stray Claude_Preview
  middleware — `reuseExistingServer:false` aborts the run otherwise); node v20.
- **Sign-up gate trigger:** the gate is no longer opened by a removed
  `advance-to-f6` pill. An anonymous user clicking the Extract **unlock banner**
  (`extract-unlock-banner`) fires `openGate("save")` (the topbar `extract-topbar-save`
  is disabled until there are unsaved edits, so it's not the reliable trigger).
  BYO opens the same gate via `byo-pdf` → `/onboarding/signup`.
- **The gate is a magic-link / SSO chat-rail**, not the old `SignUpWidget`
  registration form: `gate-rail-email` (a MUI TextField — fill `.locator("input")`)
  + `gate-rail-send-magic-link` commit the gate client-side → `gate-rail-committed`
  → `gate-rail-continue-integrate` → F7. There is no inline register-error
  affordance (commitGate is a pure state flip); empty-email Send is a no-op. The
  gate dismisses via "Keep exploring" (`gate-rail-dismiss`), NOT ESC (chat-rail,
  not a modal — LC5 updated).
- **Canvas swap on gate-open:** `onboarding-frame-f3` is the persistent canvas
  WRAPPER; the value-prop panel renders inside it, so assert the sample content
  (`extract-workbench`) hides, not the wrapper.
- **Provenance peek** (`field-provenance-panel`) lists citations as "page N"
  source pills, not `cite-chip-*` (the panel + field-row read one
  `valuesByFieldId` source).
