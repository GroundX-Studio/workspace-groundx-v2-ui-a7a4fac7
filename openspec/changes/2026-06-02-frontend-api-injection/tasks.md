# Tasks — frontend API injection (foundation + session/chat slice)

Sequential. TDD failing-test-first. Each task ends with an adversarial gate
(falsify against code + the real suites) before the next. The end state of THIS
change: an injected `Api` seam + one harness fake + the session/chat domain
migrated (with #8 closed) + a drift guard scoped to migrated boundaries. The
remaining domains are follow-on changes (see proposal roadmap).

## T1 — The `Api` injection seam (SEQUENTIAL)

- [ ] **Failing test first** (`ApiContext.test.tsx`): a component calling
      `useApi()` inside `<ApiProvider value={fake}>` receives the injected client;
      `useApi()` outside a provider throws the not-found error (via
      `createContextHook`).
- [ ] Define `Api` — BROADER than `typeof api`. The `src/api/index.ts` aggregate
      does NOT contain the session/chat domain; those are standalone modules
      (`chatSessions`, `chatSessionPatch`, `chatSessionsList`, `claimAnonymousChat`,
      `chatSessionEntities`, `viewerEvents`, `intentLog`, `smartReport`,
      `extractField`). The `Api` interface absorbs BOTH the aggregate members AND
      these standalone fns into cohesive grouped members (e.g. `session`, `chat`,
      `viewerEvents`, `report`, `extract`, `partner`, `groundx`, `auth`). Add
      `src/contexts/ApiContext/` (`ApiContext`, `ApiProvider`, `useApi` via
      `createContextHook` — exported `createEntityContext.tsx:63`).
- [ ] Wire the REAL client at the composition root (`App` / `AppInitialization`):
      the `api` aggregate + the standalone module fns bound into the grouped shape,
      so production behavior is unchanged. Legacy `import { api }` + direct module
      imports still work (coexist during migration).
- **Gate:** test RED→GREEN; `useApi()` returns the injected client; no consumer
  migrated yet; full app suite still green (additive only); tsc clean.

## T2 — One injected test fake (SEQUENTIAL)

- [ ] `src/test/makeFakeApi.ts`: `makeFakeApi(overrides?)` returns a full `Api`
      where every method is a `vi.fn` resolving a sensible default (empty list /
      success envelope / resolved void). Type-checked against `Api` so it can
      never drift from the real surface.
- [ ] Inject it by default in the render harnesses (`renderWithOnboardingProviders`
      + the steady/scoped harnesses): wrap children in `<ApiProvider value={
      makeFakeApi(opts.api)}>`. Tests pass `{ api: { session: { ... } } }` to
      override only what they assert.
- **Gate:** harness mounts a component using `useApi()` with zero per-test
  `vi.mock`; the fake type-checks against `Api`; app suite green.

## T3 — Migrate the session/chat domain + land #8 (SEQUENTIAL)

- [ ] Migrate `OnboardingShell`, `OnboardingSessionContext`, the ChatStore write
      paths, `chatSessions` + `onboardingSessionEntity` consumers from direct
      imports to `useApi()`.
- [ ] Land #8 — single-flight on the ANON-SESSION ESTABLISH (the actual race):
      today `issueOnboardingSession` is a bare `axios.post` with NO dedup, called
      from BOTH `OnboardingShell` and the 401-retry in `common.ts`. Add
      `session.ensureAnonSession()` on the injected client = one in-flight promise,
      one `POST /api/onboarding/session`; both callers share it. The chat-session
      create awaits it before firing. (The existing chat-ensure module-state
      `awaitChatSessionEnsured`/`__markChatSessionEnsured` in `chatSessions.ts`
      moves onto the client too — distinct mechanism, don't conflate.) No second
      establish, no 401/403/404.
- [ ] Delete the per-file `@/api` / `@/api/chatSessions` /
      `@/api/entities/onboardingSessionEntity` mocks in this domain's tests;
      replace with harness-fake overrides. Re-ground assertions onto the fake.
- [ ] **Live re-verify (#8):** fresh anon `/onboarding` (Chrome DevTools) → NO
      `chat-sessions` 401, NO `PATCH` 404, NO 403; one `POST /api/onboarding/session`.
- [ ] **Close GitHub issue #8 on success:** once the live re-verify passes, comment
      the evidence (network trace: single `POST /api/onboarding/session`, no
      401/PATCH-404/403) on #8 and `gh issue close 8`. If the live check does NOT
      pass, #8 stays OPEN and T3 is not done.
- **Gate:** session/chat tests green with NO per-file network mock; #8 closed
  (live evidence + the ordering unit test from the prior attempt, now on the
  client) — or explicitly still-open with reason; middleware + app suites green;
  the chat still answers (regression check vs #7).

## T4 — Drift guard (scoped to migrated boundaries) (SEQUENTIAL)

- [ ] A guard test (`frontend-api-injection-guard.test.ts`) that FAILS if: (a) a
      file under the migrated domain imports a migrated network module directly
      instead of `useApi()`; or (b) any test `vi.mock`s a migrated network
      boundary. Allowlist = the composition root + the client implementation +
      the client/entity-module unit tests (which legitimately mock `@/api/axios`
      to test the real client — must NOT be flagged).
- **Gate:** guard is GREEN now and RED if a direct import / per-file mock is
  reintroduced for a migrated boundary (prove with a temporary violation).

## T5 — Close-out (SEQUENTIAL)

- [ ] Full middleware + app vitest green; full Playwright e2e green; tsc + builds
      clean; `openspec validate --strict`.
- [ ] `docs/agents/` note: frontend network = injected `Api` via `useApi()`;
      tests inject one fake (`makeFakeApi`), never per-file network `vi.mock`;
      reference the middleware DI as the precedent. Update `data-model.md`'s
      "before you add" checklist (new API fn → add to `Api` + the fake, never a
      direct import).
- [ ] Confirm issue #8 is CLOSED (done in T3 on live success). Comment progress on
      issue #10 with the honest count (this change removes the session/chat-domain
      network mocks; ~76 api/telemetry mocks are removable across all phases; ~15
      non-network mocks are out of scope). The remaining domain migrations (roadmap
      2–7) stay as follow-on OpenSpec changes (created when picked up). Commit +
      archive + publish (dev) — #8 is a real runtime fix.
- **Gate:** adversarial review — the seam is real (not a parallel unused path);
  the fake type-checks against `Api`; the migrated domain has ZERO per-file
  network mocks; the guard catches regressions; #8 verified; no suite/e2e
  regression; the roadmap for full completion is recorded on #10.
