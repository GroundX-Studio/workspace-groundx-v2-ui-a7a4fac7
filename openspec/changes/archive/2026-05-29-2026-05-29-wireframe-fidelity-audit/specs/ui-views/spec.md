# Spec Delta — ui-views

> Audit context: F-2 (blank Understand canvas) is a violation of the existing requirement
> "F2 UnderstandView SHALL render the PDF viewer during live parse" — tracked as a bug under
> P2, not re-specified here. The requirements below are the genuinely new contracts the
> reprioritized P1/P2/P3 work introduces.

## ADDED Requirements

### Requirement: The sign-in gate SHALL be a delayed chat moment with three doors

The onboarding sign-in gate (F6) SHALL render in the chat rail as an assistant message that
appears with a delayed / staggered reveal (a "thinking" beat, then the message), like a live
AI turn — not an instant mount and not a modal. The message SHALL offer all three wireframe
doors: an **email "send magic link"** action, an **SSO** action that dispatches
`commitGate({ method: "sso" })`, and a **book-a-call** action. Under
`prefers-reduced-motion: reduce` the reveal SHALL degrade to a crossfade. While the gate is
shown the onboarding step strip SHALL be on **Understand**.

#### Scenario: Gate streams in as a chat message with three doors

- **GIVEN** the gate is triggered (Save / Export / metered ceiling)
- **WHEN** the chat surface updates
- **THEN** after a short delay an assistant gate message reveals (it is not present on the same tick the gate fires)
- **AND** the message offers an email "send magic link" action, an SSO action dispatching `commitGate({ method: "sso" })`, and a book-a-call action
- **AND** the onboarding step strip is on "Understand"
- **AND** no modal dialog is used — the canvas stays visible behind the chat.

### Requirement: The gate canvas SHALL pitch the GroundX value proposition

On the gate screen the canvas (right pane) SHALL render a styled GroundX value-proposition
surface — a headline plus supporting points drawn from product messaging — instead of the
account-creation form (account creation moves to the chat doors). Styling SHALL use design
tokens only (no style literals; honors the drift guard).

#### Scenario: Value-prop pane replaces the form in the canvas

- **GIVEN** the gate screen is shown
- **WHEN** the canvas renders
- **THEN** a value-proposition pitch surface is present (headline + supporting points)
- **AND** no create-account form fields render in the canvas.

### Requirement: Sample selection SHALL stream the parse on Understand before advancing to Extract

Selecting a sample SHALL transition to the **Understand** frame (step strip on Understand),
where the parse status lines SHALL stream in **staggered** (one at a time, with delays), like
an AI emitting reasoning status. The step strip SHALL remain on Understand for the duration of
the stream, then **auto-advance to Extract**, where the canvas SHALL render the extract
workbench (PDF on the left, the Statement / Meters / Charges fields panel on the right). The
flow SHALL NOT jump directly to Interact on sample selection.

#### Scenario: Pick a sample → staggered Understand → Extract

- **GIVEN** the F1 picker with the Utility sample
- **WHEN** the user opens the sample
- **THEN** the frame becomes Understand with the step strip on Understand
- **AND** the parse status lines appear progressively (the rendered count grows across ticks), not all at once
- **AND** when the stream completes the step strip advances to Extract
- **AND** the Extract canvas shows the PDF viewer plus the Statement / Meters / Charges fields panel.

### Requirement: An Interact message SHALL light citation regions on the canvas PDF

In F5 Interact, sending a citation-bearing question SHALL produce an assistant turn whose
citations light region(s) on the canvas PDF for the cited page, resolving real source geometry
(X-Ray join for the extract-indexed sample), not only a fallback band. The canonical trigger
question is "What is the total amount due on this bill?". The F5 canvas SHALL render only the
source document viewer — no second chat transcript, input, or Save control (the shell
`ChatColumn` is the single chat surface). Citation snippets SHALL be human-readable, never raw
extract JSON, and every cited turn SHALL carry answer prose.

#### Scenario: Trigger message highlights the cited region

- **GIVEN** the Utility sample on F5 Interact
- **WHEN** the user asks "What is the total amount due on this bill?"
- **THEN** the answer renders prose plus citation chips
- **AND** the cited region is lit on the canvas PDF for the cited page
- **AND** each citation snippet is human-readable (not raw extract JSON)
- **AND** the canvas contains no second chat input or Save control.
