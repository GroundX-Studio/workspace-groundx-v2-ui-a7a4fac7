# smart-report Specification Delta

## ADDED Requirements

### Requirement: Smart Report product scopes SHALL use the canonical projectId filter

Smart Report product paths SHALL use the same `ContentScope.filter.projectId`
vocabulary as the scoped `/projects` route, GroundX search composition, and
project RBAC layer. Product Smart Report scopes SHALL NOT emit or consume
`filter.project`.

This requirement applies to app report fixtures, report template routing,
middleware report doc indexes, render endpoint tests, widget tests, and fake API
fixtures that model product or sample project scopes. Any legacy non-product
fixture that still requires a field named `project` MUST be isolated and
documented so it cannot enter product render paths.

#### Scenario: Utility Smart Report routes by projectId

- **GIVEN** the Utility sample report scope
- **WHEN** the app resolves a report template or fixture for the scope
- **THEN** the scope is `{type:"bucket", bucketId, filter:{projectId}}`
- **AND** no product Smart Report path uses `filter.project`.

#### Scenario: Middleware report renderer resolves projectId

- **GIVEN** a bucket scope with `filter.projectId:"proj_utility"`
- **WHEN** `resolveScopeDocSet` resolves the scope against the report doc index
- **THEN** it returns the Utility document set
- **AND** a scope using `filter.project:"utility"` does not satisfy the product
  project scope contract.

#### Scenario: Static guard rejects stale Smart Report project filter

- **GIVEN** app or middleware Smart Report product code reintroduces
  `filter.project`
- **WHEN** the focused Smart Report scope guard runs
- **THEN** the guard fails and names the stale file.
