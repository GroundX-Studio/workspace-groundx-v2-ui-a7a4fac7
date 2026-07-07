## ADDED Requirements

### Requirement: Loading SHALL be one shared animation exposed as a composable boundary around any UI element

Loading SHALL be a single shared animation provided as two composable layers: a `BreathingMark`
primitive (the one green loading visual, static under `prefers-reduced-motion`) and a `Loading`
boundary that renders the mark *in place of* its children while a region is loading and the
children otherwise. Whether the mark shows *in place of* content or *alongside* it SHALL be a
matter of which layer is used — the boundary for replace-in-place, the bare mark for inline —
NOT a mode flag on one component. The boundary can wrap ANY UI region at ANY granularity — a whole
viewer widget, a table or section inside one, a chat bubble — taking that region's own loading
condition; the mark fills the region it stands in (large in a full pane, small inline). It is NOT
a property of the ScopedViewerWidget base and is NOT declared on any widget descriptor; each
element that loads composes the boundary directly and owns its own loading condition. The same
mark SHALL be used everywhere a loading/thinking state is shown (viewer, chat, status band); no
surface SHALL render a bespoke loader and the retired `LoadingDots` SHALL NOT exist, enforced by a
drift guard. The boundary SHALL support an appearance delay so a region that loads within the
window never flashes the mark. The `ViewerWidgetFrame` status band — progressive/ambient status
over content that is already present — SHALL render the bare `BreathingMark` (small) inline with
its text, not the boundary. The `ViewerWidgetFrame` body SHALL lay its child out in a column so a
widget's content is not stretched to full height or centered mid-pane by the frame.

#### Scenario: The boundary wraps regions at different granularities

- **GIVEN** the extraction viewer, whose fields table loads separately from the viewer shell
- **WHEN** the whole viewer is loading, then later only the fields table is loading
- **THEN** the whole-viewer boundary shows the mark filling the pane
- **AND** the table-level boundary can show the mark filling just the table while the rest of the
  viewer is already rendered — the same component at two granularities.

#### Scenario: The mark fills the region it wraps

- **GIVEN** the shared boundary wrapping a full viewer pane versus wrapping an inline chat bubble
- **WHEN** each is loading
- **THEN** it is the same animation rendered large in the pane and small inline
- **AND** no surface renders a different loading animation, and `LoadingDots` no longer exists.

#### Scenario: Replace vs inline is which layer is used, not a flag

- **GIVEN** a chat bubble that is pending and the frame status band showing progress over visible content
- **WHEN** each renders its loading state
- **THEN** the chat pending state uses the `Loading` boundary — the mark stands in place of the bubble and is replaced by it when ready
- **AND** the status band uses the bare `BreathingMark` inline beside its text, not the boundary
- **AND** neither switches behavior via a `mode` flag on a single component.

#### Scenario: A bespoke loader fails the drift guard

- **GIVEN** an enumerated loading surface that renders its own ad-hoc loading UI instead of the shared boundary
- **WHEN** the drift guard runs
- **THEN** the guard fails until that surface uses the shared boundary, and separately asserts `LoadingDots` no longer exists.

#### Scenario: Frame body does not stretch a widget's content

- **GIVEN** a viewer widget mounted in `edge-to-edge` or `embed` content mode
- **WHEN** the frame body renders the widget
- **THEN** the widget's content is laid out from the top of a column
- **AND** a single short child is neither stretched to full height nor floated to the vertical
  middle by the frame body.

#### Scenario: Instant loads never flash the mark

- **GIVEN** a region whose load resolves within the boundary's appearance-delay window
- **WHEN** it renders
- **THEN** the mark never appears (it resolved before the delay elapsed)
- **AND** a region that never loads simply renders its content with no mark.
