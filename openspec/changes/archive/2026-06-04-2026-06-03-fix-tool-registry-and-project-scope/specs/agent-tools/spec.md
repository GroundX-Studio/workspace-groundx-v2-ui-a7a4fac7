## MODIFIED Requirements

### Requirement: The LLM tool catalog SHALL be assembled from co-located widget tool declarations

The production LLM-facing tool catalog SHALL be `SERVER_TOOL_CATALOG` in
`middleware/src/services/toolCatalog.ts`. The middleware SHALL assemble the
per-turn catalog from that server catalog, validate emitted arguments against
each `ServerTool.inputSchema`, and build the returned `CanvasIntent` shape with
`ServerTool.intentBuilder`.

App-side co-located `*.tools.ts` files MAY still exist, but only as declarative
widget-local metadata for app/server parity tests, tool-quality checks,
tool-reference checks, and viewer widget descriptors. They SHALL NOT expose
runtime `handler` functions and SHALL NOT be composed into a production app
`toolRegistry` singleton. A pure test helper MAY collect app tool metadata for
parity checks, but it SHALL NOT provide step filtering, mode filtering, or
execution.

#### Scenario: Middleware catalog builds the LLM tools for a chat turn

- **GIVEN** a chat turn with an active viewer step and caller role
- **WHEN** the middleware prepares provider tool definitions
- **THEN** it filters `SERVER_TOOL_CATALOG` by the step and role
- **AND** it converts the server tools' Zod schemas to provider JSON Schema
- **AND** it does not call into an app-side registry or app-side handler.

#### Scenario: App tool metadata has no executable handler

- **GIVEN** an app `*.tools.ts` declaration
- **WHEN** the app tool metadata guard runs
- **THEN** the declaration has name, description, category, input schema,
  optional availability metadata, and optional `rendersWidget`
- **AND** it does not have a `handler` field.

### Requirement: Tool catalog SHALL be scoped to the active ViewerStep on every chat turn

The middleware SHALL assemble the LLM-facing tool catalog per chat turn from
`SERVER_TOOL_CATALOG`, filtered by the active `ViewerStep.kind` and the caller
role/mode. The middleware SHALL pass this filtered catalog to the LLM provider
via native function-calling (OpenAI `tools` parameter / Anthropic `tools`
parameter). The catalog SHALL NOT be injected into the system prompt narrative.

#### Scenario: A doc-viewer step exposes doc-viewer tools

- **GIVEN** the active ViewerStep is `doc-viewer`
- **WHEN** the chat handler builds the tool catalog for this turn
- **THEN** it calls the server catalog filtering path for that step and role
- **AND** the catalog includes tools admitted for `doc-viewer`
- **AND** the catalog excludes tools scoped to other steps or unavailable roles.

### Requirement: Tool invocations SHALL be validated against Zod and persisted to intent_log

When the LLM emits a `tool_calls[]` array, the middleware SHALL for each call:

1. Resolve the tool name in `SERVER_TOOL_CATALOG`
2. Validate the `arguments` JSON against the server tool's Zod schema
3. Run the server tool's `intentBuilder` if validation passes
4. Collect the resulting `CanvasIntent` into the chat reply's `intents[]` array
5. Persist the call to the `intent_log` table with status `dispatched` (success)
   or `error` (validation/intentBuilder failure) plus the reason

The reply SHALL also carry a `toolFailures: { name: string; reason: string }[]`
array surfacing failures so the frontend can render them. App `*.tools.ts`
metadata SHALL NOT execute a handler for production tool calls.

#### Scenario: Valid tool call produces a dispatched intent and a success log row

- **GIVEN** the LLM emits `{ name: "open_document", arguments: { documentId: "doc-A", page: 7 } }`
- **WHEN** the middleware validates the call and runs the server tool intentBuilder
- **THEN** the chat reply's `intents[]` contains the corresponding `CanvasIntent`
- **AND** a row is written to `intent_log` with status `dispatched`.

### Requirement: Tool names SHALL follow a discoverable convention and descriptions SHALL be LLM-actionable

Every app declarative `WidgetTool` and middleware `ServerTool` SHALL satisfy the
quality rules enforced at build time by `scripts/check-tool-quality.mjs`. The
LLM sees `name`, `description`, and per-parameter `.describe()` calls from the
server catalog; app metadata stays mirrored so local widget descriptors and
reachability checks cannot drift.

1. **Globally unique name.** No two app tool metadata declarations may declare
   the same `name`, enforced by the metadata collector and quality check.
2. **Naming convention.** `name` SHALL match the regex `^[a-z][a-z0-9_]*$` AND
   start with an allowlisted action verb.
3. **Description quality.** `description` SHALL be at least 40 characters AND
   SHALL contain either `Use when` or `Triggers when`.
4. **Per-parameter documentation.** Every field on the Zod `input` schema SHALL
   carry a `.describe(...)` call with a non-empty string.

#### Scenario: A fully-conforming tool passes all four checks

- **GIVEN** a tool with `name: "open_document"`, a 60-character description
  containing "Use when", and every Zod field carrying a `.describe(...)`
- **WHEN** the quality check runs
- **THEN** the check passes for that tool
- **AND** the build proceeds.

### Requirement: The tool catalog SHALL include 5 new mutate-category tools

The tool catalog SHALL keep the existing mutate-category tool set mirrored
between declarative app `*.tools.ts` metadata and middleware
`SERVER_TOOL_CATALOG`. The app side owns name/description/visibility metadata
only; the middleware side owns executable input validation and `intentBuilder`
behavior. The drift guard SHALL fail until both sides are in sync.

#### Scenario: Mirrored mutate tool stays in sync

- **GIVEN** a mutate-category tool is declared in app metadata
- **WHEN** the parity guard runs
- **THEN** the middleware `SERVER_TOOL_CATALOG` includes the same tool name,
  description, availability, and `rendersWidget` binding where applicable.

## ADDED Requirements

### Requirement: The app and server tool catalogs SHALL agree on declarative tool metadata

The app's declarative tool metadata and middleware `SERVER_TOOL_CATALOG` SHALL
agree on mirrored tool names, descriptions, role visibility, and chat-widget
`rendersWidget` bindings. Server-only tools SHALL be explicitly allowlisted in
the parity guard. A tool present on one side but absent on the other, a
description drift, an unexpected role drift, or a dangling `rendersWidget`
binding SHALL fail automated validation.

#### Scenario: Mirrored metadata drift fails

- **GIVEN** an app tool declaration named `open_document`
- **WHEN** the server catalog omits it or changes its description
- **THEN** the parity guard fails and names the mismatched tool.

#### Scenario: Server-only tool remains explicit

- **GIVEN** a server-only tool such as `suggest_intent`
- **WHEN** parity validation runs
- **THEN** the tool is allowed only because it appears in the server-only
  allowlist
- **AND** any server-only tool with a `rendersWidget` binding must be enumerated
  in the chat-widget reachability guard.
