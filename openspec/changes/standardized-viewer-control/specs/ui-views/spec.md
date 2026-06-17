# Spec Delta — ui-views

## MODIFIED Requirements

### Requirement: The step strip and jump-ahead gating SHALL read journey progress, not frames

The onboarding step strip and the jump-ahead guard SHALL derive their current
stage, completion marks, and gating from the explicit journey-progress state, not
from any frame value and not from the viewer step history. The strip covers Ingest,
Understand, Analyze (with Extract, Interact, and Report sub-steps), and Integrate. A
step-strip pill click SHALL change the canvas by dispatching the corresponding
navigation intent through the orchestrator, never by calling a frame action.

#### Scenario: Clicking a step-strip pill dispatches an intent

- **GIVEN** the onboarding step strip
- **WHEN** the user clicks the Report sub-step
- **THEN** the canvas changes via a dispatched `showReport` intent
- **AND** the step strip's reached/gating state comes from journey progress

### Requirement: The Understand auto-advance SHALL go through dispatch

When the Understand "reading the document" animation finishes, the canvas SHALL
advance to Extract by dispatching the `showExtract` intent through the orchestrator
(the same path every other trigger uses), not by a direct frame or step mutation.
This auto-advance behavior is retained.

#### Scenario: Auto-advance on done dispatches showExtract

- **GIVEN** the Understand scan animation completes on first arrival
- **THEN** a `showExtract` intent is dispatched
- **AND** the canvas shows the extract-workbench step

## ADDED Requirements

### Requirement: The onboarding pick-a-view pills SHALL dispatch showExtract directly

The onboarding "Pick a view" pills SHALL remain per-schema-category in onboarding
(a curated, small, known schema) and SHALL remain the existing `PickViewPill`
component, dispatching a `showExtract` intent carrying that category as
`focusedCategoryId` directly through the orchestrator. They SHALL NOT route through
the suggested-action rendering path. A pill SHALL work from any current view (it
names its full destination), and SHALL re-focus the live Extract view when Extract
is already shown.

#### Scenario: A pick-a-view pill works from another view

- **GIVEN** the canvas currently shows the Report view and the chat shows the pick-a-view pills
- **WHEN** the user clicks the "Meters" pill
- **THEN** a `showExtract` intent with `focusedCategoryId` Meters is dispatched
- **AND** the canvas switches to Extract focused on Meters

#### Scenario: Re-focusing within Extract is live

- **GIVEN** the canvas shows Extract focused on Statement
- **WHEN** the user clicks the "Charges" pill
- **THEN** Extract re-focuses to Charges without a remount
