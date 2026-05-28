# Spec Delta — auth-and-sessions

## ADDED Requirements

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
