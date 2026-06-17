# Spec Delta — chat-routing

## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: The `suggest_intent` router path and `switchFrame` emission

The router SHALL NOT use the legacy `suggest_intent` tool and SHALL NOT emit
`switchFrame`. Offering a viewer action is produced from the `offerAs` disposition
on navigation tools; performing one is produced from a direct navigation tool call.

#### Scenario: No suggest_intent path remains

- **GIVEN** a turn after this change
- **THEN** the reply contains no `suggest_intent`-derived entries and no `switchFrame` intent
