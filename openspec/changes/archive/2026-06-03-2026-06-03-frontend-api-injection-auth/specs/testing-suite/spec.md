# testing-suite Specification (delta)

## ADDED Requirements

### Requirement: Auth tests SHALL use the injected Api fake instead of per-file network mocks

Auth-domain tests SHALL provide customer-auth behavior through
`makeFakeApi({ auth: ... })` via `ApiProvider` or the app render harness. They
SHALL NOT `vi.mock("@/api")` or mock customer-auth network modules per file once
the auth slice migrates. The drift guard SHALL fail if migrated auth files
reintroduce those direct imports or mocks.

#### Scenario: AuthProvider test injects one fake auth client

- **WHEN** `AuthProvider.test.tsx` asserts login/register/reset/logout/update
  metadata behavior
- **THEN** it wraps the provider in `ApiProvider value={makeFakeApi({ auth: ... })}`
- **AND** it does not declare `vi.mock("@/api")`

#### Scenario: Auth route tests inject auth overrides through the render harness

- **WHEN** `Login.test.tsx`, `Register.test.tsx`, or `ResetPassword.test.tsx`
  needs auth network behavior
- **THEN** the test passes `api: { auth: ... }` to `renderWithAppProviders`
- **AND** it asserts visible route/form behavior rather than module-call plumbing

#### Scenario: The drift guard catches auth-domain mock regression

- **WHEN** an auth test reintroduces `vi.mock("@/api")`
- **THEN** `frontend-api-injection-guard.test.ts` fails with the offending file
- **AND** unmigrated non-auth domains are not flagged by this auth-slice guard
