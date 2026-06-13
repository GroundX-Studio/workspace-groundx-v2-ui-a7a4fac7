# Spec Delta — smart-report

## ADDED Requirements

### Requirement: Pin-to-report SHALL appear only on genuine document-answer turns, as a compact icon affordance

The "pin to report" affordance SHALL be opt-IN: it SHALL render only on chat
turns that are genuine document answers (the turn minted from a chat-router
reply, and its persisted hydration), NEVER on agent narration, scripted
intro/choreography beats, booking-status turns, gate preamble, or error turns.
A turn SHALL carry a positive `pinnable` flag set only at the answer mint sites;
the render gate SHALL be that flag, not an opt-out default.

The affordance SHALL be a COMPACT per-answer actions control in the answer's
existing affordance row (alongside the citation chips), NOT a separate
full-width pill under every message. It SHALL be driven by an ACTION LIST so
future per-answer actions are added by appending an item, not by restructuring:
with a single action it SHALL render as one inline icon button; with two or more
it SHALL render as a kebab (⋯) overflow menu — the same component keyed off the
list length, with no call-site change. Pin-to-report is the sole action today.
Every action SHALL be a real button with an accessible label, keyboard-focusable
and operable on touch (NOT a hover-only reveal), styled with design tokens only.
Activating pin SHALL use the existing pin mutation and show a transient
confirmation on the control, not persistent body text.

#### Scenario: A document answer shows a compact pin icon; narration shows nothing

- **GIVEN** a chat with a real document-answer turn and an agent-narration turn ("I'm opening the engineer booking calendar")
- **WHEN** the turns render
- **THEN** the answer turn shows a compact pin-to-report icon button in its affordance row (not a full-width pill)
- **AND** the narration turn shows no pin affordance at all.

#### Scenario: The pin control is keyboard- and touch-operable

- **GIVEN** the pin icon on an answer turn
- **WHEN** a keyboard or touch user reaches it
- **THEN** it is focusable and activatable (it is a real button with an aria-label), not a hover-only control.

#### Scenario: Reloaded answers stay pinnable, reloaded narration does not

- **GIVEN** a persisted assistant answer turn hydrated from the DB
- **WHEN** the conversation rehydrates
- **THEN** the hydrated answer shows the pin icon
- **AND** in-memory agent-narration turns remain non-pinnable.
