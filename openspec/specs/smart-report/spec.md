# smart-report Specification

## Purpose
TBD - created by archiving change 2026-05-29-smart-report-screen. Update Purpose after archive.
## Requirements
### Requirement: A report SHALL be Template + Scope + generated answers, sharing Extract's lifecycle

A report SHALL follow the **Template + Scope + Results** meta-pattern (see the
`template-scope-results` architecture doc): a **report template** is the durable artifact — an
ordered list of question-`sections`, **scope-independent**, updatable, and saved (the shipped shared
`templates` table has **no `version` column** — versioning is deferred, #13) — and a rendered report
= the template applied over a `ContentScope`. The report template SHALL reuse the
SAME data objects, persistence, and lifecycle/lifecycle-management as the **Extract schema** (the
established precedent), NOT a forked parallel implementation; an Extract schema and a report
template are two instances of one "template of questions" concept. Each section SHALL carry a `name`
(snake_case), a `renderAs` of `PARAGRAPH` | `BULLETS` | `TABLE`, a `question`, a `variables[]` list,
and optional `instructions`. The template (and its sections) SHALL be scope-independent — scope is a
render-time input recorded on the result, NOT stored on the template. (Per-section sourcing is deferred.)

#### Scenario: Report template reuses the Extract schema lifecycle

- **GIVEN** the report template and the Extract schema
- **WHEN** their create / edit / save / persistence paths are inspected
- **THEN** they are the same shared lifecycle (objects + DB handling), not duplicated implementations
- **AND** the template is scope-independent — the same template renders over different `ContentScope`s.

### Requirement: A report SHALL run over any ContentScope shape, with filter composable on every shape

A report's scope SHALL be a `ContentScope` supporting all of: `bucket` · `bucket + filter` ·
`documents[]` · `documents[] + filter` · `group` · `group + filter` — where `filter`
(project/portfolio/fund/folder filter-field values) is an **orthogonal, composable** modifier on
every shape, NOT mandatory and NOT forbidden on any shape. The scope is selected by **context**, not
by a hardcoded rule. Per the doc-org model (bucket == workspace, project == filter-field value), a
per-sample demo opens on **`bucket + project filter`**. The same render surface SHALL serve every
scope shape with no surface-specific fork; single-document and multi-document/multi-project/
multi-workspace reports differ only by their `ContentScope`.

#### Scenario: The same surface renders any scope shape

- **GIVEN** a report scoped by `bucket + project filter` (the demo default)
- **WHEN** it renders
- **THEN** it renders over the documents matching that workspace + project filter
- **AND** **GIVEN** the scope is instead `documents[]`, `group`, or any shape with or without a `filter`
- **THEN** the same render surface renders the matching document set with no surface change.

### Requirement: The report render surface (frame f4 / S3) SHALL stream ordered, cited sections

The render surface SHALL obtain its rendered report from the render endpoint
(`POST /api/widgets/smart-report/reports/render`) on its **initial** paint — not from a synchronous
client-side fixture read — so the surface the user first sees on frame `f4` is the endpoint response
(the same path the `↻ re-render` control and the builder Save already use). It SHALL display the
rendered report as its template's sections in order, each with a heading, a body formatted per
`renderAs`, and inline citations using the shared `CiteChip` (honoring the WF-06b tiers); sections
SHALL stream in render order; and each section heading SHALL carry an **✎ edit §N** affordance that
navigates to the builder (frame `f4a`) with that section pre-selected. While the initial render is in
flight the surface SHALL show a visible loading state; if the endpoint returns no renderable report
for the scope it SHALL show the empty state; if the initial render call fails it SHALL show a
retryable error affordance rather than a blank surface or a thrown render. (MOCK_MODE backs the
endpoint response; the live multi-document fan-out remains deferred to WF-10.)

#### Scenario: Initial paint renders the endpoint response

- **GIVEN** the user reaches the Report render surface on frame `f4`
- **WHEN** the surface mounts
- **THEN** it calls `POST /api/widgets/smart-report/reports/render` for its initial report (not a synchronous fixture read)
- **AND** on the response the sections render in order with headings, `renderAs`-formatted bodies, and `CiteChip`s
- **AND** each heading exposes an edit affordance that opens frame `f4a` with that section selected.

#### Scenario: Initial render degrades through loading, empty, and error

- **GIVEN** the initial render call to the endpoint
- **WHEN** the call is in flight
- **THEN** the surface shows a visible loading state (not a blank surface)
- **AND** **WHEN** the endpoint returns no renderable report for the scope
- **THEN** the surface shows the empty state
- **AND** **WHEN** the initial render call fails
- **THEN** the surface shows a retryable error affordance and does not throw.

#### Scenario: Initial paint and re-render share one fetch path

- **GIVEN** the render surface
- **WHEN** the initial paint and a later `↻ re-render` both resolve their report
- **THEN** both come from the same `POST /api/widgets/smart-report/reports/render` call path
- **AND** no synchronous client-side fixture-read survives as the surface's first-paint source.

### Requirement: A CiteChip in a rendered report SHALL drive the viewer to the cited source

Clicking a `CiteChip` in a rendered section SHALL dispatch `highlightCitation` through the
`CanvasOrchestrator`, opening the cited document at the cited page with the cited region highlighted
— reusing the shipped clickable-citation path, the `PdfViewerWidget` lit-regions, and the WF-06b
attribution tiers. The report SHALL NOT introduce a separate citation-peek surface.

#### Scenario: Report citation jumps the viewer to the source

- **GIVEN** a rendered section with a citation
- **WHEN** the user clicks its `CiteChip`
- **THEN** the viewer opens the cited document at the cited page
- **AND** the cited region is highlighted at the citation's tier precision.

### Requirement: The report builder surface (frame f4a / S3a) SHALL mirror the schema-editor chrome

The builder SHALL reuse the F3a schema-editor chrome: a pinned-samples row, `Sections` / `Render`
sub-tabs, a row-based section list (name + `renderAs` chip + question) with one row expandable into
an inline editor, accept/dismiss proposal cards, a `⋮` menu, and a topbar of
`export ▾ 🔒 · ↻ render · 💾 Save 🔒`. The inline editor SHALL expose the section's `name`,
`renderAs`, `question`, and `instructions` (no per-section scope — the template is scope-independent). It SHALL be reachable from the render
surface's edit affordance and from the `show_smart_report_edit` tool.

#### Scenario: Builder presents the editable section list

- **GIVEN** a draft or saved template
- **WHEN** the builder mounts on frame `f4a`
- **THEN** it shows the pinned-samples row, `Sections`/`Render` sub-tabs, and one row per section
- **AND** a row expands into an inline editor exposing name, renderAs, question, instructions, and scope
- **AND** the topbar offers export (locked), render, and Save (locked).

### Requirement: Every report control SHALL be drivable from chat via a co-located tool

Each report UX control SHALL have a co-located `*.tools.ts` declaration so the LLM can drive it:
opening the render surface, opening the builder at a section, pinning a turn, proposing a section,
adding / editing / removing / reordering a section, setting a section's scope, and rendering. No
report control SHALL be mouse-only. Until the AgentToolBus Zod→JSON-Schema bridge ships, these tools
SHALL invoke the same ChatStore actions their UI affordances call (Extract's interim pattern).

#### Scenario: A chat tool performs the same mutation as the UI control

- **GIVEN** the report builder
- **WHEN** an `add`/`edit`/`remove`/`reorder` section tool (or `render_report`) is invoked
- **THEN** the template mutates (or renders) identically to using the equivalent on-screen control.

### Requirement: Pin-to-report SHALL ask for a target template — no auto-create

Every assistant chat turn SHALL carry a **📌 pin to report** affordance. On pin the user SHALL be
asked, via a UX, whether to add the section to an **existing template** or a **new template** — the
system SHALL NOT silently auto-create a draft. The pin SHALL land the section through the shared
explicit **create-template / edit-template** methods (the same template lifecycle as Extract). The
pinned section's `question` is the question the user asked (literal text — auto-variable inference
parked, #12), and its citations come from the turn's `ChatMessage.citations` (the promoted in-memory
field, per core-data-model-hardening), retaining source-turn provenance.

#### Scenario: Pin prompts for existing-or-new template

- **GIVEN** the user pins an assistant turn
- **WHEN** the pin affordance fires
- **THEN** a UX asks whether to target an existing template or create a new one
- **AND** on choosing, the section lands via the shared create/edit-template method (no silent auto-create)
- **AND** the section's question is the literal turn text with source-turn provenance.

### Requirement: Reaching Report from Extract or Interact SHALL carry the current scope

The system SHALL use the `ContentScope` of the surface the user transitioned from (Extract or Interact)
as the report's **render scope** — supplied to the render and recorded on the rendered result (NOT
stored on the scope-independent template) — whether they reach Report via the step-strip pill or a chat
path such as a pin or "make me a report". The user SHALL NOT re-select content they were already
analyzing.

#### Scenario: Interact → Report inherits the Interact scope

- **GIVEN** the user is in Interact on a document
- **WHEN** they transition to Report
- **THEN** the report's **render scope** is the document (or scope) they were interacting with
- **AND** that scope rides the transition + lands on the rendered result, not on the template.

### Requirement: The render endpoint SHALL run a template over a ContentScope and return cited sections

The middleware SHALL expose `POST /api/widgets/smart-report/reports/render` accepting
`{ template_id, scope: ContentScope, variables, section_ids|null, chat_session_id, parent_message_id }`
and returning `{ report_id, template_id, status, sections:[{ name, render_as, body, cites,
confidence, warnings }], resolved_variables, export_formats, preview_only }`. A `section_ids` subset
SHALL scope a re-render to those sections only.

#### Scenario: Render returns ordered cited section bodies

- **GIVEN** a saved template and a `ContentScope`
- **WHEN** `POST /api/widgets/smart-report/reports/render` is called
- **THEN** the response carries `sections[]` in template order, each with a `body`, `cites`, and `render_as`
- **AND** `preview_only` reflects whether this was a sample-scope preview.

### Requirement: Report anon/preview/gate behavior SHALL mirror Extract exactly

The report's anonymous, preview, and gating behavior SHALL match the Extract surface — not a
re-invented policy. Anonymous users SHALL be able to render and preview a report on a sample scope
(`preview_only: true`, no row hiding); Save, Export, and rendering a BYO scope SHALL trigger the
sign-in gate via the shared `commitGate` flow (lock affordance visible), exactly as Extract gates
Save/Export/BYO.

#### Scenario: Report gating equals Extract gating

- **GIVEN** an anonymous user on a sample scope
- **WHEN** they render the report
- **THEN** the full report previews (`preview_only: true`), the same as Extract previews a sample
- **AND** **WHEN** they click Save/Export or target a BYO scope
- **THEN** the sign-in gate is triggered through the same `commitGate` flow Extract uses.

### Requirement: Section render edge cases SHALL degrade visibly

An **unresolved variable** SHALL render the section with the `{variable}` placeholder plus a
"bind it" warning chip. A section with **no supporting source** SHALL render `—` plus a
`⚠ no support in docs` low-confidence flag. Editing a section's **question** SHALL trigger a scoped
re-render of that section only.

#### Scenario: Missing source flags low confidence

- **GIVEN** a section whose question finds no support in its scope
- **WHEN** the report renders
- **THEN** that section's body is `—` with a "no support in docs" low-confidence warning
- **AND** other sections render normally.

### Requirement: The Report chapter SHALL ship on the Utility single-doc case via a fixture

The render + builder surfaces SHALL be drivable by a MOCK_MODE **Utility** report fixture — a
single-document IC-brief-style template (e.g. billing summary `PARAGRAPH`, charge breakdown `TABLE`,
anomalies `BULLETS`, recommendation `PARAGRAPH`) scoped to the Utility bill — so the chapter ships on
the current real use case without the live multi-doc seed (WF-10). The same surfaces SHALL serve a
multi-document scope (Solar) once WF-10 lands, with no surface rework.

#### Scenario: Utility report demos with no live multi-doc seed

- **GIVEN** MOCK_MODE and the Utility scenario
- **WHEN** the user reaches the Report chapter
- **THEN** the render surface shows the single-doc IC-brief sections with cited bodies
- **AND** the builder shows those sections as editable rows
- **AND** no live multi-document seed is required.

### Requirement: SmartReport SHALL be a ScopedViewerWidget satisfying the widget contract

The render, builder, and pin widgets SHALL be production widgets (no onboarding-specific duplicate)
each carrying `role: WidgetRole` + a required `scope: WidgetScope` (per `widget-role-access`, which
replaces the old `mode: "onboarding" | "steady"` prop), each shipping a `README.md` and a sibling
`*.test.tsx`, placed under `viewer-widgets/` (canvas) or `chat-widgets/` (pin), styled with design
tokens only (the `no-hardcoded-styles` drift guard walks them). Additionally, the SmartReport render
and builder widgets SHALL build on the **`ScopedViewerWidget` base owned by `core-data-model-hardening`**
(this change CONSUMES that base + its contract test — it does NOT re-declare them): each takes a real
`ContentScope` `scope`, adapts when the scope changes, and exposes the `show_smart_report_render` /
`show_smart_report_edit` canvas-dispatch tools.

#### Scenario: Widgets conform to the widget + scoped-viewer contracts

- **GIVEN** the Smart Report widgets
- **WHEN** the widget-contract and the (core-data-owned) scoped-viewer-contract tests run
- **THEN** each declares its surface by folder, ships a README and a sibling test, and accepts a `role` prop
- **AND** the render and builder widgets accept a `scope` prop, re-render on scope change, and register their `show_*` tools.

### Requirement: Automatic variable inference and version history are NOT in v1

Automatic variable inference SHALL NOT be built in v1 (decision #12) — pins are literal; the only
variable path is manual inline "make variable" selection in the builder. A version-history surface
SHALL NOT be built in v1 (decision #13) — latest-saved is the only state; the shipped `templates`
table has no `version` column and no history (a row is updated in place via upsert on its id).

#### Scenario: Pins are literal, no version-history UI

- **GIVEN** a pinned section
- **WHEN** it is created
- **THEN** no variables are auto-inferred from its text
- **AND** the builder exposes no version-history surface.

### Requirement: The live multi-document render (Phase 7) SHALL remain deferred to WF-10

The live multi-document render path SHALL remain NOT built until WF-10 (real Solar source assets)
lands. That path fans each section's `question` through `search_groundx` (scoped by the section's
`ContentScope`) with grounded generation and WF-06b verification against real documents, including the
Solar multi-document / multi-project / multi-workspace render. The MOCK_MODE fixtures SHALL remain the
offline render path, and the render surface SHALL serve the live multi-document case with no surface
rework once WF-10 lands.

#### Scenario: Multi-doc live render is not attempted before WF-10

- **GIVEN** WF-10 (real Solar source assets) has not landed
- **WHEN** the report surface renders any scope
- **THEN** the report is sourced from the MOCK_MODE-backed render endpoint, not a live `search_groundx` fan-out
- **AND** the render surface requires no rework to serve the live multi-document case once WF-10 lands.

