## ADDED Requirements

### Requirement: The chat thinking indicator SHALL use the one shared loading animation

The chat "thinking"/composing indicator SHALL render the app's single shared loading animation
(the "breathing mark") at its small size, not a bespoke dots component. It SHALL appear **in
place of** the assistant bubble — the mark stands in the bubble's position with no bubble chrome
around it — and SHALL be replaced by the assistant bubble when the message is ready; it SHALL NOT
be rendered inside a `BotBubble`. This applies to every chat surface that shows a pending-response
state — the main conversation flow (`chatPrimitives.tsx`) and the gate chat panel/rail. The
retired `LoadingDots` primitive SHALL NOT exist anywhere in the app. The indicator's accessible
name (e.g. "Assistant is thinking") SHALL be preserved. This is the same animation used in the
viewer and the frame status band — one loading animation everywhere, differing only in size.

#### Scenario: Chat pending-response shows the mark in place of the bubble

- **GIVEN** an assistant turn is pending in the conversation flow
- **WHEN** the thinking indicator renders
- **THEN** the shared mark is shown at the small size in the assistant bubble's position, with no
  bubble chrome around it, carrying the accessible name
- **AND** when the message is ready the mark is replaced by the assistant bubble
- **AND** it does not render `LoadingDots`, a bespoke dots component, or the mark inside a `BotBubble`.

#### Scenario: LoadingDots is retired app-wide

- **GIVEN** the codebase after this change
- **WHEN** the drift guard searches for the retired loader
- **THEN** no `LoadingDots` component or import remains
- **AND** every loading/thinking surface resolves to the one shared primitive.
