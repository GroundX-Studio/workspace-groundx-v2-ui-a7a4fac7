# testing-suite Specification (delta)

## MODIFIED Requirements

### Requirement: Tests SHALL inject one fake Api, not per-file network mocks

Tests SHALL exercise frontend network and rendered-runtime telemetry behavior by
injecting a single fake `Api` through the render harness
(`makeFakeApi(overrides?)` provided via `ApiProvider`), overriding only the
methods a test asserts. For boundaries owned by the injected `Api`, tests SHALL
NOT declare per-file `vi.mock` of the network module or Sentry wrapper. The fake
SHALL be type-checked against the `Api` interface so it cannot drift from the
real surface. A drift guard SHALL fail the build if a migrated network or
runtime telemetry boundary is imported directly outside the composition
root/client implementation, or re-mocked per-file.

Low-level API implementation tests MAY continue mocking transport modules such
as `@/api/axios` or `@/api/csrfFetch` when they are testing the API module
itself rather than a rendered runtime consumer. Low-level Sentry wrapper tests
MAY continue testing or mocking the wrapper directly.

#### Scenario: A component test uses the harness fake, no module mock

- **WHEN** a test renders a component that performs network operations
- **THEN** it provides behavior via `makeFakeApi({ ... })` through the harness
- **AND** it declares NO `vi.mock` for the injected network module
- **AND** the fake type-checks against `Api`

#### Scenario: The drift guard catches a regression

- **WHEN** a migrated component imports a network module directly, OR a test re-mocks a migrated network boundary
- **THEN** the drift-guard test fails
- **AND** the allowlist is limited to the composition root + the `Api` implementation

#### Scenario: Resource, extract, report, and scenario tests inject overrides

- **WHEN** a provider, view, widget, hook, or context test needs network behavior
  from a migrated domain
- **THEN** it passes the needed method through a render-harness fake override
- **AND** no file-scoped `vi.mock("@/api...")` is declared for that behavior

#### Scenario: Error-branch tests inject telemetry capture

- **WHEN** a rendered component/context/widget test asserts error capture
- **THEN** it observes the injected `api.telemetry` fake
- **AND** it does not `vi.mock("@/lib/sentry")` unless it is a low-level Sentry
  wrapper or API implementation test

#### Scenario: Guard catches direct runtime import regression

- **WHEN** a migrated component, context, hook, widget, or view value-imports
  `@/api` or a standalone API network module
- **THEN** the guard fails and reports the offending file and boundary

#### Scenario: Guard catches per-file mock regression

- **WHEN** a rendered consumer test reintroduces `vi.mock("@/api...")` or
  `vi.mock("@/lib/sentry")` for app-facing behavior
- **THEN** the guard fails and reports the offending file and boundary
- **AND** API transport and Sentry wrapper unit tests remain allowed only by
  explicit allowlist
