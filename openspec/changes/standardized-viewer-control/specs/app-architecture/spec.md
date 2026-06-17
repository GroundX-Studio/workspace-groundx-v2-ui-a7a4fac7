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

## REMOVED Requirements

### Requirement: The onboarding frame machine (f1–f7) and the `switchFrame` intent

The onboarding `currentFrame` vocabulary, the `advanceFrame` action, the
`frameToStepStandalone` mapping, the persisted `completedFrames`, and the
`switchFrame` CanvasIntent SHALL be removed. "What the canvas shows" is the viewer
step (above); "where you are in the journey" is the consolidated step-based progress
(above). `advanceFrame`'s non-navigation side effects (entity deactivate, gate reset
plus sign-up overlay pop, and the understand-completed and frame-advanced analytics
re-expressed as stage or step events) SHALL be re-homed into the dispatch handlers.
No code path SHALL read or write a frame value after this change.

#### Scenario: No frame vocabulary remains

- **GIVEN** the production source after this change
- **THEN** there is no `advanceFrame` / `currentFrame` / `frameToStepStandalone` / `completedFrames` symbol
- **AND** the `CanvasIntent` union contains no `switchFrame` kind

## MODIFIED Requirements

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
