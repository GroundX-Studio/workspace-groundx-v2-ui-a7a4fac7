# Spec Delta — scenarios

## ADDED Requirements

### Requirement: The scenario seed manifest SHALL carry only narrative copy, not data fixtures

The scenario seed manifest SHALL NOT carry `extractionSchema`, `sampleExtractionValues`, or
`sampleChatScript`, since the schema comes from `getGroundXWorkflow(filter.workflow_id)`, the
values from `getGroundXDocumentExtract(documentId)`, and the chat from the live router. The
manifest MAY retain `hero`, `thinkingScript`, and `chatSeeds` (starter-chip prompts that feed the
real chat). Re-seeding SHALL rewrite the carrier doc's `filter.manifest` so `/api/scenarios`
returns the slim manifest.

#### Scenario: Seeded manifest has no data fixtures

- **GIVEN** a freshly seeded scenario carrier doc
- **WHEN** `/api/scenarios` returns its manifest
- **THEN** the manifest has no `extractionSchema`, `sampleExtractionValues`, or `sampleChatScript`
- **AND** it still carries `hero`, `thinkingScript`, and `chatSeeds`.
