# Spec Delta - app-architecture

## MODIFIED Requirements

### Requirement: Transient surfaces SHALL render as overlays z-stacked over the current viewer step

The sign-up surface SHALL be represented as an entry in
`ViewerSession.overlays` (kind `sign-up`, state `pending | done |
dismissed`, optional `cause`). URL navigation to `/onboarding/signup`
SHALL push the overlay; navigation away SHALL pop it. The overlay is
the source of truth for the sign-up viewer surface.

The previous canvas/chat swap pattern in `OnboardingShell` and `ChatColumn`
SHALL be retired. A sign-up overlay SHALL NOT cause `ChatColumn` to render
`GateChatPanel`, `GateChatRail`, or any other replacement chat panel.
`ChatColumn` SHALL keep the shared `ConversationFlow` mounted once the user
enters the sign-in flow. `gate.status` MAY remain as lifecycle and analytics
state, but it SHALL NOT choose the chat surface.

`OnboardingShell` SHALL compute sign-in overlay activity and pass that state to
the chat composition root explicitly. `ChatColumn` SHALL NOT rediscover sign-in
state from `gate.status` or use `gate.status` as a flow mode.

`OnboardingShell` SHALL render the current viewer step as an underlay and
z-stack blocking overlays such as `sign-up` and `book-call` above it. The
underlay SHALL be `aria-hidden` and inert while a blocking overlay is active.
The active StepStrip pill SHALL remain derived from the viewer underlay while
sign-in is active: F1-origin sign-up remains on Ingest, and sample-origin
sign-up preserves the active sample step.

#### Scenario: URL navigation to /onboarding/signup pushes a sign-up overlay

- **GIVEN** the user is on F1 with no overlays
- **WHEN** the user navigates to `/onboarding/signup`
- **THEN** a `{ kind: "sign-up", state: "pending" }` overlay is pushed
- **AND** the AppShell chat/viewer split is visible
- **AND** `<ConversationFlow />` mounts in the chat column
- **AND** the sign-up viewer widget mounts over the F1/main underlay
- **AND** the StepStrip remains on Ingest because no sample is active
- **AND** no `GateChatPanel` or `GateChatRail` live panel mounts.

#### Scenario: Navigating away from /onboarding/signup pops the overlay

- **GIVEN** the sign-up overlay is present
- **WHEN** the user navigates to `/onboarding`
- **THEN** the sign-up overlay is popped
- **AND** the F1 picker returns
- **AND** the same `ChatSession` remains the active onboarding session.

#### Scenario: Direct sample navigation from sign-up continues the session

- **GIVEN** the user is on `/onboarding/signup`
- **WHEN** the user navigates to `/onboarding/<bucketId>/utility`
- **THEN** the sign-up overlay is popped before the Utility viewer step renders
- **AND** the Utility sample activates in the same `ChatSession`
- **AND** the normal onboarding `ConversationFlow` renders the Utility experience.

#### Scenario: openGate opens sign-in in the active viewer

- **GIVEN** a user is viewing a sample on Extract, Interact, Report, or Integrate
- **WHEN** the app dispatches an `openGate` intent
- **THEN** the active session gets a pending `sign-up` overlay
- **AND** the existing viewer step remains under the overlay
- **AND** the StepStrip stays on the existing viewer step's mapped pill
- **AND** the chat column keeps the shared `ConversationFlow` mounted.

#### Scenario: Blocking overlays hide the underlay from interaction

- **GIVEN** the sign-up or book-call overlay is active
- **WHEN** the viewer stack renders
- **THEN** the viewer underlay is `aria-hidden`
- **AND** the viewer underlay is inert
- **AND** keyboard focus stays within the active overlay or chat controls.
