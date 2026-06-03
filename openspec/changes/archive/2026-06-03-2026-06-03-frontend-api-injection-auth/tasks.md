# Tasks — frontend API injection auth slice

Sequential. TDD failing-test-first. Each task ends with an adversarial review
gate before marking it done and before starting the next task.

## T1 — Add auth group to the injected client (SEQUENTIAL)

- [x] **Failing test first** (`api/client.test.ts` or `makeFakeApi.test.ts`):
      assert `realApi.auth.login/register/getUserData/resetUserPassword/
      confirmUserChangingPassword/logout/updateAppMetadata` exists and
      `makeFakeApi({ auth: { login: ... } })` overrides only that grouped member.
- [x] Add `auth` to `realApi`, wired to the existing customer auth functions.
      Keep the top-level legacy functions from the spread untouched.
- [x] Add sensible fake defaults for `auth.getUserData`, `auth.login`,
      `auth.register`, and `auth.updateAppMetadata` if current defaults make auth
      harnesses too brittle.
- **Adversarial gate:** prove the new group is not dormant by reading the tests
  and implementation; `npm --workspace app exec vitest run src/api/client.test.ts
  src/test/makeFakeApi.test.ts`; `npm run build`.

## T2 — Migrate `AuthProvider` to `useApi().auth` (SEQUENTIAL)

- [x] **Failing test first** (`AuthProvider.test.tsx`): render
      `AuthProvider` with `ApiProvider value={makeFakeApi({ auth: ... })}` and no
      `vi.mock("@/api")`; assert login/register/reset/confirm/logout/update
      metadata still drive the same user-visible auth state and messages.
- [x] Update `AuthProvider.tsx` to call `const api = useApi()` and use
      `api.auth.*`.
- [x] Convert customer auth shape imports in `AuthProvider.tsx` and auth forms to
      `import type` where they are type-only (`LoginI`, `RegisterI`,
      `UpdateAppMetadataInput`, `User`).
- **Adversarial gate:** grep `AuthProvider.tsx` for value imports from `@/api`;
  inspect callback dependency arrays for stable `api.auth` usage; run
  `npm --workspace app exec vitest run src/contexts/AuthContext/AuthProvider.test.tsx`.

## T3 — Retarget auth route tests to the injected fake (SEQUENTIAL)

- [x] **Failing test first:** convert one auth route test (`Login.test.tsx`) to
      the harness fake and confirm it fails before the provider migration is in
      place or before the fake override is wired correctly.
- [x] Replace per-file `vi.mock("@/api")` in:
      `views/Auth/Login.test.tsx`, `views/Auth/Register.test.tsx`, and
      `views/Auth/ResetPassword.test.tsx`.
- [x] Use `renderWithAppProviders(..., { api: { auth: ... } })` overrides for
      each test's asserted network behavior.
- [x] Keep assertions grounded in visible behavior: navigation to home/login,
      disabled submit state, field reset, duplicate-click prevention, password
      reset flow, and no browser-side secret storage.
- **Adversarial gate:** grep auth tests for `vi.mock("@/api")`; run
  `npm --workspace app exec vitest run src/views/Auth/Login.test.tsx
  src/views/Auth/Register.test.tsx src/views/Auth/ResetPassword.test.tsx
  src/appConfig.integration.test.tsx`.

## T4 — Widen the drift guard for the migrated auth domain (SEQUENTIAL)

- [x] **Failing test first:** temporarily introduce a direct value import from
      `@/api` in an auth production file and a `vi.mock("@/api")` in an auth test;
      prove `frontend-api-injection-guard.test.ts` fails both. Revert the
      temporary violations before proceeding.
- [x] Update the guard so auth production files cannot value-import `@/api` or
      `@/api/entities/customerEntity`, while type-only imports from
      `customerEntity` remain allowed.
- [x] Update the guard so auth tests cannot `vi.mock("@/api")`.
- [x] Keep the guard scoped: resource providers and other unmigrated #10 domains
      must not fail until their own slices migrate.
- **Adversarial gate:** run the guard red/green proof; run
  `npm --workspace app exec vitest run src/test/frontend-api-injection-guard.test.ts`;
  inspect the allowlist so it cannot accidentally mask auth files.

## T5 — Close-out (SEQUENTIAL)

- [x] Full inner loop green: `npm test`, `npm run build`, and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] Run focused browser smoke only if auth UI behavior changed beyond dependency
      routing; otherwise document why Vitest route tests cover this seam-only
      migration.
- [x] Update `docs/agents/` if the auth-domain example or checklist needs to name
      `api.auth.*`.
- [x] Comment on GitHub issue #10 with: auth slice complete, removed auth
      per-file network mocks, remaining domains still open.
- [x] Archive this OpenSpec change only after validation passes.
- **Adversarial gate:** confirm `AuthProvider` reaches the real injected client
  in production, auth tests use one fake instead of module mocks, the guard catches
  auth regressions, #10 remains open for later domains, and no suite/build/spec
  regression remains.
