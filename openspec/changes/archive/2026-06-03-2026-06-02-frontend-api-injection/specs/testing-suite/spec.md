# testing-suite Specification (delta)

## ADDED Requirements

### Requirement: Tests SHALL inject one fake Api, not per-file network mocks

Tests SHALL exercise frontend network behavior by injecting a single fake `Api`
through the render harness (`makeFakeApi(overrides?)` provided via `ApiProvider`),
overriding only the methods a test asserts. For boundaries owned by the injected
`Api`, tests SHALL NOT declare per-file `vi.mock` of the network module. The fake
SHALL be type-checked against the `Api` interface so it cannot drift from the real
surface. A drift guard SHALL fail the build if a migrated network boundary is
imported directly (outside the composition root + the client implementation) or
re-mocked per-file.

#### Scenario: A component test uses the harness fake, no module mock

- **WHEN** a test renders a component that performs network operations
- **THEN** it provides behavior via `makeFakeApi({ ... })` through the harness
- **AND** it declares NO `vi.mock` for the injected network module
- **AND** the fake type-checks against `Api`

#### Scenario: The drift guard catches a regression

- **WHEN** a migrated component imports a network module directly, OR a test re-mocks a migrated network boundary
- **THEN** the drift-guard test fails
- **AND** the allowlist is limited to the composition root + the `Api` implementation
