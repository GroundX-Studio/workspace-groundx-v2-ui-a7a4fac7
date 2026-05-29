# agent-tools Specification

## Purpose

Define the durable contract for the agent-tool registry the LLM router
exposes to grounded chat sessions — names, argument shapes, and the
server-side execution that backs each tool. Covers the GroundX
search / extract / ingest tools, schema-mutation tools, and any plugin-
contributed tools the loader admits.
## Requirements
### Requirement: search_groundx tool SHALL perform a scoped GroundX search

The agent-tool registry SHALL include `search_groundx({scope, query, n?, verbosity?})`.
On invocation, the middleware SHALL execute a GroundX search constrained
by the supplied `ContentScope` and return ranked results that the LLM
folds into its answer inline.

#### Scenario: LLM invokes search_groundx

- **WHEN** the LLM emits a tool call `{"name": "search_groundx", "arguments": {"scope": {…}, "query": "…", "n": 6}}`
- **THEN** middleware runs the GroundX search against the supplied scope
- **AND** results appear inline in the assistant's answer

### Requirement: show_understand tool SHALL dispatch the F2/Understand canvas surface

The agent-tool registry SHALL include `show_understand({doc_id, progress})`.
On invocation, the canvas dispatcher SHALL transition to F2 with the
named document active.

#### Scenario: Tool advances canvas to F2

- **WHEN** the LLM emits `show_understand` with a valid `doc_id`
- **THEN** the canvas advances to F2 (Understand)
- **AND** the supplied document is the active doc in the PDF viewer

### Requirement: show_extraction tool SHALL dispatch the F3/Extract canvas surface

The agent-tool registry SHALL include `show_extraction({schema_id, doc_id, category?, render?})`.
On invocation, the canvas dispatcher SHALL transition to F3 with the
named schema + doc + (optional) category active.

#### Scenario: Tool advances canvas to F3

- **WHEN** the LLM emits `show_extraction` with valid arguments
- **THEN** the canvas advances to F3
- **AND** the named schema and category are the active selection

### Requirement: show_field_citation tool SHALL open the F4 expanded-citation peek

The agent-tool registry SHALL include `show_field_citation({field_id, doc_id, page})`.
On invocation, the canvas dispatcher SHALL open the F4 citation peek
on the named field + page.

#### Scenario: Tool opens F4 citation peek

- **WHEN** the LLM emits `show_field_citation`
- **THEN** the F4 peek surface opens
- **AND** the named field + doc + page are visible with the relevant region highlighted

### Requirement: pin_to_report tool SHALL pin literal turn text to a report template

The agent-tool registry SHALL include `pin_to_report({turn_id, template_id?})`.
On invocation, the middleware SHALL pin the turn's literal text to the
named template OR auto-create a draft template if no `template_id` is
supplied (per `project_dev_contracts.md` decision #12).

#### Scenario: Pin creates a draft template when none supplied

- **WHEN** the LLM emits `pin_to_report` without a `template_id`
- **THEN** a draft template is created
- **AND** the turn's text is inserted as the first section of that template

### Requirement: propose_schema_field tool SHALL emit a ProposalCard in F3a

The agent-tool registry SHALL include `propose_schema_field({field_def})`.
On invocation, a ProposalCard SHALL surface in F3a's Fields tab; on
Accept the field SHALL be added to the active schema. (See
`onboarding-schema-editor` capability for the surface contract.)

#### Scenario: Tool surfaces a propose-card

- **WHEN** the LLM emits `propose_schema_field`
- **THEN** a ProposalCard renders in F3a's Fields tab
- **AND** Accept lands the field via the existing `addSchemaField` flow

### Requirement: propose_report_section tool SHALL emit a ProposalCard in S3a

The agent-tool registry SHALL include `propose_report_section({section_def})`.
On invocation, a ProposalCard SHALL surface in S3a's section list; on
Accept the section SHALL be added to the active template.

#### Scenario: Tool surfaces a section propose-card

- **WHEN** the LLM emits `propose_report_section`
- **THEN** a ProposalCard renders in S3a
- **AND** Accept lands the section into the template

### Requirement: Tool error recovery SHALL fall back after 3 consecutive failures

The chat handler SHALL enter a session-scoped fallback mode after 3
consecutive tool calls return errors. In fallback mode no further tool
calls SHALL be emitted; the LLM is constrained to plain-text answers.
Per `project_dev_contracts.md` error catalog.

#### Scenario: 3 consecutive tool failures triggers fallback

- **GIVEN** 3 consecutive tool calls return error in the same session
- **WHEN** the next turn would otherwise invoke a tool
- **THEN** no tool call is emitted
- **AND** the assistant answers in plain text
- **AND** the session-level fallback flag persists for the rest of the session

### Requirement: AgentToolBus SHALL bridge Zod schemas to LLM-provider JSON Schema

`AgentToolBusContext` SHALL convert each registered tool's Zod schema
into the JSON Schema shape the LLM provider's tool API expects
(provider-specific via the LLM adapter). The current scaffold exposes
a placeholder Zod schema; the conversion MUST produce the correct
provider-format JSON Schema before the tool registry can ship live.

#### Scenario: Registered tool surfaces with correct JSON Schema parameters

- **GIVEN** a tool registered via AgentToolBus with a Zod parameter schema
- **WHEN** the chat handler builds the LLM tool array
- **THEN** the tool's JSON Schema in the array matches the provider's
  expected format (OpenAI function-calling format, Anthropic tool format, etc.)

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

### Requirement: Tool names SHALL follow a discoverable convention and descriptions SHALL be LLM-actionable

Every `WidgetTool` SHALL satisfy four quality rules enforced at build time by `scripts/check-tool-quality.mjs` (run alongside the existing registry-integrity check). The LLM sees `name`, `description`, and per-parameter `.describe()` calls — these rules ensure that surface is unambiguous and self-documenting.

1. **Globally unique name.** No two widgets may declare a tool with the same `name`. Enforced by `registry.ts` at assembly time (already covered by the auto-discovery requirement above); the quality check restates this for completeness.
2. **Naming convention.** `name` SHALL match the regex `^[a-z][a-z0-9_]*$` AND start with an action verb (`open_`, `jump_`, `propose_`, `accept_`, `dismiss_`, `save_`, `send_`, `pick_`, `pivot_`, `highlight_`, `commit_`, `book_`, `edit_`, `pin_`, `run_`, `reject_`, `cancel_`, `delete_`). Casing drift (`Save`, `saveX`, `SaveSchema`) and ambiguous noun-only names (`document`, `schema`) fail the check.
3. **Description quality.** `description` SHALL be at least 40 characters AND SHALL contain either `Use when` or `Triggers when` (case-insensitive) so the LLM is told WHEN to pick the tool, not just what it does. `description: "saves"` fails; `description: "Save the current schema as a reusable template. Use when the user says 'save' or 'lock this schema'."` passes.
4. **Per-parameter documentation.** Every field on the Zod `input` schema SHALL carry a `.describe(...)` call with a non-empty string. `documentId: z.string()` fails; `documentId: z.string().describe("GroundX document UUID")` passes. The check walks the Zod schema's `_def.shape()` at boot and asserts every leaf has a `description`.

#### Scenario: A non-conforming tool name fails the build

- **GIVEN** a widget declares a tool with `name: "SaveSchema"` (PascalCase, not snake_case)
- **WHEN** `scripts/check-tool-quality.mjs` runs
- **THEN** the build fails with an error naming the widget, the offending tool name, and the regex
- **AND** the suggested fix `save_schema` appears in the error output

#### Scenario: A noun-only tool name fails the build

- **GIVEN** a tool declares `name: "document"` (no action verb prefix)
- **WHEN** the quality check runs
- **THEN** the build fails citing the missing action verb
- **AND** the error lists the allowed verb prefixes

#### Scenario: A too-short or non-actionable description fails

- **GIVEN** a tool declares `description: "saves the thing"` (16 chars, no "Use when" / "Triggers when")
- **WHEN** the quality check runs
- **THEN** the build fails citing both the length floor (40 chars) and the missing trigger phrasing
- **AND** the error includes a worked-example description for the failing tool

#### Scenario: A Zod field missing .describe() fails

- **GIVEN** a tool's input schema is `z.object({ documentId: z.string(), page: z.number().describe("page #") })`
- **WHEN** the quality check walks the schema
- **THEN** the build fails naming the field `documentId` and the tool that owns it
- **AND** the error explains the LLM has to guess the field's meaning without a description

#### Scenario: A fully-conforming tool passes all four checks

- **GIVEN** a tool with `name: "open_document"`, a 60-character description containing "Use when…", and every Zod field carrying a `.describe(...)`
- **WHEN** the quality check runs
- **THEN** the check passes for that tool
- **AND** the build proceeds

### Requirement: The tool catalog SHALL include 5 new mutate-category tools

After this change lands, the tool catalog SHALL include 5 new
mutate-category tools (`propose_schema_field`, `accept_proposal`,
`reject_proposal`, `commit_gate`, `dismiss_gate`, `book_call`)
plus `suggest_intent`. Each MUST be mirrored on both the app-side
widget catalog (`<Name>.tools.ts`) and the middleware-side
`SERVER_TOOL_CATALOG`. The drift-guard test on the server side
SHALL fail until both sides are in sync.

The widget-llm-integration epic shipped 2 read-category tools
(`open_document`, `jump_to_page` on `PdfViewer`). This follow-up
adds 5 mutate-category tools:

| Tool | Owning widget | Input | Intent |
|---|---|---|---|
| `propose_schema_field` | `ProposeSchemaFieldCard` | `{ name, type, description, categoryId }` | `proposeSchemaField` |
| `suggest_intent` | (server-only catalog entry) | `{ intent, reason, confidence? }` | maps to existing `switchFrame` mapping |
| `accept_proposal` | `ProposeSchemaFieldCard` | `{ fieldId }` | `acceptSchemaField` |
| `reject_proposal` | `ProposeSchemaFieldCard` | `{ fieldId }` | `rejectSchemaField` |
| `commit_gate` | `GateChatRail` | `{ method }` | `commitGate` |
| `dismiss_gate` | `GateChatRail` | `{}` | `dismissGate` |
| `book_call` | `BookingStatusCard` | `{}` | `openBookCall` |

All MUST conform to the quality rules from the parent epic
(snake_case, allowlisted verb prefix, `Use when …` clause in the
description, per-Zod-field `.describe()`).

#### Scenario: A new mutate tool routes through the Phase 8 chip path

- **GIVEN** the LLM emits a `commit_gate({method: "register"})` tool call
- **WHEN** the chat router validates the args against
  `GateChatRail.tools.ts`'s Zod schema
- **THEN** the tool call surfaces as
  `reply.suggestedActions[]` with key `tool:commit_gate` (the
  category-aware routing landed in the parent epic's Phase 8).
- **AND** clicking the chip dispatches a `commitGate` intent that
  the orchestrator routes to
  `OnboardingSessionContext.commitGate(method)`.

#### Scenario: The server tool catalog mirror stays in sync with the app-side widgets

- **GIVEN** a widget upgrade lands a new `<Name>.tools.ts` file
- **WHEN** the middleware-side `toolCatalog.test.ts` drift guard runs
- **THEN** the expected-name-set assertion fails until the
  middleware-side `SERVER_TOOL_CATALOG` is updated to mirror the
  new tool — forcing the author to keep both sides in sync.

