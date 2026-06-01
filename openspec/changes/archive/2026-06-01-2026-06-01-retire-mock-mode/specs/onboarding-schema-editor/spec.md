# Spec Delta — onboarding-schema-editor (retire MOCK_MODE)

## MODIFIED Requirements

### Requirement: SchemaView SHALL read the live extract as its sole source

`SchemaView` SHALL render from the live extraction schema/values only; it SHALL NOT fall back to
`scenario.manifest.extractionSchema` or `scenario.manifest.sampleExtractionValues`. When live data is
absent, `SchemaView` SHALL surface the real empty/error ("live extract unavailable") state rather than
stale manifest fixtures, and its `data-extraction-status` SHALL reflect the live extraction state, not a
`"manifest"` default. The live extract is sourced from the real Extract data path
(`getGroundXWorkflow(filter.workflow_id)` for the schema, `getGroundXDocumentExtract(documentId)` for
the values) the production Extract widget uses — there is no `MOCK_MODE` runtime path. In tests, the
surfaces that mount `<SchemaView />` without explicit live props receive a real-shaped live extract
INJECTED at the test seam (a stubbed fetch / fake client), not via a `MOCK_MODE` env flag.

#### Scenario: No live data surfaces the real state, not the manifest

- **GIVEN** a scenario whose live extraction schema/values are unavailable
- **WHEN** `SchemaView` renders
- **THEN** it shows the empty/error ("live extract unavailable") state
- **AND** it does NOT read `scenario.manifest.extractionSchema` or `scenario.manifest.sampleExtractionValues`
- **AND** `data-extraction-status` reflects the live extraction state rather than `"manifest"`.

#### Scenario: A test-injected live extract supplies the demo surfaces

- **GIVEN** a test mounts `<SchemaView />` without explicit live props and injects a real-shaped live extract at the seam
- **WHEN** `SchemaView` renders
- **THEN** it renders the live schema/values from the injected source
- **AND** it does not read `scenario.manifest.*` to populate the schema/values
- **AND** no `MOCK_MODE` env flag is involved (none exists).
