# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: Chat replies SHALL carry intents and toolFailures when the LLM uses function-calling

The `ChatReply` envelope SHALL be extended with two new arrays:

- `intents: CanvasIntent[]` — auto-dispatched read-category tool results
- `toolFailures: { name: string; reason: string }[]` — validation or handler failures

Existing `suggestedActions[]` SHALL carry mutate-category tool proposals as chips (the user clicks to dispatch). Existing `proposedSchemaField` + `suggestedIntent` continue to ship in their current envelope shapes during the migration phase (Phase 8); after migration, they become derived from `intents[]` / `suggestedActions[]`.

#### Scenario: Read-tool chat reply carries an intent + no chip

- **GIVEN** the LLM emits a tool call for the `read`-category tool `open_document`
- **WHEN** the chat router returns the reply
- **THEN** `reply.intents[0]` is the resulting `CanvasIntent`
- **AND** `reply.suggestedActions` does NOT contain a chip for that tool

#### Scenario: Mutate-tool chat reply carries a chip + no auto-intent

- **GIVEN** the LLM emits a tool call for the `mutate`-category tool `save_schema_template`
- **WHEN** the chat router returns the reply
- **THEN** `reply.suggestedActions[]` contains an entry with the tool name and the would-be intent payload
- **AND** `reply.intents[]` does NOT contain that intent yet

#### Scenario: Failure surfaces in toolFailures, not as an intent

- **GIVEN** the LLM emits a tool call with arguments that fail Zod validation
- **WHEN** the chat router processes the response
- **THEN** `reply.toolFailures[]` contains a `{ name, reason }` entry
- **AND** `reply.intents[]` does NOT include that call's intent
- **AND** the answer text still flows (the LLM's natural-language response is not blocked by a tool failure)

### Requirement: The chat router SHALL pass a step-scoped tool catalog to the LLM provider

Per chat turn, the chat router SHALL:

1. Read the active `ViewerStep.kind` from the chat session's viewer slot
2. Build the LLM-facing tool catalog via `toolRegistry.forStep(kind)` filtered also by the session's mode (`onboarding` / `steady`)
3. Pass the catalog to the LLM provider via the native `tools` parameter (OpenAI / Anthropic equivalent)
4. Set `tool_choice` to `"auto"` (let the model decide whether to use a tool)

The catalog SHALL NOT be duplicated into the system prompt narrative — the provider's structured `tools` field is the canonical surface.

#### Scenario: Tool catalog reflects the current viewer step

- **GIVEN** a chat session whose active ViewerStep is `extract-workbench` in onboarding mode
- **WHEN** the chat router builds the LLM request
- **THEN** the request's `tools` array contains `propose_field`, `accept_field`, `dismiss_field`, etc. (tools scoped to `extract-workbench`)
- **AND** the array excludes tools scoped to other steps
- **AND** the array excludes tools whose `availableIn` is `["steady"]` only
