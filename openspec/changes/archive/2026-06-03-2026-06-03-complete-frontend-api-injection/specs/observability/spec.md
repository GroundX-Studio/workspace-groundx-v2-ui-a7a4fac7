# observability Specification (delta)

## ADDED Requirements

### Requirement: Frontend error capture SHALL be injectable through the Api telemetry group

Frontend runtime error capture SHALL be injected for rendered consumers through
`Api.telemetry.captureException`. Component, context, hook, or widget behavior
SHALL receive error-capture behavior through the injected app-facing `Api`
surface. Production SHALL still route runtime capture to the existing Sentry
wrapper, but rendered tests SHALL observe an injected fake instead of declaring
per-file `vi.mock("@/lib/sentry")`.

Production Sentry initialization MAY remain outside this injected runtime
capture seam.

Low-level Sentry wrapper tests and API implementation tests MAY continue to test
or mock the wrapper directly.

#### Scenario: Rendered runtime error branch uses injected telemetry

- **WHEN** a rendered runtime consumer catches an error and records it
- **THEN** it calls `Api.telemetry.captureException`
- **AND** production wiring forwards that call to the existing Sentry wrapper

#### Scenario: Rendered runtime tests do not mock Sentry per file

- **WHEN** a rendered component/context/widget test asserts error capture
- **THEN** it injects a telemetry fake through the app-facing test surface
- **AND** it does not declare `vi.mock("@/lib/sentry")`
