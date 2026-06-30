# Spec Delta — ui-views

## MODIFIED Requirements

### Requirement: F-series view transitions SHALL accumulate ViewerSteps with surface-specific annotations

Each F-series transition SHALL push a corresponding `ViewerStep` onto `viewer.history` carrying the surface's cross-navigation state in its payload. F1 → ingest-picker (with optional `attachedSchema` annotation); F2 → doc-viewer(documentId); F3/F3a/F4 → extract-workbench(scenarioId, focusedCategoryId?); F5/F6 → interact-chat(scenarioId); F7 → integrate.

`OnboardingShell.canvasContent` SHALL switch on `currentStep.kind` to select which surface to render. Surfaces SHALL read scenario / category / document props from the step's payload — NOT from a top-level `currentFrame` slot. The legacy `currentFrame` is preserved as a derived getter on `useOnboardingSession().state` for backwards-compat with StepStrip + step-pill click handlers; new code MUST NOT depend on it for surface selection.

#### Scenario: currentStep.kind drives canvas rendering

- **GIVEN** the active session's `viewer.currentStep` points at `{ kind: "extract-workbench", scenarioId: "utility", focusedCategoryId: "meters" }`
- **WHEN** `OnboardingShell` renders
- **THEN** `<ExtractView />` mounts with scenario + focused-category props read from the step payload
- **AND** no read of `session.currentFrame` is on the render hot path

#### Scenario: F1 banner reads attachment from the viewer step

- **GIVEN** the latest viewer step is `{ kind: "ingest-picker", attachedSchema: { schemaId: "es-1", name: "Utility (custom)" } }`
- **WHEN** `IngestView` renders
- **THEN** the `ingest-pre-attached-schema` banner renders showing the schemaId
- **AND** no read of `session.preAttachedSchemaId` exists
