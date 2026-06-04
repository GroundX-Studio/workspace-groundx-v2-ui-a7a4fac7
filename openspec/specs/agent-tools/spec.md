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

The agent-tool registry SHALL include `pin_to_report({turn_id, template_id?})`. On invocation it
SHALL pin the turn's literal text as a section into the target template; when no `template_id` is
supplied the surface SHALL prompt the user to choose an **existing template or a new one** (NO silent
auto-create) and land the section through the shared create/edit-template methods. Pins are
**literal text** — automatic variable inference is parked (decision #12). The pinned-section surface
contract (provenance, the existing-or-new UX, where the section lands) is owned by the `smart-report`
capability.

#### Scenario: Pin without a template_id prompts existing-or-new

- **WHEN** the LLM emits `pin_to_report` without a `template_id`
- **THEN** the surface prompts for an existing template or a new one (no silent auto-create)
- **AND** on selection the turn's literal text lands as a section via the shared template method.

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

The agent-tool registry SHALL include `propose_report_section({section_def})`. On invocation, a
ProposalCard SHALL surface in the report builder (frame f4a / S3a) section list; on Accept the
section SHALL be added to the active template via the shared template-edit method. The ProposalCard
surface contract is owned by the `smart-report` capability and mirrors `propose_schema_field`.

#### Scenario: Tool surfaces a section propose-card

- **WHEN** the LLM emits `propose_report_section`
- **THEN** a ProposalCard renders in the report builder (frame f4a)
- **AND** Accept lands the section into the template via the shared edit-template method.

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

### Requirement: The verb allowlist SHALL admit `show_` for canvas-dispatch tools

`check-tool-quality`'s `ALLOWED_VERBS` SHALL include `show_`, the canonical canvas-dispatch verb for
the ScopedViewerWidgets (`show_understand` / `show_document`, `show_extraction`(+`_edit`),
`show_smart_report_render`(+`_edit`), `show_integrate`). This closes the gap where the `show_*`
family was spec-only and would have failed the quality guard the moment it was authored (per
`feedback_no_shortcuts`).

#### Scenario: A show_ tool passes the quality guard

- **GIVEN** a `show_smart_report_render` tool authored as a co-located `*.tools.ts`
- **WHEN** `check-tool-quality` runs
- **THEN** the `show_` prefix is allowlisted and the tool passes the verb-prefix rule.

### Requirement: The registry SHALL include the smart-report canvas-dispatch tools, mirrored both sides

The registry SHALL include `show_smart_report_render({ template_id?, scope })` and
`show_smart_report_edit({ template_id, selected_section_id? })`, where `scope` is a `ContentScope`.
`show_smart_report_render` SHALL move the canvas to the report render surface (frame f4 / S3) for the
given scope; `show_smart_report_edit` SHALL move the canvas to the builder (frame f4a / S3a) with the
named section pre-selected when supplied. Each SHALL be mirrored on BOTH the app `*.tools.ts` AND the
middleware `SERVER_TOOL_CATALOG`, with the drift-guard test green. The surface contract is owned by
the `smart-report` capability.

#### Scenario: Render tool opens the report surface for a scope

- **WHEN** the LLM emits `show_smart_report_render` with a `scope`
- **THEN** the canvas moves to the report render surface (frame f4) rendered over that scope.

#### Scenario: Edit tool opens the builder with a section selected

- **WHEN** the LLM emits `show_smart_report_edit` with a `selected_section_id`
- **THEN** the canvas moves to the report builder (frame f4a) with the named section pre-selected.

### Requirement: Report template-mutation tools SHALL share the Extract builder tool family

The report builder's section-mutation tools SHALL be the SAME tool family as the Extract schema
builder's field-mutation tools — same naming, Zod-validation, chip routing, and both-side mirroring
(`*.tools.ts` + `SERVER_TOOL_CATALOG`) — since both operate on the shared template lifecycle. This
covers proposing, accepting, rejecting, editing, deleting, and reordering a section, setting a
section's scope, and running a render. Names SHALL use the allowlisted verb set
(`propose_`/`accept_`/`reject_`/`edit_`/`delete_`/`run_`); any genuinely new verb SHALL be added to
`ALLOWED_VERBS`, never bypassed.

#### Scenario: A report section mutation uses the shared builder tool family

- **GIVEN** the report builder
- **WHEN** a section is proposed / edited / deleted / reordered or a render is run via a tool
- **THEN** the tool conforms to the same family contract (verb allowlist, Zod, chip routing, both-side mirror) as the Extract field-mutation tools.

### Requirement: The registry SHALL include a `save_to_account` gate-open tool, mirrored both sides

The registry SHALL include `save_to_account()` — a `mutate`-category tool owned by
`GateChatRail` (the gate-lifecycle widget) whose handler emits
`{ kind: "openGate", trigger: "save" }`. It SHALL be exposed on the analysis
surfaces where a user would save mid-flow (`availableSteps` ⊇ `doc-viewer`,
`interact-chat`) and SHALL be mirrored on BOTH the app `GateChatRail.tools.ts`
AND the middleware `SERVER_TOOL_CATALOG`, with the drift guard
(`toolCatalog.test.ts`) and the app↔server parity guard (`catalog-parity.test.ts`)
green. The name uses the allowlisted `save_` verb; the description carries a
`Use when` clause and disambiguates from `submit_signup` (which submits the
form, whereas this OPENS the sign-in offer).

#### Scenario: save_to_account opens the sign-in gate on the live canvas

- **GIVEN** an anonymous onboarding session on the Interact (f5) doc-viewer canvas
- **WHEN** the LLM emits `save_to_account` (or the user clicks the
  `tool:save_to_account` suggested-action chip)
- **THEN** an `openGate` intent with `trigger: "save"` dispatches through the
  canvas orchestrator
- **AND** the sign-in gate opens (the canvas shows the gate value-prop and the
  chat rail shows the sign-in offer).

#### Scenario: save_to_account passes the quality + parity guards

- **GIVEN** the `save_to_account` tool authored as a co-located `*.tools.ts` entry
  and mirrored in `SERVER_TOOL_CATALOG`
- **WHEN** `check-tool-quality`, `toolCatalog.test.ts`, and `catalog-parity.test.ts` run
- **THEN** the `save_` prefix is allowlisted, the description + per-field
  `.describe()` pass, the name set matches on both sides, and there is no
  app-only / server-only orphan.

### Requirement: The canvas orchestrator SHALL route the `openGate` intent to the onboarding gate

The `openGate` `CanvasIntent` (`{ kind: "openGate", trigger }`) SHALL be routed by
the canvas orchestrator to `OnboardingSessionContext.openGate(trigger)` — it
SHALL NOT be a declared-but-unrouted intent. Routing SHALL soft-fail (no throw,
no effect) when no `OnboardingSessionProvider` is mounted (the steady tree),
matching the `commit_gate` / `dismiss_gate` routing. This is the single
mechanism the `save_to_account` tool, the `tool:save_to_account` chip, and any
future gate-open producer use to open the gate — there is no parallel path.

#### Scenario: openGate intent opens the gate via the session

- **GIVEN** a canvas orchestrator mounted above an `OnboardingSessionProvider`
- **WHEN** `{ kind: "openGate", trigger: "save" }` is dispatched
- **THEN** the orchestrator calls `OnboardingSessionContext.openGate("save")` and
  the gate transitions to `open`.

#### Scenario: openGate is a no-op in the steady tree

- **GIVEN** a canvas orchestrator with no `OnboardingSessionProvider` above the gate
- **WHEN** `{ kind: "openGate", trigger: "save" }` is dispatched
- **THEN** the dispatch returns normally with no throw and no gate side effect.

### Requirement: The app and server tool catalogs SHALL agree on tool names and roles

The app and server tool catalogs SHALL agree on the set of tool names and each tool's `availableIn` role
set, enforced by an automated guard rather than manual review. The app-side catalog
(`app/src/tools/*.tools.ts`) and the middleware `SERVER_TOOL_CATALOG`
(`middleware/src/services/toolCatalog.ts`) are the two sides. The guard SHALL be a
cross-package NAME+role parity assertion where the packages can share one test cleanly, or a documented
per-package check (e.g. a committed name+role manifest the other side asserts against) where they
cannot. A tool present on one side but absent on the other, or with a divergent `availableIn`, SHALL
fail the guard.

#### Scenario: A tool added on one side without mirroring fails the guard

- **GIVEN** a tool declared in an app `*.tools.ts` with `availableIn: ["member"]`
- **WHEN** the middleware `SERVER_TOOL_CATALOG` omits it or mirrors it with a different `availableIn`
- **THEN** the parity guard fails and names the mismatched tool.

#### Scenario: Matched name + role sets pass

- **GIVEN** every app tool has a server mirror with the same name and the same `availableIn` role set
- **WHEN** the parity guard runs
- **THEN** it passes.

### Requirement: View and primitive tool files SHALL be discoverable by the metadata collector and the quality scanner

The app metadata collector/parity glob and the tool-quality scanner SHALL
discover `*.tools.ts` files co-located with a view (`OnboardingWizard`) and a
primitive (`DialogTitle`), in addition to the `chat-widgets/*` and
`viewer-widgets/*` slots. The two walkers are `collectAppToolSpecs` usage in
`app/src/tools/catalog-parity.test.ts` (`import.meta.glob`) and `collectToolFiles`
in `app/scripts/check-tool-quality.mjs`. Both walkers SHALL use the same
discovery shape so a tool home recognized by one is recognized by the other; a
`*.tools.ts` in a recognized view/primitive home SHALL be subject to the same
quality rules as a widget tool.

#### Scenario: A view-hosted tool file is discovered

- **GIVEN** `OnboardingWizard` ships a co-located `*.tools.ts`
- **WHEN** the metadata collector and the quality scanner run
- **THEN** the view's tools appear in the metadata collection
- **AND** the quality scanner evaluates them against the same rules as widget tools.

#### Scenario: A primitive-hosted tool file is discovered

- **GIVEN** the `DialogTitle` primitive ships a co-located `*.tools.ts`
- **WHEN** the metadata collector and the quality scanner run
- **THEN** the primitive's tools appear in the metadata collection and are quality-checked.

### Requirement: The verb allowlist SHALL admit submit_, wizard_, and close_

`check-tool-quality`'s `ALLOWED_VERBS` SHALL include `submit_`, `wizard_`, and `close_` so the deferred
sign-up, onboarding-wizard navigation, and dialog-dismiss tools pass the verb-prefix rule.

#### Scenario: A submit_/wizard_/close_ tool passes the verb-prefix rule

- **GIVEN** tools named `submit_signup`, `wizard_next`, and `close_dialog`
- **WHEN** the tool-quality guard runs
- **THEN** each tool's verb prefix is allowlisted and it passes the verb-prefix rule.

### Requirement: The SignUpWidget SHALL expose a submit_signup tool

The agent-tool catalog SHALL include a `submit_signup` mutate tool exposed by the F6 SignUpWidget, with
a server-catalog mirror. The widget's submit Button SHALL reference the tool; the input fields SHALL
carry `noTool` with the reason `"value collected by submit_signup"`; the widget's `no-llm.md` opt-out
SHALL be removed.

#### Scenario: The sign-up submit is LLM-invocable

- **GIVEN** the SignUpWidget tool catalog
- **WHEN** it is inspected
- **THEN** a `submit_signup` mutate tool exists, the submit Button references it, and the widget no
  longer declares a `no-llm.md` opt-out.

### Requirement: The OnboardingWizard SHALL expose navigation tools

The agent-tool catalog SHALL include `wizard_next`, `wizard_back`, `wizard_finish`, and `dismiss_wizard`
tools exposed by the OnboardingWizard view, each dispatching the corresponding CanvasIntent, with
server-catalog mirrors. They are navigation tools (auto-dispatch), not state-mutations.

#### Scenario: The LLM advances the onboarding wizard

- **GIVEN** the active surface is the OnboardingWizard
- **WHEN** the LLM emits `wizard_next`
- **THEN** the wizard advances via the dispatched navigation CanvasIntent
- **AND** `wizard_back`, `wizard_finish`, and `dismiss_wizard` are likewise available and dispatch their
  respective intents.

### Requirement: The DialogTitle primitive SHALL expose a close_dialog tool

The agent-tool catalog SHALL include a `close_dialog` mutate tool exposed by the `DialogTitle`
primitive, with a server-catalog mirror. The primitive's close IconButton SHALL reference the tool.

#### Scenario: The LLM dismisses the active dialog

- **GIVEN** a dialog is open with a `DialogTitle` close control
- **WHEN** the LLM emits `close_dialog`
- **THEN** the active dialog is dismissed via the dispatched CanvasIntent
- **AND** the close IconButton references the `close_dialog` tool.

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
