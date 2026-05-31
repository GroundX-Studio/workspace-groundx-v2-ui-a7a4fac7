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

### Requirement: View and primitive tool files SHALL be discoverable by the registry and the quality scanner

The registry glob and the tool-quality scanner SHALL discover `*.tools.ts` files co-located with a view
(`OnboardingWizard`) and a primitive (`DialogTitle`), in addition to the `chat-widgets/*` and
`viewer-widgets/*` slots. The two walkers are `app/src/tools/registry.ts` (`import.meta.glob`) and
`collectToolFiles` in `app/scripts/check-tool-quality.mjs`. Both walkers SHALL use the same discovery
shape so a tool home recognized by
one is recognized by the other; a `*.tools.ts` in a recognized view/primitive home SHALL be subject to
the same quality rules as a widget tool.

#### Scenario: A view-hosted tool file is discovered

- **GIVEN** `OnboardingWizard` ships a co-located `*.tools.ts`
- **WHEN** the registry assembles the catalog and the quality scanner runs
- **THEN** the view's tools appear in the catalog
- **AND** the quality scanner evaluates them against the same rules as widget tools.

#### Scenario: A primitive-hosted tool file is discovered

- **GIVEN** the `DialogTitle` primitive ships a co-located `*.tools.ts`
- **WHEN** the registry assembles the catalog and the quality scanner runs
- **THEN** the primitive's tools appear in the catalog and are quality-checked.

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

