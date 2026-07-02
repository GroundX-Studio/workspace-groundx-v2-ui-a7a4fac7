## ADDED Requirements

### Requirement: The nav/action tool catalog SHALL be advertised on every user-facing chat turn

The grounded chat seam SHALL advertise and route the tool catalog on every
user-facing turn, not only on a document-Q&A path. The catalog SHALL still pass
through the existing `toolsForStep(stepKind, callerRole)` role+step filter — the
filter is PRESERVED (a tool's visibility per step/role is unchanged), only the
"advertise on `rag` only" gate is removed. Reachability of a tool from chat SHALL be
a property of the tool being in the (step/role-filtered) catalog, not of a router
mode. Adding a new widget/intent tool to the catalog (with its app↔middleware mirror
and parity guard) SHALL make it reachable from chat with no router or planner change.

#### Scenario: A newly-added catalog tool is reachable with no router change

- **GIVEN** a new nav/action tool is added to the catalog (both app and middleware mirrors, parity guard green)
- **WHEN** a user asks for the action it performs
- **THEN** the model can emit it on the ordinary chat turn
- **AND** no branch was added to the router or the planner to reach it

#### Scenario: The role+step filter still applies

- **GIVEN** a tool restricted to certain steps/roles via `availableSteps` / role
- **WHEN** the turn runs on a step/role outside that restriction
- **THEN** the tool is NOT advertised (the security/step filter is preserved, not bypassed)

### Requirement: Search and product-knowledge SHALL be tools within the one loop

`search_documents` and `lookup_groundx_knowledge` SHALL be tools the model may call
inside the single grounded loop, replacing the removed pre-flight planner's
"documentSearch / productKnowledge" decision. The loop SHALL additionally run one
default document search up front so the common document question resolves in a single
round-trip without requiring the model to call the search tool first. Product knowledge
SHALL NOT be pre-fetched (Q1 decision): a GroundX-product question answers via the
`lookup_groundx_knowledge` tool, accepting a possible extra round-trip on those less
common turns rather than a skill-pack retrieval on every turn.

#### Scenario: The model searches or draws on knowledge without a pre-flight planner

- **GIVEN** the planner has been removed
- **WHEN** a document question runs
- **THEN** the default up-front search supplies snippets and the model answers in one round-trip
- **AND** **WHEN** a follow-up needs more retrieval or GroundX product facts
- **THEN** the model calls `search_documents` / `lookup_groundx_knowledge` itself

### Requirement: All account/workspace facts SHALL be reader tools with a single implementation

Every account/workspace fact reachable from chat SHALL be exposed as a `read`-category
server tool the model calls on demand (projects, API keys, pages remaining, saved
schemas), mirrored app↔middleware. Each fact SHALL have exactly ONE fetch+format
implementation: the existing `answerMyProjects` / `answerApiKeys` (and pages/schemas)
handlers SHALL be CONSOLIDATED into the tools' `serverExecute`, not duplicated. API key
values MUST NOT be returned in full (name + last-4 only).

#### Scenario: One reader per fact, keys redacted

- **GIVEN** a signed-in user asks for their projects, API keys, pages remaining, or saved schemas
- **WHEN** the turn runs
- **THEN** the model calls the corresponding reader tool and answers from its result
- **AND** exactly one implementation fetches/formats that fact (no duplicate handler survives)
- **AND** API key values are shown only as name + last-4
