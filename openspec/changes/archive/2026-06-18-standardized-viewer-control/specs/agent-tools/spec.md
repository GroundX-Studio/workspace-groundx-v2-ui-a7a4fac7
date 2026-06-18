# Spec Delta — agent-tools

## ADDED Requirements

### Requirement: A navigation tool MAY be offered via an `offerAs` disposition

A navigation tool SHALL support being OFFERED as a clickable affordance instead of
performed, expressed as an optional `offerAs` field on the tool's own input schema
(`offerAs: { label, anchor? }`). When `offerAs` is absent the tool SHALL
auto-dispatch per its category (read navigation lands on `reply.intents[]`). When
`offerAs` is present the middleware SHALL build the intent through the tool's
existing `intentBuilder` (so it is server-validated, never free-form) and surface
it as an OFFERED `suggestedActions` entry carrying that intent, `label`, and
optional `anchor`, and SHALL NOT auto-dispatch it. There SHALL be no new offer tool
and no new verb prefix; the `ALLOWED_VERBS` allowlist is unchanged. Because `offerAs`
lives on the tool's domain input schema, it SHALL carry a `.describe(...)` (the
every-field rule), and each navigation tool's `intentBuilder` SHALL ignore `offerAs`
so it never leaks into the built intent.

#### Scenario: Offering a navigation produces a validated, non-auto suggested action

- **GIVEN** the agent calls `show_extraction` with `offerAs: { label: "See the Meters" }` and a focusedCategory argument
- **WHEN** the middleware processes the turn
- **THEN** it builds the `showExtract` intent via `show_extraction`'s `intentBuilder`
- **AND** the intent appears as a `suggestedActions` entry, not on `reply.intents[]`

#### Scenario: Absent `offerAs` auto-dispatches as today

- **GIVEN** the agent calls a read navigation tool with no `offerAs`
- **THEN** its intent auto-dispatches on `reply.intents[]`

#### Scenario: `offerAs` never leaks into the built intent

- **GIVEN** a navigation tool call carrying `offerAs`
- **WHEN** the intent is built via the tool's `intentBuilder`
- **THEN** the built intent contains the domain fields only and no `offerAs`

### Requirement: The agent SHALL be able to both perform and offer viewer actions in one turn

The agent SHALL be able to both perform a viewer action and offer one in the same
turn, and the same action SHALL be expressible either way. Performing is a
navigation tool call without `offerAs`; offering is the same tool call with
`offerAs`. Performing behavior SHALL be unchanged by the affordance mechanism.

#### Scenario: A turn performs one action and offers others

- **GIVEN** a turn where the agent calls `show_extraction` without `offerAs` AND calls navigation tools twice with `offerAs`
- **THEN** the first intent auto-dispatches
- **AND** two offered suggested actions are returned for the user to click

### Requirement: Offer-eligibility SHALL be governed by the intent catalog

A tool SHALL be offer-eligible only if it has an `intentBuilder` and is marked
LLM-emittable in the shared `intentCatalog`. The UI-only intents (`showSample`,
`openDocument`, `showCitations`) SHALL NOT be offerable. A new interact navigation tool
emitting `showInteract` SHALL be added and marked LLM-emittable in the catalog with its
coverage prompt. The navigation tool **`show_extraction_edit`** (the `_edit` sibling of
`show_extraction`, mirroring the shipped `show_smart_report_edit`) SHALL be added,
emitting `editSchema`, `category: "read"`, marked LLM-emittable — so the agent MAY offer a
clickable "edit this schema" action; `editSchema` is no longer UI-only. There SHALL be no
novel `show_schema_editor` tool.

#### Scenario: A UI-only intent cannot be offered

- **GIVEN** an attempt to offer an action whose intent kind is `showSample`, `openDocument`, or `showCitations`
- **THEN** no suggested action is produced for it

#### Scenario: The schema editor can be offered

- **GIVEN** the agent calls the schema-editor navigation tool with `offerAs`
- **THEN** an `editSchema` `suggestedActions` entry is produced (not auto-dispatched)

### Requirement: Navigation intents SHALL fully describe their destination

Each per-destination navigation intent SHALL carry everything needed to render its
destination. The showExtract intent SHALL carry scope, schemaId, and an optional
focusedCategoryId. The showReport intent SHALL carry templateId and scope. The
editTemplate intent SHALL carry templateId and an optional selectedSectionId. The
showIntegrate intent SHALL carry scope. The openDocument intent SHALL carry
documentId and an optional page. A showInteract intent SHALL be added for the
Interact destination, carrying scope (the interact-chat step resolves its document
from that scope). The editSchema intent SHALL reach the schema-design surface by
moving the active extract-workbench step into its design sub-position (NOT a frame),
and SHALL work in both the steady and onboarding experiences. There SHALL be no
frame-named navigation intent.

#### Scenario: showExtract carries category focus

- **GIVEN** a `show_extraction` tool call with a focusedCategory argument
- **THEN** the built showExtract intent carries that value as focusedCategoryId

## MODIFIED Requirements

### Requirement: show_understand tool SHALL dispatch the F2/Understand canvas surface

The agent-tool registry SHALL include `show_understand({doc_id, progress})`.
On invocation, the canvas dispatcher SHALL push the Understand (doc-viewer) viewer
step with the named document active. "Understand" is the journey-stage name for this
surface; the dispatcher SHALL NOT read or write a frame value.

#### Scenario: Tool dispatches the Understand surface

- **WHEN** the LLM emits `show_understand` with a valid `doc_id`
- **THEN** the canvas shows the Understand (doc-viewer) surface
- **AND** the supplied document is the active doc in the PDF viewer

### Requirement: show_extraction tool SHALL dispatch the F3/Extract canvas surface

The agent-tool registry SHALL include `show_extraction({schema_id, doc_id, category?, render?})`.
On invocation, the canvas dispatcher SHALL push or mutate the Extract (extract-workbench)
viewer step with the named schema + doc + (optional) category active. The dispatcher
SHALL NOT read or write a frame value.

#### Scenario: Tool dispatches the Extract surface

- **WHEN** the LLM emits `show_extraction` with valid arguments
- **THEN** the canvas shows the Extract (extract-workbench) surface
- **AND** the named schema and category are the active selection

### Requirement: show_field_citation tool SHALL open the F4 expanded-citation peek

The agent-tool registry SHALL include `show_field_citation({field_id, doc_id, page})`.
On invocation, the canvas dispatcher SHALL open the field citation peek
on the named field + page. The dispatcher SHALL NOT read or write a frame value.

#### Scenario: Tool opens the field citation peek

- **WHEN** the LLM emits `show_field_citation`
- **THEN** the field citation peek surface opens
- **AND** the named field + doc + page are visible with the relevant region highlighted

### Requirement: propose_schema_field tool SHALL emit a ProposalCard in F3a

The agent-tool registry SHALL include `propose_schema_field({field_def})`.
On invocation, a ProposalCard SHALL surface in the schema-design surface's Fields tab
(the `extract-workbench` step's `surface: "design"` sub-position, reached via the
`editSchema` intent — NOT a frame); on Accept the field SHALL be added to the active
schema. (See `onboarding-schema-editor` capability for the surface contract.)

#### Scenario: Tool surfaces a propose-card

- **WHEN** the LLM emits `propose_schema_field`
- **THEN** a ProposalCard renders in the schema-design surface's Fields tab
- **AND** Accept lands the field via the existing `addSchemaField` flow

### Requirement: propose_report_section tool SHALL emit a ProposalCard in S3a

The agent-tool registry SHALL include `propose_report_section({section_def})`. On invocation, a
ProposalCard SHALL surface in the report builder (the `report` step's `surface: "builder"`
sub-position — NOT a frame) section list; on Accept the
section SHALL be added to the active template via the shared template-edit method. The ProposalCard
surface contract is owned by the `smart-report` capability and mirrors `propose_schema_field`.

#### Scenario: Tool surfaces a section propose-card

- **WHEN** the LLM emits `propose_report_section`
- **THEN** a ProposalCard renders in the report builder (the `report` `surface: "builder"`)
- **AND** Accept lands the section via the shared template-edit method.

### Requirement: The app and server tool catalogs SHALL agree on declarative tool metadata

The app's declarative tool metadata and middleware `SERVER_TOOL_CATALOG` SHALL
agree on FULL tool shape — mirrored tool names, descriptions (verbatim),
`category`, `availableSteps`, role visibility, chat-widget `rendersWidget`
bindings, AND input schemas (compared as JSON-Schema via the middleware's
`zodToJsonSchema` bridge) — enforced by the app-side cross-package parity guard
(`app/src/tools/catalog-parity.test.ts`), which is the ONLY mechanism that can
load both catalogs (the app catalog is assembled via Vite's `import.meta.glob`).
There SHALL be no committed manifest artifact (gate-answered decision,
2026-05-31, reaffirmed 2026-06-11): the live cross-package test IS the source of
truth, and the `toolCatalog.ts` header SHALL document this instead of promising
a future codegen manifest. Server-only tools SHALL be explicitly allowlisted in
the parity guard. A tool present on one side but absent on the other, or any
full-shape drift, SHALL fail automated validation naming the offending tool.

#### Scenario: Mirrored metadata drift fails

- **GIVEN** an app tool declaration named `open_document`
- **WHEN** the server catalog omits it, changes its description or category, or
  narrows its input schema
- **THEN** the parity guard fails and names the mismatched tool and field.

#### Scenario: Server-only tool remains explicit

- **GIVEN** a server-only tool such as `lookup_groundx_docs`
- **WHEN** parity validation runs
- **THEN** the tool is allowed only because it appears in the server-only
  allowlist
- **AND** any server-only tool with a `rendersWidget` binding must be enumerated
  in the chat-widget reachability guard.

### Requirement: Per-tool prompt guidance SHALL be declared with the tool, not in the prompt

Tool usage guidance rendered into the grounded system prompt SHALL be generated
from the step-filtered tool catalog — each entry's `description` plus an
optional `ServerTool.promptGuidance` field for tools needing more than their
description — as a single generated "TOOL NOTES" section. Hand-written per-tool
paragraphs in prompt text are FORBIDDEN: guidance lives exactly once, on the
tool declaration. A tool absent from the current step's filtered catalog SHALL
contribute no guidance to that turn's prompt.

#### Scenario: Guidance tracks the filtered catalog

- **GIVEN** a chat turn on a step where `propose_schema_field` is offered
- **WHEN** the grounded system prompt is assembled
- **THEN** the TOOL NOTES section contains that tool's declared guidance
- **AND** contains no entry for tools not offered on this step.

#### Scenario: No duplicated hand-written guidance

- **GIVEN** the prompts module
- **WHEN** the grounded prompt source is inspected
- **THEN** it contains no hand-written per-tool paragraph (the former
  `propose_schema_field` prose is gone).

### Requirement: Server-executed tools SHALL be declared via `serverExecute` and excluded from intent routing

`ServerTool` SHALL gain an optional `serverExecute` executor. A tool declaring
it is executed by the middleware inside the grounded tool-result loop and
SHALL NOT declare an `intentBuilder`, SHALL NOT produce a `CanvasIntent`,
SHALL NOT surface as a chip, and SHALL be `category: "read"` — invariants
enforced by a catalog test (exactly one of `serverExecute` / `intentBuilder`
present; `serverExecute ⇒ read`; `serverExecute ⇒ activityLabel` present,
the user-facing text for the reply's `toolActivity` annotation). Executor
dependencies SHALL arrive via an injected `ServerExecuteContext` built from
the grounded seam's deps (test-injectable) — an executor SHALL NOT close
over module-level live dependencies. Server-executed tools SHALL appear in the
app-side parity guard's existing server-only allowlist (the same allowlist
mechanism — no new exclusion machinery). Every server-executed tool SHALL be
covered by an LLM-free scripted LOOP-transcript fixture (the counterpart of
the intentBuilder corpus): a stubbed provider emits the call, the suite
asserts execution, transcript shape, and absence from `intents[]`/chips.

#### Scenario: Catalog invariants hold

- **GIVEN** the `SERVER_TOOL_CATALOG`
- **WHEN** the invariant test runs
- **THEN** every tool has exactly one of `serverExecute` / `intentBuilder`
- **AND** every `serverExecute` tool is `category: "read"`
- **AND** every `serverExecute` tool declares an `activityLabel`.

#### Scenario: A server-executed tool without loop coverage fails the guard

- **GIVEN** a new tool declaring `serverExecute` with no loop-transcript fixture
- **WHEN** the coverage guard runs
- **THEN** it fails, naming the uncovered tool.

