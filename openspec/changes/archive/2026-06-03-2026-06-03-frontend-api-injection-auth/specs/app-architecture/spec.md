# app-architecture Specification (delta)

## ADDED Requirements

### Requirement: Auth consumers SHALL use the injected Api auth group

Auth-domain production consumers SHALL obtain customer-auth network operations
from `useApi().auth`, not from the legacy `@/api` aggregate or
`@/api/entities/customerEntity` as value imports. The injected `Api` SHALL expose
an explicit `auth` group containing login, register, logout, get-user-data,
app-metadata update, password-reset, and password-confirm operations. The legacy
top-level auth members MAY coexist only while other domains migrate.

Type-only imports of auth wire shapes are allowed until those shapes move to a
separate shared/type-only surface.

#### Scenario: AuthProvider uses the injected auth client

- **WHEN** `AuthProvider` performs login, register, logout, user-data load,
  app-metadata update, reset-password, or confirm-password
- **THEN** it calls the corresponding `useApi().auth.*` operation
- **AND** it does not value-import `api` from `@/api`
- **AND** it does not value-import customer auth functions from
  `@/api/entities/customerEntity`

#### Scenario: Legacy top-level auth functions remain during migration

- **GIVEN** non-auth domains still compile against the legacy aggregate during the
  phased #10 migration
- **WHEN** the auth slice lands
- **THEN** the top-level `realApi.login/register/...` members still exist
- **AND** the new `realApi.auth.*` group is the only auth surface used by migrated
  auth consumers
