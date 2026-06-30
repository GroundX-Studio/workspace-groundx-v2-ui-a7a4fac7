# Spec Delta - app-architecture

## ADDED Requirements

### Requirement: Viewer widget chrome SHALL be owned by a shared viewer frame

Every live viewer widget mount SHALL be wrapped by a shared viewer frame that
owns top-level viewer chrome: close/back controls, header/title metadata,
loading/status bands, outer padding, scroll bounds, and content-mode treatment.
Viewer widgets SHALL own product content and content-level callbacks only.

The frame SHALL be composed by the viewer host (`OnboardingShell`, `SteadyShell`,
`ScopedCanvas` / its adjacent frame host, or a future viewer composition root),
not independently reinvented by each viewer widget. The frame SHALL accept a
typed descriptor derived from the active `ViewerStep`, `ViewerOverlay`, or
production `CanvasKind` registry entry.

Production scoped viewer registry entries SHALL declare a viewer-frame
descriptor or policy for each built `CanvasKind`. Overlay hosts SHALL declare
equivalent descriptors for each live `ViewerOverlay` kind. A viewer widget
mount that has no descriptor SHALL fail a drift guard.

Descriptor ownership SHALL remain catalog/composition-root based. Production
viewer descriptors SHALL live on the production scoped viewer registry entry.
Overlay descriptors SHALL live in an explicit overlay descriptor map owned by
the overlay host. Adapter helpers MAY convert a selected descriptor into frame
props, but SHALL NOT inspect global route, auth, onboarding, or app-mode context
to resolve which widget or descriptor is active.

The descriptor source-of-truth SHALL be explicit:
`app/src/components/layout/ViewerWidgetFrame/viewerFrameDescriptor.ts` owns shared
types and pure adapters; `app/src/widgets/scopedViewerWidget.ts` owns the
production descriptor shape; `app/src/widgets/scopedViewerWidgetRegistryProduction.ts`
is the runtime production descriptor read path; and
`app/src/views/Onboarding/viewerOverlayFrameDescriptors.ts` owns onboarding
overlay descriptors. No other file SHALL define a competing map from
`CanvasKind` or `ViewerOverlay` to viewer-frame policy.

Viewer widgets SHALL NOT render their own top-level close/back/header chrome
unless the widget README declares a `hostless-exception` and names the host that
owns equivalent chrome. Exceptions SHALL be enforced by tests and SHALL NOT be
used for convenience styling.

The contract counts active foreground frames, not raw DOM nodes. Underlay
frames MAY remain mounted while hidden by `aria-hidden` / inert overlay
containers, but they SHALL mark `data-viewer-frame-active="false"`. Exactly one
visible, non-inert frame SHALL mark `data-viewer-frame-active="true"` for the
foreground viewer.

#### Scenario: Sign-in and booking share the same viewer frame

- **GIVEN** the sign-up overlay is active
- **WHEN** the viewer renders
- **THEN** one shared viewer frame is present
- **AND** exactly one visible, non-inert viewer frame is active
- **AND** the close/back action uses the standard frame handle
- **AND** `SignUpWidget` renders content inside the frame without its own
  top-level close/back chrome.

- **GIVEN** the book-call overlay is active
- **WHEN** the viewer renders
- **THEN** one shared viewer frame is present
- **AND** exactly one visible, non-inert viewer frame is active
- **AND** the close/back action uses the same standard frame handle
- **AND** `BookCallView` renders Calendly content inside the frame without its
  own top-level close/back chrome.

#### Scenario: ScopedCanvas-mounted widgets receive registry frame descriptors

- **GIVEN** a production `ScopedCanvas` mount resolves a `doc-viewer`,
  `extract-workbench`, `report`, `report-builder`, or `integrate` kind
- **WHEN** the viewer content renders in onboarding, steady, workspace, or
  project shells
- **THEN** the resolved widget is wrapped by the shared viewer frame or by a
  documented `hostless-exception`
- **AND** the frame content mode comes from the production registry descriptor
- **AND** the shell does not hand-roll an alternate header, gutter, or loading
  layout around that widget.

#### Scenario: Authenticated route proof uses a built viewer step

- **GIVEN** a signed-in complete `/workspaces`, `/projects`, or `/c/:sessionId`
  route is under test
- **WHEN** the test or browser fixture activates viewer content
- **THEN** the active `ViewerStep` resolves through `stepToCanvasKind(...)` to
  a built `CanvasKind`
- **AND** the route does not satisfy the requirement by rendering the default
  `ingest-picker` or `scoped-canvas-unavailable` placeholder
- **AND** the assertion proves a real registry-mounted widget body is wrapped by
  the shared viewer frame.

#### Scenario: Authenticated product routes are the base viewer-frame proof path

- **GIVEN** a signed-in user with onboarding complete opens `/workspaces`,
  `/projects`, or `/c/:sessionId`
- **WHEN** the active viewer step resolves to a built production `CanvasKind`
- **THEN** the route keeps the authenticated product shell mounted
- **AND** the route renders one normal chat surface
- **AND** the resolved viewer content is wrapped by the shared viewer frame or
  by a documented `hostless-exception`
- **AND** no anonymous sign-up overlay or onboarding-only viewer chrome is
  mounted.

#### Scenario: Signed-in onboarding overlays the product route

- **GIVEN** a signed-in user with incomplete onboarding state opens
  `/workspaces`, `/projects`, or `/c/:sessionId`
- **WHEN** the onboarding wizard opens
- **THEN** the current product route pathname is preserved
- **AND** the wizard decorates the product shell instead of replacing it with a
  parallel AppShell/chat/viewer hierarchy
- **AND** if a wizard step hosts viewer-widget content, that content uses the
  shared viewer frame contract.

#### Scenario: Anonymous product routes do not get signed-in onboarding

- **GIVEN** an anonymous user opens `/workspaces`, `/projects`, or
  `/c/:sessionId`
- **WHEN** auth routing resolves
- **THEN** the existing auth redirect/gate behavior applies
- **AND** the signed-in onboarding wizard does not open
- **AND** anonymous onboarding viewer overlays are not mounted inside the
  product route.

#### Scenario: Stacked overlays keep only the foreground frame active

- **GIVEN** sign-in is open over a sample viewer
- **AND** book-call is opened from sign-in
- **WHEN** the viewer stack renders
- **THEN** any sample or sign-in underlay frame is inside an inert or
  `aria-hidden` container and has `data-viewer-frame-active="false"`
- **AND** the book-call frame has `data-viewer-frame-active="true"`
- **AND** only the book-call frame close/back action is keyboard reachable.

#### Scenario: Frame content modes preserve widget-specific layouts

- **GIVEN** a sign-up form is mounted in the viewer
- **WHEN** the frame renders with `centered-panel` content mode
- **THEN** the form is centered within the standard viewer gutters
- **AND** the close/back action remains in the frame chrome.

- **GIVEN** a Calendly embed is mounted in the viewer
- **WHEN** the frame renders with `embed` content mode
- **THEN** the iframe region can fill the available content area
- **AND** loading/status UI appears in the frame status band, not floating over
  the loaded iframe.

#### Scenario: Hostless exceptions are explicit and test-backed

- **GIVEN** a viewer widget cannot use the shared frame because another
  standardized host already owns equivalent chrome
- **WHEN** the widget README declares `hostless-exception`
- **THEN** the README names the owning host
- **AND** a drift guard or widget test proves that the host chrome exists
- **AND** the exception is not accepted silently.

### Requirement: Viewer widgets SHALL declare a viewer chrome policy

Every directory under `app/src/components/viewer-widgets/<Name>/` SHALL document
its viewer chrome policy in its README under `## Viewer chrome`. The policy
SHALL be one of:

- `framed` - normal content inside the shared viewer frame;
- `edge-to-edge inside ViewerWidgetFrame` - document, canvas, iframe, or
  workbench content that fills the frame body while the frame still owns chrome;
- `hostless-exception` - a documented exception naming the host that owns
  equivalent chrome.

The widget contract drift guard SHALL fail when the section is missing, when
the policy is not one of the allowed values, or when the README policy
contradicts the production registry descriptor for the widget's `CanvasKind`.

#### Scenario: Missing viewer chrome policy fails the drift guard

- **GIVEN** a viewer widget README lacks `## Viewer chrome`
- **WHEN** the widget contract drift guard runs
- **THEN** the test fails naming the widget directory
- **AND** the error tells the author to choose one allowed policy.

#### Scenario: A framed widget does not own top-level close chrome

- **GIVEN** a viewer widget README declares `framed`
- **WHEN** the widget contract drift guard scans the widget source
- **THEN** undocumented top-level close/back handles fail the test
- **AND** the error directs the author to move that chrome to the shared frame.
