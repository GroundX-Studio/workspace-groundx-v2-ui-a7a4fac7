# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: The fenced-JSON proposal paths SHALL be retired

After this change lands, the chat router SHALL emit
`proposedSchemaField` and `suggestedIntent` via native LLM
function-calling tools only. The fenced-JSON parser SHALL retain
only its `citations` branch — `citations` are metadata on the
answer, not a tool surface.

The chat router previously emitted `proposedSchemaField` and
`suggestedIntent` by parsing a fenced ```json block from the
grounded LLM's answer. After this change, both surfaces SHALL be
emitted via native function-calling instead. The fenced-JSON parser
SHALL retain only its `citations` branch.

`ChatReply.proposedSchemaField` SHALL become a derived back-compat
shim for one release window — its value is the first matching
`tool:propose_schema_field` entry on `reply.suggestedActions[]`.
After the shim window closes, the field SHALL be removed from the
`ChatReply` type.

`ChatReply.suggestedActions[]` SHALL include `tool:suggest_intent`
chips when the LLM emits a `suggest_intent` tool call. The
pre-existing `key === "suggested-intent"` chip key SHALL be
preserved for one release as a back-compat shim, then removed.

#### Scenario: Grounded LLM emits a `propose_schema_field` tool call

- **GIVEN** the user asks "add a field for total tax"
- **WHEN** the grounded LLM emits a `propose_schema_field`
  function-call with `{ name, type, description, categoryId }`
- **THEN** the middleware validates the args against the Zod
  schema, builds a `proposeSchemaField` intent, and routes it to
  `reply.suggestedActions[]` (key `tool:propose_schema_field`) per
  the mutate-category routing rule (`design.md` §C).
- **AND** the legacy `ChatReply.proposedSchemaField` field returns
  the same payload during the one-release shim window.
- **AND** the system prompt sent to the LLM no longer describes a
  fenced `proposedSchemaField` JSON envelope.

#### Scenario: Grounded LLM emits a `suggest_intent` tool call

- **GIVEN** the LLM reasons that the user should pivot to the
  extract view
- **WHEN** the LLM emits `suggest_intent({intent: "show-extract", reason: "compare line items", confidence: 0.92})`
- **THEN** the chip lands on `reply.suggestedActions[]` with key
  `tool:suggest_intent` and `detail.intent: "show-extract"`.
- **AND** clicking the chip dispatches a `switchFrame` intent to
  `f3` via the app-side `suggestedActionToIntent` mapper.
