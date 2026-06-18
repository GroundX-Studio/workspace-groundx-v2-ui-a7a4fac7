# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: Offered viewer actions SHALL route onto `suggestedActions`, not a new field

The router SHALL surface an offered viewer action (a navigation tool call carrying
`offerAs`) as a `suggestedActions` entry whose intent is server-validated (built via
the target tool's `intentBuilder`, never free-form), carrying the `offerAs` label
and optional `anchor`. The `suggestedActions` entry shape SHALL gain the optional
`anchor` field; NO new top-level affordance list SHALL be added. Mutate-tool
confirmation actions SHALL continue to surface on this same `suggestedActions` list.
The reply SHALL be single-sourced in `@groundx/shared` and validated at the wire
boundary.

#### Scenario: An offered action arrives on suggestedActions

- **GIVEN** the agent calls a navigation tool with `offerAs`
- **WHEN** the reply is built
- **THEN** `suggestedActions` contains an entry with the label, the validated intent, and the optional anchor
- **AND** that intent is absent from `reply.intents[]`

## MODIFIED Requirements

### Requirement: The fenced-JSON proposal paths SHALL be retired

After this change lands, the chat router SHALL emit
`proposedSchemaField` via native LLM function-calling tools only. The
fenced-JSON parser SHALL retain only its `citations` branch — `citations` are
metadata on the answer, not a tool surface.

The chat router previously emitted `proposedSchemaField` and a
`suggestedIntent` by parsing a fenced ```json block from the
grounded LLM's answer. After this change, `proposedSchemaField` SHALL be
emitted via native function-calling instead, and the `suggestedIntent` /
`suggest_intent` path SHALL be removed entirely (offered navigation is now the
`offerAs` disposition on the per-destination navigation tools, see the
agent-tools and conversation-flow deltas). The fenced-JSON parser
SHALL retain only its `citations` branch.

`ChatReply.proposedSchemaField` SHALL become a derived back-compat
shim for one release window — its value is the first matching
`tool:propose_schema_field` entry on `reply.suggestedActions[]`.
After the shim window closes, the field SHALL be removed from the
`ChatReply` type.

The router SHALL NOT use the legacy `suggest_intent` tool and SHALL NOT emit
`switchFrame`. The pre-existing `key === "suggested-intent"` chip and any
`tool:suggest_intent` chip key SHALL be removed (no back-compat shim — pre-launch).
Offered navigation lands on `suggestedActions` via `offerAs`; performing one is a
direct navigation tool call. No reply entry SHALL be `suggest_intent`-derived and no
intent SHALL be `switchFrame`.

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

#### Scenario: No suggest_intent path or switchFrame emission remains

- **GIVEN** a turn after this change
- **THEN** the reply contains no `suggest_intent`-derived entries (no
  `tool:suggest_intent` chip, no `key === "suggested-intent"` chip)
- **AND** no reply intent is `switchFrame`.
