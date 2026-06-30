# Spec Delta — ui-views

## ADDED Requirements

### Requirement: Onboarding frame views SHALL render live GroundX data, not manifest fixtures

The onboarding frame views SHALL render live GroundX data and SHALL NOT read scenario-manifest
data fixtures. Specifically, F2 UnderstandView sources page images from `getGroundXDocumentXray`,
F3 ExtractView sources the schema from `getGroundXWorkflow(filter.workflow_id)` and values from
`getGroundXDocumentExtract`, and F5 InteractView sources chat turns from the live chat router —
none of them read `scenario.manifest.extractionSchema`, `sampleExtractionValues`, or
`sampleChatScript`. Each view MUST mount the same production widget used in steady mode and pass a
`mode: "onboarding" | "steady"` prop that locks editing affordances in onboarding without forking
the data path. `MOCK_MODE` MUST remain only a local fallback for when GroundX is unreachable, not
the demo path.

#### Scenario: F3 extract reads the live workflow schema, not the manifest

- **GIVEN** the Utility sample doc with `filter.workflow_id` set
- **WHEN** F3 ExtractView renders
- **THEN** the schema comes from `getGroundXWorkflow(filter.workflow_id)` and values from
  `getGroundXDocumentExtract(documentId)`
- **AND** no `scenario.manifest.extractionSchema` / `sampleExtractionValues` read remains.

#### Scenario: F5 chat citations come from the live router

- **GIVEN** F5 InteractView
- **WHEN** the displayed turns + their citations are assembled
- **THEN** they come from live chat replies (real `documentId` + `bbox`), not
  `scenario.manifest.sampleChatScript`
- **AND** the `litRegions` painted on the PDF derive from those live citations.
