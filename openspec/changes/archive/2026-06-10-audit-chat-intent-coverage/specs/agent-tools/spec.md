# Spec Delta — agent-tools

## ADDED Requirements

### Requirement: Every SERVER_TOOL_CATALOG intentBuilder SHALL be covered by an LLM-free tool→intent fixture

The middleware corpus SHALL exercise every `SERVER_TOOL_CATALOG` tool that
declares an `intentBuilder` by injecting a stub `LlmClient` (via the
`chatHandler` `deps.llmClient` seam) that emits a scripted tool-call, then
asserting the resulting `reply.intents[]` carries the expected
`DispatchedIntent.intent` shape. The suite SHALL make no real LLM request. A
parity guard SHALL fail if a tool with an `intentBuilder` has no corpus entry,
cross-checked against the shared `intentCatalog` (every intent-bearing tool maps
to a catalog entry with that `toolName`) — so a newly added tool cannot ship
without coverage.

#### Scenario: A scripted tool-call produces the expected dispatched intent

- **GIVEN** the LLM provider is stubbed to emit a valid `show_extraction` tool-call
- **WHEN** the chat handler processes the turn
- **THEN** `reply.intents[]` contains a `DispatchedIntent` whose `intent.kind` is `showExtract`
- **AND** no real LLM provider request is made

#### Scenario: Invalid tool args surface as a failure, not an intent

- **GIVEN** the stubbed provider emits a tool-call with args that violate the tool's Zod `inputSchema`
- **WHEN** the chat handler validates it
- **THEN** the result is a `ToolFailure` and no `DispatchedIntent` is produced for that call

#### Scenario: New intent-bearing tool without coverage

- **GIVEN** a new tool with an `intentBuilder` is added to `SERVER_TOOL_CATALOG`
- **WHEN** the parity guard runs and no corpus entry exercises it
- **THEN** the guard fails, naming the uncovered tool
