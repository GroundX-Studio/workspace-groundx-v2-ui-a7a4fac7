# No LLM tools — ChatColumn

## Why

`ChatColumn` is the chat surface itself, not an LLM-drivable affordance.
Tools live on the widgets it composes (`SuggestedActionChips`,
`ProposeSchemaFieldCard`, `BookingStatusCard`, future widgets). The
column has no first-class action of its own — it relays user typing
into `sendChatMessage` and renders the resulting bubbles.

A tool like `send_message` would technically apply, but the LLM
already drives the column by being the OTHER side of the conversation;
giving the model a tool to send messages to itself adds no expressivity
and risks loops. Phase 7 may revisit if a "compose draft message"
affordance materializes.
