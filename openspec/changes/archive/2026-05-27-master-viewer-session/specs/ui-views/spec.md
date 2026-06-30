# Spec Delta — ui-views

## ADDED Requirements

### Requirement: F-series view transitions SHALL accumulate ViewerSteps with surface-specific annotations

Each F-series transition SHALL push a corresponding `ViewerStep` onto
`viewer.history` carrying the surface's cross-navigation state in its
payload. F1 → ingest-picker (with optional `attachedSchema`
annotation); F2 → doc-viewer(documentId); F3/F3a/F4 →
extract-workbench(scenarioId, focusedCategoryId?); F5/F6 →
interact-chat(scenarioId); F7 → integrate.

Surfaces that previously held step-scoped state as ad-hoc
`OnboardingSession` slots — most notably the F1 ingest-picker's
pre-attached schema banner — SHALL read that state from the latest
`ViewerStep` annotation instead. The legacy slots SHALL be removed
once all readers have migrated.

#### Scenario: ExtractView's post-Save handoff lands the attachment on the next F1 step

- **GIVEN** a user completes Save → sign-in → persist on F3a
- **WHEN** the post-commit effect fires
- **THEN** `advanceFrame("f1")` runs (pushes a bare ingest-picker step)
- **AND** a subsequent `pushStep({ kind: "ingest-picker", attachedSchema: { schemaId, name } })` lays the annotation on top
- **AND** `appendAgentMessage("Schema attached: <name>")` records the event in chat history

#### Scenario: F1 banner reads attachment from the viewer step

- **GIVEN** the latest viewer step is `{ kind: "ingest-picker", attachedSchema: { schemaId: "es-1", name: "Utility (custom)" } }`
- **WHEN** `IngestView` renders
- **THEN** the `ingest-pre-attached-schema` banner renders showing the schemaId
- **AND** no read of `session.preAttachedSchemaId` exists (the slot was removed)
