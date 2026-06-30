# Spec Delta — auth-and-sessions

Migrated from `backlog.md` Epic AU (active rows only). AU-04 closed
2026-05-27 — git history is the record.

## ADDED Requirements

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
