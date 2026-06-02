# data-tier — flat GroundX document filter (delta)

## ADDED Requirements

### Requirement: The GroundX document filter SHALL hold no app/UI metadata; scenarios SHALL be sourced app-side

The GroundX document `filter` SHALL carry only GroundX-matchable scoping keys —
`{ projectId, workflow_id }` (flat) — and SHALL NOT store the scenario
`manifest`/`scenarioId`/`kind` blob. The onboarding scenario registry SHALL
build its `ScenarioConfig[]` from the app-owned scenario JSON configs (manifests)
and resolve each scenario's documents from the bucket by matching
`filter.projectId`, NOT by reading scenario metadata off the document filter. A
single `DocumentFilter` type + `stampDocumentFilter` helper (middleware-side; not
added to `@groundx/shared` without a frontend consumer) SHALL be the one way the
seed (and BYO upload) stamps the filter.

#### Scenario: Flat filter + app-sourced registry

- **GIVEN** the seeded sample document
- **WHEN** the seed stamps its filter and the registry lists scenarios
- **THEN** the doc's GroundX `filter` is `{projectId, workflow_id}` with no
  `manifest`/`scenarioId`/`kind`, the onboarding picker still lists the scenario
  (manifest read from the JSON config), and `search_content(filter:{projectId})`
  returns the document
