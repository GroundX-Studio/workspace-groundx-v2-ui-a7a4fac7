# Spec Delta - testing-suite

## ADDED Requirements

### Requirement: Viewer shell consistency SHALL be verified by tests and browser evidence

Changes that add or modify viewer widgets SHALL verify that top-level viewer
chrome is provided by the shared viewer frame. Unit tests SHALL cover frame
variants and widget content integration. Browser verification SHALL measure the
live DOM at desktop, tablet, and mobile widths for user-visible viewer shell
consistency.

Verification SHALL treat the authenticated product shell as the base experience.
The required browser/test matrix includes signed-in complete `/workspaces`,
signed-in complete `/projects`, signed-in complete `/c/:sessionId`, signed-in
incomplete product routes with the onboarding wizard open, anonymous public
`/onboarding`, and anonymous product-route auth handling.

Browser verification SHALL use a repeatable local fixture setup and report the
setup in the evidence. The default fixture command is
`MOCK_MODE=true APP_REPOSITORY_MODE=memory npm run dev` unless the implementation
documents an equivalent repo-supported setup. The evidence SHALL identify how it
created a signed-in complete user, a signed-in incomplete user, an anonymous
session, and seeded data for built viewer content.

Authenticated route tests and browser checks SHALL activate real viewer content.
The active step SHALL resolve to a built `CanvasKind`; assertions that only
exercise the default `ingest-picker` state or the `scoped-canvas-unavailable`
placeholder SHALL fail.

Screenshots MAY be used as corroborating evidence, but pass/fail evidence SHALL
include measured DOM state such as active frame count, close button accessible
name, rendered dimensions, iframe bounds, loading/status band bounds, and chat
session identity.

Frame-count tests SHALL distinguish active foreground frames from inactive
underlay frames. The passing condition is exactly one visible, non-inert frame
with `data-viewer-frame-active="true"`; hidden or inert underlay frames MAY
exist but SHALL NOT expose reachable close/back actions.

#### Scenario: Tests catch duplicated viewer chrome

- **GIVEN** a viewer widget renders its own top-level close/back action while
  also being mounted inside the shared viewer frame
- **WHEN** the viewer shell contract tests run
- **THEN** the tests fail with a message naming the duplicated chrome
- **AND** the fix is to move the action to the frame descriptor or document a
  `hostless-exception`.

#### Scenario: Tests catch missing registry frame descriptors

- **GIVEN** a production scoped viewer widget registry entry omits its viewer
  frame descriptor or declares a descriptor that disagrees with the widget
  README policy
- **WHEN** the viewer shell contract tests run
- **THEN** the tests fail naming the widget kind and directory
- **AND** the fix is to add the descriptor or align the README policy.

#### Scenario: Tests catch authenticated route regressions

- **GIVEN** a signed-in complete product route renders `/workspaces`,
  `/projects`, or `/c/:sessionId`
- **WHEN** a viewer step resolves to registry-mounted viewer content
- **THEN** route tests fail if the content bypasses the shared viewer frame
- **AND** tests fail if an anonymous sign-up overlay or onboarding-only viewer
  chrome appears in the product route.
- **AND** tests fail if the route never activates a built `CanvasKind`.

#### Scenario: Tests catch signed-in onboarding overlay regressions

- **GIVEN** a signed-in user with incomplete onboarding state opens
  `/workspaces`, `/projects`, or `/c/:sessionId`
- **WHEN** the signed-in onboarding wizard opens
- **THEN** tests fail if the pathname changes
- **AND** tests fail if a second AppShell/chat/viewer hierarchy is mounted
- **AND** tests fail if the wizard is treated as anonymous sign-up viewer
  content.

#### Scenario: Tests catch stacked overlay active-frame drift

- **GIVEN** sign-in is open and book-call is pushed over it
- **WHEN** the OnboardingShell regression test inspects the viewer stack
- **THEN** only the book-call frame is active and keyboard reachable
- **AND** the sign-in frame is inert or hidden as an underlay.

#### Scenario: Browser evidence proves consistent shell behavior

- **GIVEN** authenticated product routes and onboarding overlays are opened at
  desktop, tablet, and mobile widths
- **WHEN** Chrome DevTools MCP inspects the page
- **THEN** each viewport reports one active viewer frame
- **AND** one accessible close/back action
- **AND** non-zero rendered dimensions for the frame body
- **AND** the normal chat conversation remains in the same session
- **AND** the current route pathname remains stable when the signed-in
  onboarding wizard decorates a product route
- **AND** the document has no horizontal overflow.

Browser evidence SHALL include these viewports unless the implementation notes
justify a different product breakpoint set:

- desktop: `1440 x 1000`;
- tablet: `1024 x 768`;
- mobile: `390 x 844`.

For each viewport, the measured report SHALL include:

- route/auth state under test;
- fixture seed method and user/session identity class;
- active `ViewerStep.kind`;
- resolved `CanvasKind`;
- active viewer-frame count;
- active close/back accessible name;
- active frame bounding box;
- frame body bounding box;
- iframe bounding box for book-call;
- loading/status band bounding box during booking initialization;
- product AppShell count;
- ConversationFlow count;
- route pathname before and after opening overlays;
- `document.documentElement.scrollWidth <= window.innerWidth`;
- active `chatSessionId` before and after opening/closing the frame.
