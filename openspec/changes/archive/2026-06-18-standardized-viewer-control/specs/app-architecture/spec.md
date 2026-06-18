# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: The orchestrator dispatch SHALL be the sole path that changes viewer state

Every change to what the canvas shows SHALL flow through
`CanvasOrchestrator.dispatch(intent, source)`. The viewer-step mutators
(`pushStep`, `gotoDocViewer`, the active-step mutator, `showCitationRegions`,
`clearCitationHighlight`, `clearCitationRegions`) SHALL be reachable ONLY from the
orchestrator module; they SHALL NOT be exported to or called from component, view,
or chat-experience modules. The boundary SHALL be structural (the mutators are not
re-exported across that boundary) and SHALL be backed by a guard test that fails if
any production module outside the orchestrator references a viewer-step mutator.

#### Scenario: A trigger changes the viewer only by dispatching

- **GIVEN** any trigger (chat tool, suggested affordance, citation click, step-strip pill, onboarding pick-a-view pill, the auto-advance on "Done")
- **WHEN** it changes what the canvas shows
- **THEN** it calls `dispatch(intent, source)` and never a viewer-step mutator directly
- **AND** the dispatch records the intent in `intent_log` and `viewer_events`

#### Scenario: Guard test forbids a bypass

- **GIVEN** a production module under `components/`, `views/`, or `conversation/experiences/`
- **WHEN** the guard test scans it
- **THEN** the test fails if the module references any viewer-step mutator

### Requirement: The active viewer step SHALL be the only model of what the canvas shows

The canvas SHALL render purely as a function of the active `ViewerStep`. Viewer
sub-position SHALL live on the step itself: the `extract-workbench` step SHALL
carry an optional `focusedCategoryId` AND an optional `surface: "fields" | "design"`
(the schema-design surface — replacing the `currentFrame === "f3a"` read, and MIRRORING
the `report` step's existing `surface: "render" | "builder"` field name — not a new
`mode` field), and the `report` step SHALL carry an optional `selectedSectionId` and its
existing `surface`. `ScopedCanvas`
SHALL forward that sub-position to the mounted widget. A change that only alters
sub-position SHALL mutate the active step in place rather than push a new history entry,
so navigation history does not grow on a focus change. The schema-design surface SHALL be
reachable in BOTH the steady and onboarding experiences (it is unreachable for
authenticated users today — a defect this requirement closes).

#### Scenario: Focusing a category mutates the active step

- **GIVEN** the canvas shows the extract-workbench step focused on category A
- **WHEN** a `showExtract` intent with `focusedCategoryId` B is dispatched
- **THEN** the active extract-workbench step's `focusedCategoryId` becomes B in place
- **AND** the viewer history length is unchanged
- **AND** the Extract widget renders category B focused

### Requirement: The step strip SHALL read journey progress from a frame-free source

The step strip SHALL source its inputs frame-free. The current step, the set of
completed steps, and the Analyze sub-step state are all derived from frames today
(current step from the current frame, completed steps from the completed frames, the
Analyze sub-steps from the current frame); after this change the current stage SHALL
come from the active viewer step kind via the existing `VIEWER_STEP_TO_JOURNEY` map
(which the strip already uses, with the frame only as a fallback — the fallback is
dropped, the map is reused), and the reached-set (the strip's completion checkmarks)
SHALL come from a small persisted **set of reached stages** (NOT a monotonic
high-water-mark — `integrate` is reachable out of order, so the reached state is
genuinely non-contiguous), over the stages Ingest, Understand, Analyze, and Integrate. A
stage SHALL be added to the set on dispatch only when it is reached for the first time. The step strip SHALL keep its
existing consumer shape (the journey catalog, the pill-state function, the step
descriptors). The existing jump-ahead gating behavior, the rule that a citation jump
does not re-lock a traversed bracket, and the jump-ahead regression test SHALL be
preserved. Journey progress SHALL exist only in onboarding.

#### Scenario: Dispatch advances journey progress with no frame read

- **GIVEN** an onboarding session whose reached stages are Ingest and Understand
- **WHEN** a `showExtract` intent is dispatched
- **THEN** the current stage becomes Analyze and the reached-set gains Analyze
- **AND** the step strip reads no frame value

### Requirement: Resume and the LLM-context snapshot SHALL be frame-free

The resume anchor SHALL be a persisted active viewer step (kind plus payload),
replacing `lastFrame`, and SHALL be restored VERBATIM on hydrate (the last position,
NOT a highest-reached watermark — the code documents a stale-resume bug from
conflating the two). The reached-set SHALL be a separate persisted set of reached stages,
replacing `completedFrames`, used only for the strip checkmarks and never for resume.
The chat request's current-entity-snapshot axis SHALL convey position as the journey
stage and the active viewer step kind, NOT as `lastFrame` or `completedFrames`. The
frame-named persisted fields (`lastFrame`, `completedFramesJson`) SHALL be removed
(pre-launch, no data migration).

#### Scenario: The model receives stage and step, not frames

- **GIVEN** a chat request built after this change
- **THEN** its entity snapshot carries the journey stage and the active step kind
- **AND** it carries no `lastFrame` or `completedFrames`

#### Scenario: A returning user resumes on their last view verbatim

- **GIVEN** a user who left on the Report view, then reloads
- **WHEN** the session hydrates
- **THEN** the persisted active viewer step is restored verbatim (the Report view)
- **AND** the resume does not jump to a highest-reached stage

### Requirement: A navigation intent SHALL produce the same viewer-step change regardless of experience

Each navigation intent SHALL produce one viewer-step outcome that does not depend
on whether the session is onboarding or steady. The orchestrator handlers for the
navigation intents SHALL NOT fork on the experience; each pushes or mutates the
corresponding step honoring the intent payload (scope, schemaId, focusedCategoryId,
selectedSectionId). Onboarding-only concerns such as journey-progress advance and
gate lifecycle SHALL layer on top of that one outcome, not replace it. The
showExtract handler SHALL honor the intent scope and schemaId and SHALL NOT hardcode
a scenario id.

#### Scenario: showExtract honors its payload in both experiences

- **GIVEN** a `showExtract` intent carrying a documents scope and a schemaId
- **WHEN** it is dispatched in either an onboarding or a steady session
- **THEN** the canvas shows the extract-workbench step over that scope and schema
- **AND** no scenario id is hardcoded in the handler

## MODIFIED Requirements

### Requirement: ViewerSession SHALL be the master viewer-state record per chat session

Every `ChatSession` SHALL carry a paired `ViewerSession` slot containing `history: ViewerStep[]`, `currentStep: { stepIndex: number }`, `overlays: ViewerOverlay[]`, and `workspace` (schema overlay + future workspace state).

Canvas surfaces SHALL be rendered by switching on `viewer.currentStep.kind`. `OnboardingShell.canvasContent` SHALL dispatch on the latest viewer step's kind. There SHALL be no `currentFrame`/`lastFrame` slot or derived getter on the session: "what the canvas shows" is the active viewer step kind, and "where you are in the journey" is the consolidated journey-progress state. Before any step has been pushed, the initial-mount surface SHALL be resolved from the active step kind (or the experience's seeded first step), NOT from a frame value.

Schema overlay state continues to be available on BOTH `ChatSession.pendingSchemaOverlay` (legacy) AND `ViewerSession.workspace.schemaOverlay` (canonical), kept in lockstep by the provider's projected-state layer. Removing the legacy slot is deferred to a follow-up `schema-overlay-canonical-on-viewer` change.

#### Scenario: ViewerSteps drive the canvas switch

- **GIVEN** a session with `viewer.currentStep.kind === "extract-workbench"`
- **WHEN** `OnboardingShell` renders
- **THEN** the Extract workbench mounts (resolved from the step kind, with no frame read)
- **AND** no code reads a `currentFrame` value to choose the surface

#### Scenario: pickScenario pushes a step matching the entity's resolved position

- **GIVEN** an entity for `sample:utility` that already exists with a persisted active viewer step of `interact-chat`
- **WHEN** `pickScenario("utility")` is called
- **THEN** the entity is re-activated (its persisted active step is preserved)
- **AND** the pushed viewer step is `interact-chat` (matching the resume position), NOT `doc-viewer` (the brand-new-entity default)

### Requirement: F1 overlay SHALL hide the underneath shell from assistive tech

The Ingest overlay SHALL render as a full-viewport opaque pane covering the underneath AppShell, AND the underneath AppShell wrapper MUST be marked `aria-hidden="true"` and `inert` while the Ingest overlay is mounted, so that screen readers and keyboard navigation do not surface the masked-out sidebar and chat-pane elements. The visual Ingest chrome (no nav, no chat pane visible) is already achieved by the overlay; this requirement closes the a11y leak. The overlay-mounted condition SHALL be derived from the active viewer step kind being `ingest-picker`, NOT from a `currentFrame` value.

#### Scenario: Ingest a11y tree exposes only the IngestView

- **GIVEN** the user is on `/onboarding` with the active viewer step kind `ingest-picker`
- **WHEN** assistive tech walks the page
- **THEN** the underneath shell wrapper has `aria-hidden="true"`
- **AND** the underneath shell wrapper has the `inert` attribute
- **AND** keyboard Tab does NOT focus elements inside the underneath shell.

#### Scenario: Leaving Ingest restores the shell to the a11y tree

- **GIVEN** the active viewer step advances away from `ingest-picker` (e.g. to `doc-viewer`)
- **WHEN** the Ingest overlay unmounts
- **THEN** the underneath shell wrapper has neither `aria-hidden` nor `inert`
- **AND** the sidebar nav, chat pane, and step strip are all reachable by assistive tech.

### Requirement: Orchestrator dispatch SHALL be exhaustive over the CanvasIntent union

The orchestrator's `dispatch()` SHALL switch over `intent.kind` with a `never` exhaustiveness check so a
new `CanvasIntent` kind without a handler fails type-checking (replacing the chain of independent
`if (intent.kind === …)` blocks that silently no-op'd an unhandled kind). Every `CanvasIntent` kind
SHALL be named by a `case` in that switch: kinds with a built-in orchestrator side effect run it in
their case; kinds routed only through the `registerAdapter` adapter registry (e.g. `submitSignup`,
`wizardNext`/`wizardBack`/`wizardFinish`, `dismissWizard`, `closeDialog`) are explicit no-op cases so
the exhaustiveness check still names them. `showSample`, `editSchema`, and
`openDocument` SHALL be built-in cases (formerly adapter-registry-only, which left them silent no-ops
on the live canvas). The `switchFrame` kind is removed from the union entirely (see the REMOVED frame-model requirement), so it SHALL NOT appear as a case. The built-in cases produce one viewer-step outcome:
`showSample` → activates the scenario and pushes/restores its viewer step (onboarding-scoped; an
honest no-op-with-reason in steady); `editSchema` → moves the active `extract-workbench` step into its
`surface: "design"` sub-position (NOT `advanceFrame("f3a")`), reachable in BOTH steady and onboarding;
`openDocument` → `ChatStore.gotoDocViewer` (page defaults to 1), mirroring `jumpToPage`. The
`registerAdapter` mechanism is RETAINED — it has live non-test callers (the SignUpWidget, DialogTitle,
and OnboardingWizard adapters), and the `adaptersRef.get(intent.kind)` dispatch path runs after the
switch unchanged.

#### Scenario: A new intent kind fails type-check

- **GIVEN** a new `CanvasIntent` kind added to the union with no `case` in the `dispatch` switch
- **WHEN** the project is type-checked
- **THEN** the `never` exhaustiveness assertion (`assertNeverIntent(intent)`) fails with an error naming
  the unhandled kind (rather than the dispatch silently no-opping).

#### Scenario: editSchema reaches the design surface without a frame

- **GIVEN** an active `extract-workbench` step
- **WHEN** an `editSchema` intent is dispatched (in steady or onboarding)
- **THEN** the active step moves into `surface: "design"` and the schema-design surface renders
- **AND** the handler calls no `advanceFrame` and reads no `currentFrame`.

## REMOVED Requirements

### Requirement: The frame model SHALL include a report builder frame f4a

The onboarding frame model is removed in full: the `FFrame` type (f1–f7 incl. the
report-builder `f4a`), the `advanceFrame` action, the `currentFrame`/`lastFrame`
session slots, the `frameToStepStandalone` mapping, the persisted `completedFrames`,
and the `switchFrame` CanvasIntent SHALL all be removed. "What the canvas shows" is
the viewer step (the active step model above); "where you are in the journey" is the
consolidated journey-progress state (the frame-free strip above). The render-vs-builder
distinction the frame `f4`/`f4a` pair carried is now the `report` step's existing
`surface: "render" | "builder"` field, and the extract-vs-design distinction is the
`extract-workbench` step's `surface: "fields" | "design"` field. `advanceFrame`'s
non-navigation side effects (entity deactivate, gate reset plus sign-up overlay pop,
and the understand-completed analytics re-expressed as a stage/step event) SHALL be
re-homed into the dispatch handlers. No code path SHALL read or write a frame value
after this change.

#### Scenario: No frame vocabulary remains

- **GIVEN** the production source after this change
- **THEN** there is no `advanceFrame` / `currentFrame` / `lastFrame` / `frameToStepStandalone` / `completedFrames` / `FFrame` symbol
- **AND** the `CanvasIntent` union contains no `switchFrame` kind
- **AND** the render-vs-builder and extract-vs-design surfaces are selected by the step's `surface` field, not a frame
