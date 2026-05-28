# Spec Delta — agent-tools

## ADDED Requirements

### Requirement: The LLM tool catalog SHALL be assembled from co-located widget tool declarations

The frontend SHALL auto-discover every `<Name>.tools.ts` file under `app/src/components/{chat-widgets,viewer-widgets}/<Name>/` at app boot via `import.meta.glob` and compose them into a central tool registry at `app/src/tools/registry.ts`. The registry SHALL expose:

- `all(): WidgetTool[]` — the full catalog
- `forStep(stepKind: ViewerStep["kind"]): WidgetTool[]` — the catalog filtered to the tools available in the given step
- `forMode(mode: "onboarding" | "steady"): WidgetTool[]` — the catalog filtered by `availableIn`

Tool name collisions across widgets SHALL fail at registry-assembly time. Every tool name is globally unique across the app.

#### Scenario: Auto-discovery composes the catalog

- **GIVEN** two widgets each declare tools in their `*.tools.ts` files
- **WHEN** the registry initializes
- **THEN** `registry.all()` returns the union of declared tools from both widgets
- **AND** no widget needs to be manually listed in a central file

#### Scenario: Duplicate tool name fails fast

- **GIVEN** two widgets both declare a tool named `open_document`
- **WHEN** the registry initializes
- **THEN** an error is thrown naming the colliding widgets and the duplicated name
- **AND** the app refuses to start until resolved

### Requirement: Tool catalog SHALL be scoped to the active ViewerStep on every chat turn

The chat handler SHALL assemble the LLM-facing tool catalog per chat turn by reading the active `ViewerStep.kind` from the chat session's viewer and calling `registry.forStep(kind)`. Tools whose `availableIn` excludes the current mode SHALL also be filtered out.

The middleware SHALL pass this filtered catalog to the LLM provider via native function-calling (OpenAI `tools` parameter / Anthropic `tools` parameter). The catalog SHALL NOT be injected into the system prompt narrative — it goes through the provider's structured tools field.

#### Scenario: A doc-viewer step exposes doc-viewer tools

- **GIVEN** the active ViewerStep is `doc-viewer`
- **WHEN** the chat handler builds the tool catalog for this turn
- **THEN** the catalog includes `open_document`, `jump_to_page`, `highlight_citation`
- **AND** the catalog excludes tools scoped to other steps (e.g., `propose_field`)

#### Scenario: Onboarding mode hides mutate-tools that should be locked

- **GIVEN** the active session is in onboarding mode
- **AND** a tool's `availableIn` is `["steady"]` only
- **WHEN** the catalog is built
- **THEN** that tool is excluded from the LLM-facing catalog

### Requirement: Tool invocations SHALL be validated against Zod and persisted to intent_log

When the LLM emits a `tool_calls[]` array, the middleware SHALL for each call:

1. Resolve the tool name in the registry
2. Validate the `arguments` JSON against the tool's Zod schema
3. Invoke the tool's handler if validation passes
4. Collect the resulting `CanvasIntent` into the chat reply's `intents[]` array
5. Persist the call to the `intent_log` table with status `dispatched` (success) or `error` (validation/handler failure) + the reason

The reply SHALL also carry a `toolFailures: { name: string; reason: string }[]` array surfacing failures so the frontend can render them.

#### Scenario: Tool call with invalid args lands in toolFailures + intent_log

- **GIVEN** the LLM emits `{ name: "open_document", arguments: { documentId: 123 } }` (number instead of string)
- **WHEN** the middleware validates the call
- **THEN** Zod validation fails
- **AND** the chat reply's `toolFailures[]` contains an entry naming `open_document` and the validation error
- **AND** a row is written to `intent_log` with status `error`
- **AND** no intent is dispatched

#### Scenario: Valid tool call produces a dispatched intent and a success log row

- **GIVEN** the LLM emits `{ name: "open_document", arguments: { documentId: "doc-A", page: 7 } }`
- **WHEN** the middleware validates and invokes
- **THEN** the chat reply's `intents[]` contains a `CanvasIntent` with kind `highlightCitation`, documentId `doc-A`, page `7`
- **AND** a row is written to `intent_log` with status `dispatched`

### Requirement: User-confirmed mutations SHALL render as chips before dispatch

Tools with `category: "mutate"` SHALL NOT auto-dispatch. The middleware SHALL emit them into `suggestedActions[]` on the chat reply (each entry carries the tool name + label + the would-be intent payload as `detail`). The frontend SHALL render a `<SuggestedActionChips>` row beneath the assistant bubble; clicking a chip dispatches the underlying intent.

Tools with `category: "read"` MAY auto-dispatch into `intents[]` directly, surfacing the state change without user confirmation.

#### Scenario: A read tool auto-dispatches

- **GIVEN** the LLM emits `{ name: "open_document", arguments: {...} }` and the tool's category is `read`
- **WHEN** the middleware processes the response
- **THEN** the resulting intent lands in `intents[]` for immediate dispatch
- **AND** no chip is rendered (the canvas surface updates directly)

#### Scenario: A mutate tool requires confirmation

- **GIVEN** the LLM emits `{ name: "save_schema_template", arguments: {...} }` and the tool's category is `mutate`
- **WHEN** the middleware processes the response
- **THEN** the call lands in `suggestedActions[]` not `intents[]`
- **AND** the frontend renders a chip the user must click to dispatch
