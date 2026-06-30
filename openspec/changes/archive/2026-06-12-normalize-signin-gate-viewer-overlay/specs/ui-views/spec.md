# Spec Delta - ui-views

## ADDED Requirements

### Requirement: F1 sign-up SHALL transition into the chat/viewer product surface

The F1 onboarding view SHALL remain full-bleed at `/onboarding`. When the user
clicks **Sign up** or lands on `/onboarding/signup`, the UI SHALL reveal the
standard AppShell split with the normal chat timeline and the sign-in viewer
overlay. This transition SHALL NOT mint a sample entity or a new chat session.

The sign-in viewer surface SHALL expose stable accessible controls and test
handles for its live actions: `sign-up-viewer-surface`,
`sign-up-viewer-close`, `sign-up-viewer-book-call`, and
`sign-up-viewer-continue-integrate` when the continue action is visible.

#### Scenario: F1 sign-up reveals chat and viewer

- **GIVEN** the user is on `/onboarding`
- **WHEN** the user clicks **Sign up**
- **THEN** the app navigates to `/onboarding/signup`
- **AND** the chat column is visible
- **AND** the viewer pane shows the sign-in surface
- **AND** the sign-in surface exposes **Back to samples**
- **AND** the F1 picker is no longer the full-screen foreground overlay.

#### Scenario: Closing sign-in from F1 returns to samples

- **GIVEN** the user entered sign-in from F1 with no active sample
- **WHEN** the user activates **Back to samples**
- **THEN** the app navigates to `/onboarding`
- **AND** the full-bleed F1 picker returns
- **AND** the chat session remains available for the next entry.

#### Scenario: Closing sign-in from a sample returns to the active viewer

- **GIVEN** the user opened sign-in from an active sample viewer
- **WHEN** the user activates **Close sign-in**
- **THEN** the sign-in overlay is popped
- **AND** the active sample viewer step remains visible
- **AND** the chat timeline remains mounted.

#### Scenario: Compact widths keep sign-in usable

- **GIVEN** the viewport is phone or compact tablet width
- **WHEN** sign-in opens
- **THEN** the viewer/sign-in surface is foregrounded
- **AND** a clear control lets the user return to chat
- **AND** no text, form controls, or close actions overlap.
