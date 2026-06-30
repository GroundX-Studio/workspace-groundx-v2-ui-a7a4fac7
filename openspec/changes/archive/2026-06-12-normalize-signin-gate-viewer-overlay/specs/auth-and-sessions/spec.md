# Spec Delta - auth-and-sessions

## ADDED Requirements

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
