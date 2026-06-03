# auth-and-sessions Specification (delta)

## ADDED Requirements

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
