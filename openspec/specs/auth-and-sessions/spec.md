# auth-and-sessions Specification

## Purpose

Define the durable contract for user authentication and session lifecycle
— magic-link sign-in, anonymous-to-authed promotion, session cookies,
the BFF's Partner-API credential isolation, and how the session shape
flows from cookie issuance through chat / scenario / canvas contexts.
## Requirements
### Requirement: Magic-link sign-in SHALL be supported via dedicated send + callback routes

The middleware SHALL expose `POST /api/auth/magic-link/send` to provision
a magic-link email AND a callback route that mints a session on link
click. This SHALL replace the current direct-register-only path through
`commitGate("register")` for users who choose magic-link in the F6 gate.

#### Scenario: Magic-link send + callback round-trip

- **GIVEN** a user in the F6 gate who clicks "send magic link"
- **WHEN** the client POSTs to `/api/auth/magic-link/send` with the user's email
- **THEN** an email lands with a callback URL
- **AND** clicking the link hits the callback handler
- **AND** a server session is minted; the gate transitions to `committed`

### Requirement: SSO sign-in SHALL be supported via Partner-API-verified callbacks

When `SSO_ENABLED=true`, the middleware SHALL expose OAuth callback
routes for each configured IdP, verify the IdP token via Partner API,
and mint a server session on success. The IdP set (Google / Okta /
custom) is gated on a separate product decision and remains BLOCKED
until that lands.

#### Scenario: SSO callback mints a session

- **GIVEN** a deployment with `SSO_ENABLED=true` and an IdP configured
- **WHEN** the user completes the IdP redirect dance
- **THEN** the callback verifies the IdP token via Partner API
- **AND** a server session is minted matching the verified customer

### Requirement: Cross-browser session merge SHALL carry anon state forward on signin

The system SHALL merge a user's anon state (pinned answers,
in-progress schemas) into the signed-in account on signin, so the
user's browser-A work appears on browser B after they sign in. This
MUST work whether the anon state lives in localStorage
(already-migrated) or only in the DB (RT-* migration).

#### Scenario: Pinned answer carries to a new browser

- **GIVEN** a user with a pinned answer on browser A (anon session)
- **WHEN** the same user signs in on browser B
- **THEN** the pinned answer is visible on browser B
- **AND** the underlying `chat_session` rows share ownership with the new user

### Requirement: Sign-up surface SHALL be addressable as a viewer overlay

The sign-up surface SHALL be addressable as an entry in
`ViewerSession.overlays` (kind `sign-up`, state `pending | done |
dismissed`, optional `cause: GateCause`). URL-driven activation
(`/onboarding/signup`) SHALL push the overlay on entry and pop it on
exit. The overlay is the source of truth for the sign-up canvas swap.

The identity-level "signed-in" fact (the user has completed sign-up
and a server session is minted) is distinct from the overlay's
lifecycle. It SHALL continue to be carried by
`AppModeContext.authState === "signed-in"` and is durable across
overlay pops.

`openGate(trigger, options?)` and `dismissGate()` retain their public
signatures and continue to mutate the legacy `OnboardingSession.gate`
slot. The chat-side `GateChatPanel` reads the legacy slot until a
follow-up change retires it. The two paths coexist transitionally:
URL-driven sign-up flows the overlay; intent-driven flows
(`openGate("save", { cause: "save-schema" })` from ExtractView) flow
the legacy slot. `OnboardingShell.signupSurfaceActive` reads BOTH so
the canvas renders correctly under either path.

#### Scenario: openGate pushes both an overlay AND the legacy slot (transitional)

- **GIVEN** the user is on F1 with `viewer.overlays` empty
- **WHEN** the URL handler observes `/onboarding/signup`
- **THEN** `pushOverlay({ kind: "sign-up", state: "pending" })` is dispatched
- **AND** the legacy `openGate("byo")` is also dispatched
- **AND** `OnboardingShell.signupSurfaceActive` is true
- **AND** `<SignUpWidget />` mounts on the canvas

### Requirement: Sign-up gate actions SHALL also mutate the viewer overlay

`openGate(trigger, options?)`, `dismissGate()`, and `commitGate(method)` SHALL ALSO mutate the sign-up viewer overlay in lockstep with their legacy `gate.status` mutations:

- `openGate` SHALL push `{ kind: "sign-up", state: "pending", cause? }` (idempotent on (kind, cause)).
- `dismissGate` SHALL pop the topmost `sign-up` overlay.
- `commitGate(method)` SHALL mutate the topmost `sign-up` overlay's state to `"done"`.

The viewer overlay is the authoritative source for "is the sign-up surface up." The legacy `gate.status === "open"` slot remains transitionally — `OnboardingShell.signupSurfaceActive` reads BOTH (`overlay != null || gate.status === "open" || gate.status === "committed"`). Phase D / full deletion of the `"open"` variant from `GateStatus` is deferred to a follow-up change so the test ripples can be handled as one focused refactor.

#### Scenario: openGate pushes both overlay AND legacy slot

- **GIVEN** anonymous user on F3a
- **WHEN** `openGate("save", { cause: "save-schema" })` fires
- **THEN** a `{ kind: "sign-up", state: "pending", cause: "save-schema" }` overlay is pushed
- **AND** `session.gate.status === "open"` (legacy slot still set, transitionally)

#### Scenario: commitGate mutates the overlay to done

- **GIVEN** a pending sign-up overlay
- **WHEN** `commitGate("register")` fires
- **THEN** the topmost sign-up overlay's `state` becomes `"done"`
- **AND** `session.gate.status === "committed"`

#### Scenario: dismissGate pops the overlay

- **GIVEN** a pending sign-up overlay
- **WHEN** `dismissGate()` fires
- **THEN** the topmost sign-up overlay is popped from `viewer.overlays`
- **AND** `session.gate.status === "dismissed"`

