# Spec Delta — ui-views (retire MOCK_MODE)

## MODIFIED Requirements

### Requirement: Onboarding frame views SHALL render live GroundX data, not manifest fixtures

The onboarding frame views SHALL render live GroundX data and SHALL NOT read scenario-manifest
data fixtures. Specifically, F2 UnderstandView sources page images from `getGroundXDocumentXray`,
F3 ExtractView sources the schema from `getGroundXWorkflow(filter.workflow_id)` and values from
`getGroundXDocumentExtract`, and F5 InteractView sources chat turns from the live chat router —
none of them read `scenario.manifest.extractionSchema`, `sampleExtractionValues`, or
`sampleChatScript`. Each view MUST mount the same production widget used in steady mode and pass a
`mode: "onboarding" | "steady"` prop that locks editing affordances in onboarding without forking
the data path. There SHALL be no `MOCK_MODE` runtime fallback for any of these views; deterministic
behavior in tests is supplied by fakes/fixtures INJECTED at the data seam, not by a `MOCK_MODE` env
flag (none exists).

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

#### Scenario: No MOCK_MODE fallback path exists for the onboarding frame views

- **GIVEN** the onboarding frame views in any environment
- **WHEN** GroundX data is fetched
- **THEN** the data comes from the real GroundX clients (or a test-injected fake at the seam)
- **AND** there is no `MOCK_MODE` env-driven fallback path.
