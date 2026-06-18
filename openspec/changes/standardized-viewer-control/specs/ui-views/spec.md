# Spec Delta — ui-views

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: F-series view transitions SHALL accumulate ViewerSteps with surface-specific annotations

Each navigation SHALL push a corresponding `ViewerStep` onto `viewer.history` carrying the surface's cross-navigation state in its payload. Ingest → ingest-picker (with optional `attachedSchema` annotation); Understand → doc-viewer(documentId); Extract / schema-design / Report-render → extract-workbench(scenarioId, focusedCategoryId?, surface?) or report(surface); Interact → interact-chat(scenarioId); Integrate → integrate.

`OnboardingShell.canvasContent` SHALL switch on `currentStep.kind` to select which surface to render. Surfaces SHALL read scenario / category / document props from the step's payload. There SHALL be no top-level `currentFrame` slot and no `currentFrame`-derived getter; new and existing code SHALL select the surface from the active step kind, never from a frame value.

#### Scenario: currentStep.kind drives canvas rendering

- **GIVEN** the active session's `viewer.currentStep` points at `{ kind: "extract-workbench", scenarioId: "utility", focusedCategoryId: "meters" }`
- **WHEN** `OnboardingShell` renders
- **THEN** the Extract surface mounts with scenario + focused-category props read from the step payload
- **AND** no read of `session.currentFrame` exists

#### Scenario: Ingest banner reads attachment from the viewer step

- **GIVEN** the latest viewer step is `{ kind: "ingest-picker", attachedSchema: { schemaId: "es-1", name: "Utility (custom)" } }`
- **WHEN** the IngestView renders
- **THEN** the `ingest-pre-attached-schema` banner renders showing the schemaId
- **AND** no read of `session.preAttachedSchemaId` exists

### Requirement: F1 IngestView SHALL render full-bleed without app chrome

The Ingest IngestView SHALL be rendered with no sidebar nav AND no chat
pane. The AppShell MUST expose a `chrome="bare"` mode that
`OnboardingShell` activates when the active viewer step kind is `ingest-picker`.
The IngestView occupies the full viewport width minus standard page
gutters; sidebar + chat slide back in during the Ingest → Understand transition
animation per `openspec/wireframes/source/spec-nav-v2.jsx`.

#### Scenario: Ingest hides sidebar and chat

- **GIVEN** the user is on `/onboarding` (no scenario picked) and the
  active viewer step kind is `ingest-picker`
- **WHEN** the OnboardingShell renders
- **THEN** no element with `aria-label="Primary navigation"` is in the document
- **AND** no element with `aria-label="Chat pane"` is in the document
- **AND** the IngestView fills the viewport.

#### Scenario: Ingest → Understand transition restores chrome

- **GIVEN** the user clicks a sample tile on Ingest
- **WHEN** the active viewer step advances to `doc-viewer` (Understand)
- **THEN** the sidebar slides in from the left over ~200ms
- **AND** the chat pane slides in beside it over ~200ms (starting ~100ms after the sidebar)
- **AND** the canvas compresses to accommodate both panes.

### Requirement: F2 UnderstandView SHALL render the PDF viewer during live parse

While the active viewer step is the Understand (doc-viewer) step, the canvas SHALL render the
`PdfViewerWidget` (centered, max-width ~560px, aspect 8.5/11) with the
scan-line animation overlaid, and the thinking-stream notes MUST render
in the chat column — NOT in the canvas. The step strip SHALL remain on
`Understand` (active green) for the entire Understand phase; it advances to
`Extract` only when the chat emits the `Done. … Ready to analyze.`
bubble.

#### Scenario: Understand canvas shows PDF + scan, chat shows thinking notes

- **GIVEN** the user has just clicked the Utility sample tile
- **WHEN** the Understand (doc-viewer) step settles
- **THEN** the canvas contains a `PdfViewerWidget` element
- **AND** a scan-line animation is running over the PDF
- **AND** the thinking notes (`parsing layout · page 1` …) render inside the chat column, not the canvas
- **AND** the step strip's active step is `Understand` (not `Extract`).

#### Scenario: Step strip advances on Done bubble

- **GIVEN** the Understand thinking stream is playing
- **WHEN** the chat emits the `Done. Ready to analyze.` bubble
- **THEN** the step strip transitions from `Understand` (active) to `Extract` (active)
- **AND** `Understand` becomes ✓ done-traversed.

### Requirement: The onboarding entry SHALL compose a `ChatExperience`; the gate remains a widget

The onboarding entry (the full-screen overlay / picker) SHALL select behavior by composing a
`ChatExperience` (`makeOnboardingExperience(...)`) and passing it to the shared view — not by branching
the shell on a frame to choose a view. The signup gate SHALL remain a widget (`SignUpWidget` /
`GateChatPanel` / `GateValueProp`, anonymous-only) shown by the onboarding surface, NOT a chat experience.

#### Scenario: Entry composes the experience; gate is a widget

- **GIVEN** the onboarding journey is active
- **WHEN** the shell mounts the main view
- **THEN** it composes `makeOnboardingExperience(...)` and passes it to `ConversationFlow`
- **AND** the gate, when active, is shown via its widgets, not as a `ChatExperience`
- **AND** the shell does not pick a canvas view by a `session.currentFrame` value (it selects from the active viewer step kind).
