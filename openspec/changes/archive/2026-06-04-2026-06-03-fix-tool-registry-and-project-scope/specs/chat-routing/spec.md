## MODIFIED Requirements

### Requirement: The chat router SHALL pass a step-scoped tool catalog to the LLM provider

Per chat turn, the chat router SHALL:

1. Read the active `ViewerStep.kind` from the chat session's viewer slot
2. Build the LLM-facing tool catalog from middleware `SERVER_TOOL_CATALOG`,
   filtered by active step and caller role/mode
3. Pass the catalog to the LLM provider via the native `tools` parameter
   (OpenAI / Anthropic equivalent)
4. Set `tool_choice` to `"auto"` (let the model decide whether to use a tool)

The catalog SHALL NOT be duplicated into the system prompt narrative — the
provider's structured `tools` field is the canonical surface. The chat router
SHALL NOT call into an app-side `toolRegistry` or app-side tool `handler`.

#### Scenario: Tool catalog reflects the current viewer step

- **GIVEN** a chat session whose active ViewerStep is `extract-workbench` in
  onboarding mode
- **WHEN** the chat router builds the LLM request
- **THEN** the request's `tools` array contains the server tools admitted for
  `extract-workbench`
- **AND** the array excludes tools scoped to other steps
- **AND** the array excludes tools unavailable to the caller role/mode.

