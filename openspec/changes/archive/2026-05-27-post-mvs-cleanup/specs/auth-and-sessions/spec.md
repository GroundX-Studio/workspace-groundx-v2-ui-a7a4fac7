# Spec Delta — auth-and-sessions

## ADDED Requirements

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
