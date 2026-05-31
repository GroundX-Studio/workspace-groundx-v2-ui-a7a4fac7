# Spec Delta — agent-tools (tool visibility by role, not mode)

Updates the durable tool-catalog contract from the binary `mode` axis to `WidgetRole`, and makes
explicit that the LLM-facing catalog (the middleware `SERVER_TOOL_CATALOG`) carries the role axis.
`category` (`read`/`mutate`) is unchanged — it drives the confirmation model (auto-dispatch vs.
suggested-action chip), NOT visibility.

## MODIFIED Requirements

### Requirement: The LLM tool catalog SHALL be assembled from co-located widget tool declarations

The frontend SHALL auto-discover every `<Name>.tools.ts` file under `app/src/components/{chat-widgets,viewer-widgets}/<Name>/` at app boot via `import.meta.glob` and compose them into a central tool registry at `app/src/tools/registry.ts`. The registry SHALL expose:

- `all(): WidgetTool[]` — the full catalog
- `byId(name: string): WidgetTool | undefined` — lookup by globally-unique name
- `forStep(stepKind: ViewerStep["kind"]): WidgetTool[]` — the catalog filtered to the tools available in the given step
- `forRole(role: WidgetRole): WidgetTool[]` — the catalog filtered by `availableIn` (a tool with no/empty `availableIn` is available to ALL roles)

A tool's `availableIn` SHALL be `WidgetRole[]` (today `"anonymous" | "member"`), NOT `"onboarding" | "steady"`. `category` (`read`/`mutate`) SHALL NOT affect visibility. Tool name collisions across widgets SHALL fail at registry-assembly time. Every tool name is globally unique across the app.

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

### Requirement: Tool catalog SHALL be scoped to the active ViewerStep AND the caller's role on every chat turn

The LLM-facing catalog the model actually sees is the middleware `SERVER_TOOL_CATALOG` (`middleware/src/services/toolCatalog.ts`), assembled per chat turn from the active `ViewerStep.kind` AND the caller's `WidgetRole`. The server tool shape SHALL carry the same `availableIn: WidgetRole[]` axis (mirroring the app `WidgetTool`, drift-guard enforced). A tool SHALL be exposed when (`availableIn` is undefined/empty → all roles) OR the caller's role is in `availableIn`; `category` SHALL NOT gate visibility. The catalog SHALL pass to the LLM provider via native function-calling, NOT injected into the system-prompt narrative.

#### Scenario: A doc-viewer step exposes doc-viewer tools

- **GIVEN** the active ViewerStep is `doc-viewer`
- **WHEN** the chat handler builds the tool catalog for this turn
- **THEN** the catalog includes `open_document`, `jump_to_page`, `highlight_citation`
- **AND** the catalog excludes tools scoped to other steps (e.g., `propose_field`)

#### Scenario: A role-restricted tool is hidden from the anonymous role

- **GIVEN** a tool whose `availableIn` is `["member"]` only
- **AND** the caller's role is `"anonymous"`
- **WHEN** the catalog is built
- **THEN** that tool is excluded from the LLM-facing catalog
- **AND** a `mutate`-category tool with no `availableIn` (e.g. `propose_schema_field`) IS exposed to `"anonymous"` (category does not gate visibility).
