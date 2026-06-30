# Frontend API injection — auth domain slice

## Why

Issue #10 remains open for the broader frontend API dependency-injection
roadmap. The foundation + session/chat slice is already archived at
`openspec/changes/archive/2026-06-03-2026-06-02-frontend-api-injection`.
That slice added `ApiProvider`, `useApi()`, `realApi`, `makeFakeApi`, and a
scoped drift guard; it also closed #8.

The next roadmap slice is **auth domain**. Today `AuthProvider` still imports
the legacy aggregate directly:

- `app/src/contexts/AuthContext/AuthProvider.tsx` imports `{ api }` from
  `@/api` and calls `api.login`, `api.register`, `api.getUserData`,
  `api.resetUserPassword`, `api.confirmUserChangingPassword`, `api.logout`,
  and `api.updateAppMetadata`.
- Auth route tests (`Login.test.tsx`, `Register.test.tsx`,
  `ResetPassword.test.tsx`) and `AuthProvider.test.tsx` still use
  per-file `vi.mock("@/api")`.

That means the auth screens are still outside the injected-client model and
still contribute to the file-scoped mock duplication #10 is meant to retire.
This change migrates ONLY the auth domain. GroundX resource providers,
scenario/canvas, smart-report/extract, telemetry, and final cleanup remain
follow-on #10 slices.

## What Changes

- Add an explicit grouped `auth` member to the real injected client:
  `realApi.auth.login`, `register`, `logout`, `getUserData`,
  `updateAppMetadata`, `resetUserPassword`, and
  `confirmUserChangingPassword`. Keep the existing top-level legacy members
  during migration so un-migrated code continues to compile.
- Migrate `AuthProvider` to `useApi().auth.*` and convert auth wire-shape imports
  (`LoginI`, `RegisterI`, `UpdateAppMetadataInput`, `User`) to type-only imports.
  Runtime behavior remains unchanged: successful login/register loads user data,
  auth state is stored in React state, and browser-side secret storage remains
  absent.
- Retarget auth tests to `makeFakeApi` / `ApiProvider` instead of
  `vi.mock("@/api")`. The route tests should pass auth behavior via
  `renderWithAppProviders(..., { api: { auth: ... } })`; the provider unit test
  should wrap `AuthProvider` in `ApiProvider value={makeFakeApi({ auth: ... })}`.
- Widen the frontend API injection guard for the migrated auth domain. It SHALL
  fail if auth production files value-import `@/api` or
  `@/api/entities/customerEntity`, or if auth tests `vi.mock("@/api")`. Type-only
  imports from `customerEntity` are allowed until shared/auth wire-shape cleanup
  is picked up separately.
- Update `docs/agents/` only where needed to make the auth-domain example point
  at `api.auth.*`.

## Out Of Scope

- Resource providers (`Buckets`, `Documents`, `Groups`, `Projects`,
  `Workflows`, `ApiKeys`, `Health`, `Search`).
- Scenario registry / canvas orchestrator / intent logging.
- Smart-report and extract migrations.
- Telemetry/Sentry injection.
- Removing the legacy top-level `@/api` aggregate or banning it repo-wide.
- Solving the dev deploy AWS/EKS configuration blocker from the previous publish
  attempt (`EKS_CLUSTER_REGION_DEV` missing).

## Impact

- Production behavior should be unchanged; this is a dependency routing and test
  harness migration.
- The auth domain will stop using per-file network module mocks.
- The drift guard's migrated scope grows from session/chat to session/chat + auth.
- Issue #10 remains open after this slice; it should get a progress comment with
  the removed auth mocks and the next recommended slice.
