## ADDED Requirements

### Requirement: Navigation/action capability SHALL NOT depend on the turn's content-source classification

Every user-facing chat turn SHALL run through the single grounded tool-loop, which
SHALL advertise and route the full nav/action tool catalog. The router SHALL NOT
have a mode whose selection removes the model's ability to call a nav/action tool.
Whether a navigation command succeeds SHALL depend only on the user's intent, never
on how a classifier labeled the turn's content source.

#### Scenario: A navigation command navigates regardless of phrasing

- **GIVEN** the report surface exists and is reachable by a nav tool
- **WHEN** the user sends any of "show me the report", "switch to the report view", or "take me to the report"
- **THEN** the turn navigates to the report surface (emits the report nav intent)
- **AND** no phrasing produces "I don't have that control here" for a capability that exists

#### Scenario: A misclassified content-source guess never strips tools

- **GIVEN** the planner's content-source flags for a turn are arbitrary
- **WHEN** the turn runs
- **THEN** the grounded tool-loop still advertises the full nav/action catalog
- **AND** the model can still emit a valid nav/action tool call

### Requirement: There SHALL be no separate pre-flight turn classifier

The chat turn SHALL NOT be routed by a separate pre-flight mode/appState classifier.
Deciding whether to search the documents or draw on product knowledge SHALL happen
INSIDE the single grounded tool-loop: `search_documents` and
`lookup_groundx_knowledge` SHALL be tools the model may call, and the loop SHALL run
one default document search up front so the common document question resolves in a
single round-trip. The `rag`/`structured`/`hybrid` mode fork, the light-LLM turn
planner, and the keyword mode classifier SHALL be removed.

#### Scenario: No classifier, yet the common cases work

- **GIVEN** a document question, a product question, and a greeting
- **WHEN** each runs
- **THEN** the document question answers from the default up-front search (one round-trip)
- **AND** the product question answers from product knowledge (the model draws on it or calls the knowledge tool), without depending on a pre-flight classification
- **AND** the greeting is handled conversationally
- **AND** none of them is routed through a mode that removes tools or dead-ends

### Requirement: Workspace app-state SHALL be always-on grounded context

The middleware SHALL assemble a small workspace-state block — active entity,
journey stage, active step, saved-schema count, and recent viewer trail — and
SHALL inject it as the grounded `structuredContext` on every user-facing turn, so
the model can answer "where am I / what can I do" without a separate mode.
Live-fetch app-state (projects, API keys) SHALL be exposed as on-demand reader
tools rather than preloaded context.

#### Scenario: "Where am I" answered inline on any turn

- **GIVEN** an active entity and journey position
- **WHEN** the user asks about their current position or what they can do next
- **THEN** the answer reflects the injected workspace-state context
- **AND** no dedicated app-state mode was required to produce it

#### Scenario: An unrecognized account question does not dead-end

- **WHEN** the user asks an account/workspace question that matches no deterministic lookup
- **THEN** the turn is answered by the grounded loop (optionally via a reader tool)
- **AND** the reply never lists internal command names as a "known query" menu

### Requirement: Account/workspace questions SHALL be answered through the one loop via reader tools

There SHALL be no separate deterministic no-LLM fast-path for account/workspace
questions. Pages remaining, saved schemas, projects, and API keys SHALL be answered
by the grounded tool-loop calling `read`-category reader tools. Each such fact SHALL
have exactly ONE reader implementation (the tool's `serverExecute`); the prior
`answerMyProjects` / `answerApiKeys` (and pages/schemas) handlers SHALL be
consolidated into those tools, not duplicated.

#### Scenario: Account question answered via a reader tool, no dead-end

- **WHEN** the user asks "how many pages do I have left" or "what are my projects"
- **THEN** the loop calls the corresponding reader tool and answers from its result
- **AND** there is no separate deterministic handler and no "couldn't match to a known query" dead-end
- **AND** only one reader implementation exists per fact (no duplicate Partner/DB fetch)
