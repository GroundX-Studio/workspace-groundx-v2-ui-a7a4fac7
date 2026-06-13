# Spec Delta - ui-views

## ADDED Requirements

### Requirement: Authenticated product viewer surfaces SHALL use the shared viewer frame

Authenticated product routes SHALL be treated as the base experience.
`/workspaces`, `/projects`, and `/c/:sessionId` SHALL preserve the canonical
product shell and SHALL render registry-mounted viewer content through the
shared viewer frame whenever the active viewer step resolves to a built viewer
widget.

The frame SHALL NOT rely on anonymous onboarding state. Viewer-frame labels,
close/back actions, gutters, loading/status bands, and content modes SHALL be
consistent with the same contract used by onboarding viewer overlays.

Authenticated product-route proof SHALL activate a `ViewerStep` that resolves to
a built `CanvasKind`. Rendering only the default `ingest-picker` state or the
`scoped-canvas-unavailable` placeholder SHALL NOT satisfy this requirement.

#### Scenario: Workspace and project viewer content use shared chrome

- **GIVEN** a signed-in user with onboarding complete opens `/workspaces` or
  `/projects`
- **WHEN** a viewer step resolves to a built registry-mounted viewer widget
- **THEN** the product route remains mounted
- **AND** one normal chat timeline remains present
- **AND** the viewer widget appears inside the shared viewer frame
- **AND** no anonymous sign-up overlay or widget-local close/header chrome is
  visible.
- **AND** the assertion names the built `CanvasKind` under test.

#### Scenario: Steady session viewer content uses shared chrome

- **GIVEN** a signed-in user with onboarding complete opens `/c/:sessionId`
- **WHEN** a citation or active viewer step resolves to document viewer content
- **THEN** `SteadyShell` keeps the route and chat session active
- **AND** the document viewer appears inside the shared viewer frame
- **AND** the frame content mode preserves document/canvas affordances without
  duplicating top-level close/back chrome.
- **AND** the assertion is driven by a real `doc-viewer` viewer step or
  citation/tool path, not by a static placeholder.

#### Scenario: Signed-in onboarding wizard decorates the product route

- **GIVEN** a signed-in user with incomplete onboarding state opens
  `/workspaces`, `/projects`, or `/c/:sessionId`
- **WHEN** the signed-in onboarding wizard opens
- **THEN** the current product route pathname remains unchanged
- **AND** the product shell is not replaced by a second AppShell/chat/viewer
  hierarchy
- **AND** the wizard is treated as a product overlay, not as anonymous sign-up
  viewer content.

#### Scenario: Anonymous product route users do not receive signed-in onboarding

- **GIVEN** an anonymous user opens `/workspaces`, `/projects`, or
  `/c/:sessionId`
- **WHEN** auth routing resolves
- **THEN** the existing auth gate or redirect behavior applies
- **AND** the signed-in onboarding wizard is not visible
- **AND** onboarding viewer overlays are not mounted inside the product route.

### Requirement: Blocking onboarding viewer overlays SHALL use the shared viewer frame

Blocking onboarding viewer overlays, including sign-in and book-call, SHALL use
the shared viewer frame for their visible chrome. Overlay-specific content MAY
differ, but close/back placement, accessible name rhythm, pane gutters, loading
band placement, and scroll behavior SHALL be consistent across overlays.

The chat column SHALL remain the normal `ConversationFlow`; changing the viewer
frame SHALL NOT create a parallel chat surface.

The frame SHALL expose a labelled `region` by default. It SHALL NOT trap focus
away from chat unless a future modal policy is explicitly specified and tested.
Blocking overlay underlays remain inert at the viewer-stack level; the active
foreground frame remains keyboard reachable through the normal AppShell focus
model.

#### Scenario: Sign-in opens with standard viewer chrome

- **GIVEN** the user opens sign-in from F1 or from an active sample
- **WHEN** the sign-in overlay renders
- **THEN** the active viewer contains one shared viewer frame
- **AND** the frame close/back action uses contextual copy
- **AND** the sign-up form appears as frame content, not as a separate
  self-framed page
- **AND** the frame is labelled by the visible sign-in title or an equivalent
  accessible label
- **AND** the normal chat timeline remains reachable through compact shell
  controls.

#### Scenario: Book-call opens with standard viewer chrome

- **GIVEN** the user opens book-call from nav, chat intent, or sign-in
- **WHEN** the booking overlay renders
- **THEN** the active viewer contains one shared viewer frame
- **AND** the Calendly content uses the frame embed body
- **AND** the frame loading/status band appears while the embed is
  `initializing` or `embedding`
- **AND** the loading/status band clears when the embed reaches `ready`
- **AND** an error/status band replaces loading when the embed reaches `error`
- **AND** no loading indicator is absolutely positioned over the loaded
  Calendly widget.

#### Scenario: Booking opened from sign-in activates only the booking frame

- **GIVEN** sign-in is open from F1 or an active sample
- **WHEN** the user activates the sign-in content action to book a call
- **THEN** the sign-in frame remains mounted only as an inert underlay
- **AND** the book-call frame is the only active foreground frame
- **AND** closing book-call returns focus to the sign-in frame unless booking
  commits the gate.

#### Scenario: Compact layouts preserve the same chrome contract

- **GIVEN** the viewport is tablet or mobile width
- **WHEN** sign-in or book-call opens
- **THEN** the viewer frame remains the chrome owner
- **AND** the chat remains reachable through compact shell controls
- **AND** no widget-local close/header appears only at that breakpoint
- **AND** the active frame body has non-zero rendered width and height
- **AND** the page has no horizontal document overflow
- **AND** the close/back accessible name is not clipped or hidden.
