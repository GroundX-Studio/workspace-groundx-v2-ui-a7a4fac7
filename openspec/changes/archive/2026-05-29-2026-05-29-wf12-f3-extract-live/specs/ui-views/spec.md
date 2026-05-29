# Spec Delta — ui-views

## ADDED Requirements

### Requirement: F3 Extract SHALL render live workflow schema and extract values

F3 SHALL render the extraction schema and field values from live GroundX, not the scenario
manifest. The schema MUST come from `getGroundXWorkflow(filter.workflow_id)` (resolved via
`getDocument`) and the values from `getGroundXDocumentExtract(documentId)`; `ExtractView`,
`SchemaView` (F3a), and the `ChatColumn` schema read MUST NOT read
`scenario.manifest.extractionSchema` or `sampleExtractionValues`. The overlay-merge and F3a save
flow MUST operate on the live schema.

#### Scenario: F3 shows real extracted values

- **GIVEN** the Utility sample doc with a `filter.workflow_id`
- **WHEN** F3 renders
- **THEN** the values come from `getGroundXDocumentExtract` (the real bill figures)
- **AND** no manifest `sampleExtractionValues` are displayed.
