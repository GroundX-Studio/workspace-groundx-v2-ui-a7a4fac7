# testing-suite Specification (delta)

## ADDED Requirements

### Requirement: Repo-wide frontend tests SHALL use one injected fake for app-facing API behavior

For every migrated app-facing frontend runtime consumer, tests SHALL provide
network and telemetry behavior through one injected fake surface
(`makeFakeApi(overrides?)` via `ApiProvider` / render harness, or a sibling
provider if telemetry is separated). Tests SHALL NOT per-file mock `@/api`,
standalone API modules, API hooks, or `@/lib/sentry` for rendered
component/context/widget behavior.

Low-level API implementation tests MAY continue mocking transport modules such
as `@/api/axios` or `@/api/csrfFetch` when they are testing the API module
itself rather than a rendered runtime consumer.

#### Scenario: Resource, extract, report, and scenario tests inject overrides

- **WHEN** a provider, view, widget, hook, or context test needs network behavior
  from a migrated domain
- **THEN** it passes the needed method through a render-harness fake override
- **AND** no file-scoped `vi.mock("@/api...")` is declared for that behavior

#### Scenario: Error-branch tests inject telemetry capture

- **WHEN** a rendered component/context/widget test asserts error capture
- **THEN** it observes the injected telemetry fake
- **AND** it does not `vi.mock("@/lib/sentry")` unless it is a low-level Sentry
  wrapper or API implementation test

### Requirement: Final frontend API injection guard SHALL enforce the completed #10 scope

`frontend-api-injection-guard.test.ts` SHALL fail the build if any app-facing
runtime consumer value-imports the legacy aggregate or standalone network
modules, or if any rendered consumer test reintroduces per-file API/Sentry mocks.
Allowlists SHALL be explicit, narrow, and implementation-focused.

#### Scenario: Guard catches direct runtime import regression

- **WHEN** a migrated component, context, hook, widget, or view value-imports
  `@/api` or a standalone API network module
- **THEN** the guard fails and reports the offending file and boundary

#### Scenario: Guard catches per-file mock regression

- **WHEN** a rendered consumer test reintroduces `vi.mock("@/api...")` or
  `vi.mock("@/lib/sentry")` for app-facing behavior
- **THEN** the guard fails and reports the offending file and boundary
- **AND** API transport unit tests remain allowed only by explicit allowlist
