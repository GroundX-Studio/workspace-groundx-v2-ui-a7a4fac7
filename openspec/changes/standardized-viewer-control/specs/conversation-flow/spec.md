# Spec Delta — conversation-flow

## MODIFIED Requirements

### Requirement: A suggested action SHALL render as a pill or as inline clickable text

The existing `suggestedActions` entry SHALL gain one optional field, `anchor` (an
inline-binding phrase); no separate affordance list SHALL be introduced. Each
suggested action SHALL render as a follow-up pill when it has no anchor (the
existing chip rendering), or as inline clickable text when it has an anchor phrase.
With an anchor, a remark plugin (a sibling of the citation marker plugin) SHALL
locate that phrase in the answer prose using the citation answerSpan alignment and
wrap its first occurrence as inline clickable text. When the anchor phrase is not
found, the action SHALL fall back to a pill so it is never lost. Clicking either
rendering SHALL dispatch the action's server-validated intent through the
orchestrator with source "user".

#### Scenario: Inline action wraps the anchored phrase

- **GIVEN** a suggested action with `anchor: "Meters section"` and the answer prose contains "the Meters section"
- **THEN** "Meters section" renders as inline clickable text
- **AND** clicking it dispatches the action's intent with source "user"

#### Scenario: Missing anchor falls back to a pill

- **GIVEN** a suggested action whose anchor phrase does not appear in the prose
- **THEN** it renders as a follow-up pill
- **AND** clicking it dispatches the same intent

#### Scenario: No anchor renders a pill

- **GIVEN** a suggested action with no anchor
- **THEN** it renders as a follow-up pill

### Requirement: The chat SHALL dispatch suggested actions through the orchestrator only

A clicked suggested action SHALL dispatch through the orchestrator and SHALL NOT
construct an intent from free-form text. Tool-derived actions (offered navigation
and mutate actions) carry a server-validated intent. A small set of UI-driven
actions (e.g. "show all sources") instead map to a fixed, typed client-built intent
(no tool, no free-form text); these too dispatch through the orchestrator. Offered
navigation, mutate, and UI-driven actions SHALL share the one `suggestedActions`
list and the one render path.

#### Scenario: Tool-derived and UI-driven actions share the list and the seam

- **GIVEN** a turn with an offered navigation action, a mutate-tool action, and a "show all sources" action
- **THEN** all appear on `suggestedActions`
- **AND** clicking the tool-derived ones dispatches a server-validated intent, and clicking the UI-driven one dispatches its fixed typed intent
- **AND** all dispatch through the orchestrator with no free-form-text intent
