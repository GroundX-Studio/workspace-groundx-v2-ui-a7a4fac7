# observability Specification (delta)

## ADDED Requirements

### Requirement: Frontend error capture SHALL be injectable in rendered runtime tests

Frontend runtime error capture SHALL be injected for rendered consumers.
Component, context, hook, or widget behavior SHALL receive error-capture
behavior through an injected app-facing telemetry surface. Production SHALL
still route to the existing Sentry wrapper, but rendered tests SHALL observe an
injected fake instead of declaring per-file `vi.mock("@/lib/sentry")`.

Low-level Sentry wrapper tests and API implementation tests MAY continue to test
or mock the wrapper directly.

#### Scenario: Rendered runtime error branch uses injected telemetry

- **WHEN** a rendered runtime consumer catches an error and records it
- **THEN** it calls the injected telemetry/error-capture surface
- **AND** production wiring forwards that call to the existing Sentry wrapper

#### Scenario: Rendered runtime tests do not mock Sentry per file

- **WHEN** a rendered component/context/widget test asserts error capture
- **THEN** it injects a telemetry fake through the app-facing test surface
- **AND** it does not declare `vi.mock("@/lib/sentry")`
