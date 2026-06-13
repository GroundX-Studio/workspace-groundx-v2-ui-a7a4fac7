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
exit. The overlay is the source of truth for the sign-up viewer surface.

The identity-level "signed-in" fact (the user has completed sign-up
and a server session is minted) is distinct from the overlay's
lifecycle. It SHALL continue to be carried by
`AppModeContext.authState === "signed-in"` and is durable across
overlay pops.

`openGate(trigger, options?)` and `dismissGate()` retain their public
signatures and continue to mutate the legacy `OnboardingSession.gate`
slot for lifecycle and analytics continuity. They SHALL also mutate the
viewer overlay in lockstep so URL-driven and intent-driven sign-up flows
render through the same active viewer surface and the same active chat
session. `gate.status` SHALL NOT select or replace the chat surface.
`OnboardingShell.signupSurfaceActive` reads both the overlay and
transitional `gate.status` so the viewer renders correctly while the
legacy slot remains in the data model.

#### Scenario: openGate pushes both an overlay AND the legacy slot (transitional)

- **GIVEN** the user is on F1 with `viewer.overlays` empty
- **WHEN** the URL handler observes `/onboarding/signup`
- **THEN** `pushOverlay({ kind: "sign-up", state: "pending" })` is dispatched
- **AND** the legacy `openGate("byo")` is also dispatched
- **AND** `OnboardingShell.signupSurfaceActive` is true
- **AND** `<SignUpWidget />` mounts in the viewer overlay

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

### Requirement: AppUserMetadata SHALL be single-sourced from @groundx/shared

The `AppUserMetadata` shape SHALL be defined once as a `@groundx/shared`
schema and consumed by both sides via re-export — replacing the twin declared
on the middleware (`middleware/src/types.ts`, the persisted session-metadata
record) and on the app (`app/src/api/entities/customerEntity.ts`, where the
app currently declares a documented SUBSET). The shared schema SHALL make
every session-metadata field OPTIONAL except `groundxUsername`, so each side
narrows from one source rather than maintaining two divergent shapes. The
twin SHALL be pinned with an `Eq<>` compile-time guard and validated at the
app-metadata response parse boundary. The two customer-auth client modules
(`customerEntity.ts`, `partnerCustomerEntity.ts`) SHALL likewise single-source
their shared auth request/response wire shapes onto `@groundx/shared` where a
middleware mirror exists.

#### Scenario: App and middleware AppUserMetadata derive from one shared schema

- **GIVEN** `appUserMetadataSchema` lives once on `@groundx/shared` with all fields optional except `groundxUsername`
- **WHEN** the middleware persists metadata and the app reads it from the `getUserData` / `updateAppMetadata` responses
- **THEN** both sides consume the shared type via re-export
- **AND** an `Eq<AppUserMetadata, SharedAppUserMetadata>` guard pins the shape under the build
- **AND** the app-metadata response validates against `appUserMetadataSchema` at the parse boundary.

#### Scenario: The customer-auth client wire shapes single-source where a middleware mirror exists

- **GIVEN** the customer-auth client modules declare login/register/auth-response (and partner credentials/profile) wire shapes
- **WHEN** a shape has a middleware mirror on the same wire
- **THEN** the shape is single-sourced on `@groundx/shared` and both sides re-export it under an `Eq<>` guard
- **AND** the auth response validates against the shared schema at its parse boundary.

### Requirement: Session/auth and rehydration shapes SHALL be discriminated unions validated at trust boundaries

Session/auth and rehydration shapes SHALL be modeled as discriminated unions (a `kind`/`status`
discriminant carrying ONLY the fields meaningful to that variant), and untrusted external input at a
trust boundary SHALL be validated (parsed) before use rather than type-cast. No flat-record sentinels
(empty-string, all-false boolean tuples, or success-only fields riding a non-success record) and no
`as <Type>` casts of untrusted input.

This generalizes the already-shipped `AnonSession | AuthedSession` request-session union to the
remaining client-side shapes: the login-result callback, the per-field extraction result, and the
localStorage ChatStore snapshot.

#### Scenario: Login result is a discriminated union, not a boolean tuple

- **GIVEN** the login callback type (`LoginReqCallback`)
- **WHEN** `login()` resolves
- **THEN** the result is a discriminated union narrowed on `kind` (success / error / banned / failed),
  with `error` present only on the error variant
- **AND** the old flat record (e.g. `{ isLoggedIn: true, error: true, banned: false }`) and the
  all-false silent no-op are NOT assignable (illegal combinations unrepresentable).

#### Scenario: Per-field extraction result models its states as variants

- **GIVEN** a `SchemaFieldExtractionResult`
- **WHEN** its `status` is `"pending"` or `"error"`
- **THEN** the success-only fields (`value`, `confidence`, `citation`) are NOT present on the type
- **AND** a `"done"` result carries `value` (plus optional `confidence`/`previousConfidence`/`citation`)
- **AND** a `"pending"` result with a non-null `value`, or an `"error"` result carrying a `confidence`,
  fails type-checking.

#### Scenario: ChatStore snapshot is parsed at the localStorage boundary, not cast

- **GIVEN** a ChatStore snapshot read from localStorage
- **WHEN** `deserialize` rehydrates it
- **THEN** it is validated via `parseChatStoreSnapshot(unknown): SerializedSnapshot | null` (a Zod
  parse mirroring the serialized shape), not `JSON.parse(raw) as SerializedSnapshot`
- **AND** a corrupt or wrong-version snapshot returns `null` and is NOT trusted (rehydration falls back
  to legacy migration / a fresh store)
- **AND** a valid current-version snapshot deserializes to the identical in-memory state as before.

### Requirement: Customer auth state transitions SHALL preserve the cookie-session contract through Api injection

Migrating auth to the injected `Api` SHALL NOT change the customer auth
semantics. Login and register SHALL rely on the server cookie session, load user
data after success, update React auth/user state, and avoid browser-side token
storage. Reset-password and confirm-password SHALL preserve their existing
message/error behavior. Logout SHALL clear local auth/user state even if the
network call fails.

#### Scenario: Login loads user data without browser-side token storage

- **GIVEN** the injected auth client resolves `login` and `getUserData`
- **WHEN** the user submits the login form
- **THEN** auth state becomes logged-in with the returned username
- **AND** user data is loaded from the injected `getUserData`
- **AND** session storage does not receive legacy token keys (`n`, `t`, or `j`)

#### Scenario: Register loads user data without browser-side token storage

- **GIVEN** the injected auth client resolves `register` and `getUserData`
- **WHEN** the user submits a valid business-email registration form
- **THEN** auth state becomes logged-in with the returned username
- **AND** user data is loaded from the injected `getUserData`
- **AND** session storage does not receive legacy token keys

#### Scenario: Password reset flows through the injected auth client

- **GIVEN** the user opens the reset-password screen
- **WHEN** they request a reset code, resend it, and submit a new password with a
  verification code
- **THEN** the screen calls injected `resetUserPassword` and
  `confirmUserChangingPassword`
- **AND** the existing success/error UI behavior is preserved

#### Scenario: Logout clears local auth state after attempting the network call

- **GIVEN** an authenticated user
- **WHEN** logout is invoked
- **THEN** the injected `logout` operation is attempted
- **AND** local user/auth state is cleared even if the operation rejects

### Requirement: Sign-in SHALL promote the active onboarding session in place

The app SHALL preserve the same active onboarding `ChatSession` when opening
sign-in, submitting sign-up, using SSO, dismissing sign-in, booking an engineer
call, or picking a sample after sign-in entry. Successful identity completion
SHALL promote or claim that session in place; it SHALL NOT create a parallel
sign-in chat or discard pre-sign-in messages.

#### Scenario: F1 sign-up preserves anonymous session identity

- **GIVEN** an anonymous user has an active onboarding `chatSessionId`
- **WHEN** the user clicks **Sign up** on F1
- **THEN** the active `chatSessionId` remains unchanged
- **AND** the sign-in overlay opens in that session's `ViewerSession`.

#### Scenario: Sample pick after sign-in entry preserves history

- **GIVEN** the user entered sign-in from F1 and then returned to samples
- **WHEN** the user picks the Utility sample
- **THEN** the same `chatSessionId` remains active
- **AND** any assistant sign-in guidance remains in the chat history
- **AND** Utility onboarding turns continue after that history.

#### Scenario: Register claims the same session

- **GIVEN** the user submitted the sign-up form from the viewer overlay
- **WHEN** register and anonymous-session claim succeed
- **THEN** the same chat history is visible after promotion
- **AND** the sign-in overlay transitions to done or closes according to the
  gate lifecycle
- **AND** no duplicate chat session appears in the UI.
