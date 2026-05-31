# Spec Delta — ui-views (onboarding shell adopts the shared main view)

Makes the onboarding shell host the same `AppShell` main view as the steady shell, with an
experience/scope-driven canvas. Shells stay separate; the view is shared.

## ADDED Requirements

### Requirement: Both shells SHALL host one shared `AppShell` main view

Each per-context shell SHALL host the same main view — `AppShell` with a `nav` slot, a `chat` slot
(`ConversationFlow` + the active `ChatExperience`), and a `canvas` slot (the experience/scope-driven
viewer). The shells themselves MAY differ (chrome, nav, entry points) and SHALL NOT be collapsed, but
neither shell SHALL re-implement the chat or canvas surface. The onboarding shell SHALL mount `AppShell`
(as it already does) and SHALL NOT carry a per-frame `canvasContent` canvas switch; its canvas slot SHALL
be the shared scope-driven viewer, exactly as the steady shell does.

#### Scenario: Onboarding and steady mount the same view assembly

- **GIVEN** the onboarding shell and the steady shell
- **WHEN** each renders its main view
- **THEN** both mount `AppShell` with `chat` = `ConversationFlow` and `canvas` = the scope-driven viewer
- **AND** the onboarding shell has no bespoke per-frame `canvasContent` switch
- **AND** the shells still differ only in chrome / nav / entry points (they are not collapsed).

### Requirement: The canvas SHALL be experience/scope-driven, not a per-frame view switch

The canvas slot SHALL select which `ScopedViewerWidget` to mount from the active viewer step kind and
SHALL feed it the active experience's `ContentScope` (and `documentId` where applicable), not from the
onboarding frame. The standalone per-frame views (`UnderstandView` / `ExtractView` / `InteractView` /
`IntegrateView`) SHALL be removed or reduced to thin wrappers with no `scenario.manifest` data reads.

#### Scenario: Frame advance changes the viewer step, not the canvas implementation

- **GIVEN** an onboarding session whose viewer step advances (e.g. doc-viewer → extract-workbench)
- **WHEN** the canvas re-renders
- **THEN** the same scope-driven canvas selector mounts the matching `ScopedViewerWidget` fed real data
- **AND** no standalone per-frame view is mounted
- **AND** no remaining code in `views/Onboarding/` reads `scenario.manifest.extractionSchema` / `sampleExtractionValues`.

### Requirement: The onboarding entry SHALL compose a `ChatExperience`; the gate remains a widget

The onboarding entry (the full-screen overlay / picker) SHALL select behavior by composing a
`ChatExperience` (`makeOnboardingExperience(...)`) and passing it to the shared view — not by branching
the shell on frame to choose a view. The signup gate SHALL remain a widget (`SignUpWidget` /
`GateChatPanel` / `GateValueProp`, anonymous-only) shown by the onboarding surface, NOT a chat experience.

#### Scenario: Entry composes the experience; gate is a widget

- **GIVEN** the onboarding journey is active
- **WHEN** the shell mounts the main view
- **THEN** it composes `makeOnboardingExperience(...)` and passes it to `ConversationFlow`
- **AND** the gate, when active, is shown via its widgets, not as a `ChatExperience`
- **AND** the shell does not pick a canvas view by `session.currentFrame`.
