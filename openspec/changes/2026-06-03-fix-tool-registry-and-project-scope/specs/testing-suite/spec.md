## ADDED Requirements

### Requirement: Tool metadata drift guards SHALL prevent app-side runtime handler regression

The app test suite SHALL include a guard that scans app `*.tools.ts`
declarations, including scaffold template declarations, and fails if any
declaration contains a runtime `handler` field.
The same guard SHALL fail if a production app `toolRegistry` singleton is
reintroduced. Declarative app tool metadata remains allowed for parity,
quality, references, and viewer widget descriptors.

#### Scenario: Handler field returns to app tool metadata

- **GIVEN** an app `*.tools.ts` file contains `handler:`
- **WHEN** app tool metadata tests run
- **THEN** the tests fail and name the offending file.

#### Scenario: Runtime app tool registry returns

- **GIVEN** `app/src/tools/registry.ts` is restored
- **WHEN** app tool metadata tests run
- **THEN** the tests fail because production app registry execution is no
  longer a valid source of truth.

### Requirement: Scoped project tests SHALL guard the projectId vocabulary

The app test suite SHALL include a focused guard for scoped project surfaces
that fails if `/projects` or Project `ChatExperience` source reintroduces
`filter.project`. Behavior tests SHALL also prove the ready-state project scope
uses `filter.projectId` and the loading state does not create a fallback
project-scoped chat session with a scenario slug.

#### Scenario: Scoped project source reintroduces filter.project

- **GIVEN** scoped project route or experience source contains
  `filter: { project: ... }` or reads `scope.filter.project`
- **WHEN** the scoped-project vocabulary guard runs
- **THEN** it fails and names the offending file.

#### Scenario: Project route tries to create a slug fallback session

- **GIVEN** the scenario registry is not ready
- **WHEN** `/projects` mounts the scoped conversation shell
- **THEN** it does not create a project chat session with
  `filter.projectId:"utility"` or `filter.project:"utility"`.
