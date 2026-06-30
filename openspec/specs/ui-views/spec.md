# ui-views Specification

## Purpose

Define the durable contract for the F-series view shells — what each
view (F1 Ingest, F2 Understand, F3/F3a Extract, F5 Interact, F6 Gate,
F7 Integrate) renders, how it delegates rendering to production
widgets, and the frame-routing invariants OnboardingShell uses to
switch between them. F3a's editor surface lives in the dedicated
`onboarding-schema-editor` capability.
## Requirements
### Requirement: F7 IntegrateView SHALL ship real connector cards + plugin downloads

The F7 IntegrateView SHALL render a 2-column grid: an **API tile**
(left) with a code snippet block + masked `YOUR API KEY` row + ghost
copy buttons for `curl` / `Python` / `TS`, and an **Agent Plugins
tile** (right) with 4 plugin rows (Claude · OpenAI · Gemini · Cursor)
each with a size and a download CTA. An on-prem footnote SHALL be
pinned below the grid. All locked items (API key, plugin downloads)
route to F6 via an unlock banner pinned above the grid.

The original "real connector cards + plugin downloads" requirement is
retained; this MODIFIED version adds the explicit 2-column layout +
unlock-banner + on-prem footnote contract that the wireframe pins.

#### Scenario: F7 renders both tiles

- **GIVEN** the user is on F7 (reachable via the step strip Integrate pill)
- **WHEN** the IntegrateView renders
- **THEN** an API tile is in the left column with `# utility bill, your bucket` code preamble
- **AND** an Agent Plugins tile is in the right column with 4 plugin rows
- **AND** an unlock banner is pinned above the grid
- **AND** the on-prem footnote (`⛏ Running on-prem or air-gapped?`) is pinned below the grid.

### Requirement: F3a edit-schema sub-branch SHALL rerun extraction against the new schema

The F3a inline schema editor SHALL, on field-prompt edit + save,
trigger a re-run of extraction against the active sample document AND
update the displayed value + confidence. UI-01's existing per-field
rerun covers the surface; this requirement pins the rerun-on-save
behavior MUST fire automatically (no manual ↻ rerun click).

#### Scenario: Field edit triggers re-extraction

- **GIVEN** a user editing a field's prompt on F3a
- **WHEN** the user clicks `save field`
- **THEN** the affected field's extraction re-runs against the pinned sample
- **AND** the field-row preview updates with the new value + confidence

### Requirement: F5 InteractView SHALL open a citation side-panel on chip click

Citation markers SHALL be clickable on EVERY surface that renders assistant turns, extract
field rows, or report sections — app-wide, not any single frame (the "F5" in this
requirement's name is legacy; there is no frame-scoped fork). Clicking a marker SHALL switch
the viewer pane to the cited document (if not already active), navigate the viewer to the
cited page, and render a region highlight overlay scoped to the cited bbox. There is no
separate side-panel widget — the existing viewer pane in `OnboardingShell` / `SteadyShell`
IS the destination.

#### Scenario: Click a citation marker from any surface

- **GIVEN** an assistant turn carrying a citation `{documentId: D, page: 7, bbox: {...}}`
- **WHEN** the user clicks its `[N]` marker
- **THEN** the viewer pane shows document `D`
- **AND** the page image renders page 7
- **AND** a highlight overlay covers the cited region (best-effort if bbox is absent → page-level highlight only)
- **AND** the `cite.peeked` telemetry event still fires with the same payload

#### Scenario: Click a citation marker while viewer already shows the doc

- **GIVEN** the viewer already shows document `D` on page 3
- **WHEN** the user clicks a marker pointing at `D` page 7
- **THEN** the same `doc-viewer` step is mutated in place (no new viewer-history entry)
- **AND** the page jumps to 7 with the bbox overlay

### Requirement: Unknown session URLs SHALL be hydrated from the BFF

The client SHALL fetch a session from the BFF and render it when the
user navigates to `/c/:sessionId` for a session id NOT already in
localStorage. Today the page renders an inline `<code>` placeholder for
the unknown id; that MUST be replaced by the BFF-driven hydrate.

#### Scenario: Open a session URL on a fresh browser

- **GIVEN** a signed-in user opens `/c/<server-only-session-id>` on a
  browser whose localStorage doesn't carry that id
- **WHEN** the page mounts
- **THEN** the BFF GET `/api/chat-sessions/:id` populates the session
- **AND** the chat thread renders with its persisted messages

### Requirement: Multi-session keyboard shortcuts SHALL include cmd-K switcher

The product SHALL bind `cmd-K` to open a session picker overlay, with
arrow-key navigation and Enter to switch to the selected session.

#### Scenario: cmd-K opens the picker

- **GIVEN** a signed-in user with 3 chat sessions
- **WHEN** the user presses `cmd-K`
- **THEN** the picker overlay opens listing the 3 sessions
- **AND** ↑/↓ navigates; Enter switches to the selected session

### Requirement: Thinking-stream notes SHALL render markdown-lite formatting

Scenario manifests carry `thinkingScript: string[]`. Each line SHALL
render with markdown-lite support — at minimum `**bold**` is bolded in
the F2 thinking stream — to match the wireframe's emphasis treatment.

#### Scenario: Bold tokens render

- **GIVEN** a manifest line `"Reading **utility-bill.pdf** now…"`
- **WHEN** F2's thinking stream displays the line
- **THEN** `utility-bill.pdf` renders in bold

### Requirement: S3a section editor SHALL surface variable-inference proposals

Per the deferred-but-locked decision #12, S3a's section editor SHALL
support a hybrid "make variable" flow: the user selects a noun phrase
in the section question; a chip surfaces offering to make it a
variable. Future renders of the section against a different project
SHALL re-evaluate the variable.

#### Scenario: User makes a literal into a variable

- **GIVEN** a section question containing "the project" as a literal
- **WHEN** the user selects the phrase and clicks the "make variable" chip
- **THEN** the question is rewritten to `{project}`
- **AND** future renders surface a variable chip for `{project}`

### Requirement: BYO upload UI SHALL pass filter.workflow_id on every uploaded doc

The user-facing BYO upload UI SHALL include `workflow_id` in every
ingest payload's filter when the upload is scoped to a workflow (per
`memory/project_workflow_id_filter.md`, locked 2026-05-25). Frontend
tests MUST assert the filter contains `workflow_id` when ingest is
triggered from a workflow context.

#### Scenario: Workflow-scoped BYO upload carries workflow_id

- **GIVEN** a user uploading a doc from inside a workflow-scoped surface
- **WHEN** the ingest payload is constructed
- **THEN** `payload.filter.workflow_id` matches the originating workflow id
- **AND** the resulting GroundX document's `filter.workflow_id` matches

### Requirement: F-series view transitions SHALL accumulate ViewerSteps with surface-specific annotations

Each navigation SHALL push a corresponding `ViewerStep` onto `viewer.history` carrying the surface's cross-navigation state in its payload. Ingest → ingest-picker (with optional `attachedSchema` annotation); Understand → doc-viewer(documentId); Extract / schema-design / Report-render → extract-workbench(scenarioId, focusedCategoryId?, surface?) or report(surface); Interact → interact-chat(scenarioId); Integrate → integrate.

`OnboardingShell.canvasContent` SHALL switch on `currentStep.kind` to select which surface to render. Surfaces SHALL read scenario / category / document props from the step's payload. There SHALL be no top-level `currentFrame` slot and no `currentFrame`-derived getter; new and existing code SHALL select the surface from the active step kind, never from a frame value.

#### Scenario: currentStep.kind drives canvas rendering

- **GIVEN** the active session's `viewer.currentStep` points at `{ kind: "extract-workbench", scenarioId: "utility", focusedCategoryId: "meters" }`
- **WHEN** `OnboardingShell` renders
- **THEN** the Extract surface mounts with scenario + focused-category props read from the step payload
- **AND** no read of `session.currentFrame` exists

#### Scenario: Ingest banner reads attachment from the viewer step

- **GIVEN** the latest viewer step is `{ kind: "ingest-picker", attachedSchema: { schemaId: "es-1", name: "Utility (custom)" } }`
- **WHEN** the IngestView renders
- **THEN** the `ingest-pre-attached-schema` banner renders showing the schemaId
- **AND** no read of `session.preAttachedSchemaId` exists

### Requirement: ChatColumn SHALL render citation chips beneath every assistant bubble

`ChatColumn` SHALL render an assistant turn's citations as the **footnote model**, NOT a
detached row of standalone numbered chips (that flat row is RETIRED). This applies on every
flow that renders assistant turns (`F2ConversationFlow`, `SteadyConversationFlow`, and the
single `ConversationFlow`). The footnote model is:

- **Inline markers** — each cited claim in the answer prose carries an inline `[N]`
  superscript marker (`CiteChip` `variant="footnote"`), `N` 1-based matching the order of
  the turn's `citations` array. Clicking a marker keeps the existing jump-to-region
  behavior (the `highlightCitation` dispatch + `cite.peeked` telemetry).
- **Grouped source list** — beneath the bubble, a single collapsed `N sources` affordance
  expands to a `SourceList` grouped by `documentId` → page, deduped by region (so many
  citations on one document collapse to that document's distinct pages). The existing
  "Show all sources" action lives in this list.
- **Never-drop** — the `SourceList` is built from the FULL `citations` array, so every
  citation is reachable there even when its inline marker is absent or failed to anchor.

The same shared components are used on every surface (no per-surface fork).

#### Scenario: Assistant reply with two citations

- **GIVEN** a chat send returns `{ answer: "...[1]...[2]...", citations: [c1, c2] }`
- **WHEN** the reply renders
- **THEN** two inline `[1]` / `[2]` footnote markers appear within the answer prose
- **AND** a collapsed `2 sources` affordance beneath the bubble expands to the grouped source list
- **AND** each marker exposes `data-citation-doc` + `data-citation-page` and routes to the viewer on click

#### Scenario: Many citations on one document do not become a wall

- **GIVEN** an answer with 27 citations, all the same document across pages 1–3
- **WHEN** the reply renders
- **THEN** NO flat row of 27 standalone numbered chips is rendered
- **AND** inline markers sit next to their claims in the prose
- **AND** the collapsed `27 sources` affordance expands to a single document group listing its distinct pages (deduped)

#### Scenario: A citation with no inline marker is still reachable (never-drop)

- **GIVEN** a turn whose `citations` array has an entry with no matching `[N]` in the prose and no anchorable `answerSpan`
- **WHEN** the reply renders
- **THEN** that citation's grounding is still reachable in the grouped source list — as its own page entry, or (when another claim shares its page) folded into that page's entry whose regions include it
- **AND** clicking that entry routes to the viewer and lights the citation's region(s)

### Requirement: Citation chips SHALL survive a refresh

Assistant turns SHALL carry their citations after a page refresh just as they did at first
render. The hydrate path (`GET /api/chat-sessions/:id/messages`, RT-01) SHALL parse the
persisted `citations_json` per row and project it through the API helper into
`PersistedChatMessage.citations`, which then feeds `LiveTurn.citations`. No citation data
SHALL be dropped between insert and rehydrate. The rehydrated turn SHALL re-render in the
footnote model (inline markers + grouped source list), not as a flat chip row.

#### Scenario: Refresh re-renders the footnote model

- **GIVEN** the user sent a chat turn that produced two citations
- **WHEN** the user refreshes the browser
- **THEN** the answer re-renders with its inline `[1]` `[2]` markers and the collapsed source list
- **AND** clicking either marker (or a source-list entry) still routes to the viewer

### Requirement: F1 IngestView SHALL render full-bleed without app chrome

The Ingest IngestView SHALL be rendered with no sidebar nav AND no chat
pane. The AppShell MUST expose a `chrome="bare"` mode that
`OnboardingShell` activates when the active viewer step kind is `ingest-picker`.
The IngestView occupies the full viewport width minus standard page
gutters; sidebar + chat slide back in during the Ingest → Understand transition
animation per `openspec/wireframes/source/spec-nav-v2.jsx`.

#### Scenario: Ingest hides sidebar and chat

- **GIVEN** the user is on `/onboarding` (no scenario picked) and the
  active viewer step kind is `ingest-picker`
- **WHEN** the OnboardingShell renders
- **THEN** no element with `aria-label="Primary navigation"` is in the document
- **AND** no element with `aria-label="Chat pane"` is in the document
- **AND** the IngestView fills the viewport.

#### Scenario: Ingest → Understand transition restores chrome

- **GIVEN** the user clicks a sample tile on Ingest
- **WHEN** the active viewer step advances to `doc-viewer` (Understand)
- **THEN** the sidebar slides in from the left over ~200ms
- **AND** the chat pane slides in beside it over ~200ms (starting ~100ms after the sidebar)
- **AND** the canvas compresses to accommodate both panes.

### Requirement: F1 SHALL render every sample scenario surfaced by the middleware

The F1 IngestView SHALL render one sample tile per scenario surfaced by `/api/scenarios`, in a responsive grid (up to 3 columns on desktop). The first scenario (by `order`) MUST carry a `★ start here` recommended badge. Each tile MUST display the `chapters.{extract,interact,report}` availability as filled (live) or hollow (grayed) capability badges. (Adding Loan + Solar scenarios is a content task — author the JSON spec + ingest the PDFs to bucket 28454 — tracked separately. The UI contract here ensures the picker scales gracefully from 1 → N tiles.)

#### Scenario: One scenario in the registry renders one tile

- **GIVEN** the `/api/scenarios` response includes only the utility scenario
- **WHEN** the user navigates to `/onboarding`
- **THEN** exactly one sample tile renders
- **AND** the Utility tile carries a "★ start here" badge.

#### Scenario: Three scenarios in the registry render three tiles

- **GIVEN** the `/api/scenarios` response includes utility, loan, and solar manifests
- **WHEN** the user navigates to `/onboarding`
- **THEN** three sample tiles render in a grid
- **AND** the Utility tile (lowest `order`) carries a "★ start here" badge
- **AND** each tile's capability badges match its `chapters` flags.

### Requirement: F2 UnderstandView SHALL render the PDF viewer during live parse

While the active viewer step is the Understand (doc-viewer) step, the canvas SHALL render the
`PdfViewerWidget` (centered, max-width ~560px, aspect 8.5/11) with the
scan-line animation overlaid, and the thinking-stream notes MUST render
in the chat column — NOT in the canvas. The step strip SHALL remain on
`Understand` (active green) for the entire Understand phase; it advances to
`Extract` only when the chat emits the `Done. … Ready to analyze.`
bubble.

#### Scenario: Understand canvas shows PDF + scan, chat shows thinking notes

- **GIVEN** the user has just clicked the Utility sample tile
- **WHEN** the Understand (doc-viewer) step settles
- **THEN** the canvas contains a `PdfViewerWidget` element
- **AND** a scan-line animation is running over the PDF
- **AND** the thinking notes (`parsing layout · page 1` …) render inside the chat column, not the canvas
- **AND** the step strip's active step is `Understand` (not `Extract`).

#### Scenario: Step strip advances on Done bubble

- **GIVEN** the Understand thinking stream is playing
- **WHEN** the chat emits the `Done. Ready to analyze.` bubble
- **THEN** the step strip transitions from `Understand` (active) to `Extract` (active)
- **AND** `Understand` becomes ✓ done-traversed.

### Requirement: F3 ExtractView SHALL place the PDF viewer on the left and fields on the right

The F3 ExtractView canvas SHALL use a two-pane grid `1.2fr 1fr` with
the `PdfViewerWidget` in the LEFT pane and the extracted-fields panel
in the RIGHT pane. The field panel MUST render a category-tabs row,
field cards with the canonical anatomy (uppercase snake_case key,
bold-navy value, coral citation chip), and a sign-in unlock banner
pinned below the panes.

#### Scenario: F3 layout has PDF left, fields right

- **GIVEN** the user is on F3 (`/onboarding/:bucketId/:scenarioId` with extract-workbench step)
- **WHEN** the ExtractView renders
- **THEN** a `PdfViewerWidget` is in the left pane (`grid-template-columns: 1.2fr 1fr`, left column)
- **AND** the extracted-fields panel is in the right pane.

#### Scenario: F3 renders category tabs

- **GIVEN** the active schema has multiple categories (e.g. `statement` and `meters`)
- **WHEN** the ExtractView renders
- **THEN** a tabs row renders one tab per category with `{name} · {fieldCount}`
- **AND** clicking a tab switches the visible field list to that category.

#### Scenario: Field card carries canonical anatomy

- **GIVEN** a field with key `account_number`, value `1023456`, citation page 1
- **WHEN** its card renders in F3
- **THEN** the card shows the key as monospace `account_number` (not Title-case)
- **AND** the value `1023456` in bold navy
- **AND** a coral citation chip `[1] p.1` (not the cyan default).

#### Scenario: Topbar controls do not overlap

- **GIVEN** the F3a edit-schema topbar is rendered
- **WHEN** the layout settles
- **THEN** the `← back`, schema name, version chip, `export ▾`, `↻ rerun`, and `💾 Save` controls all have non-overlapping bounding rectangles
- **AND** all controls are individually focusable.

### Requirement: F4 SHALL render a Field provenance panel on field-card click

When a user clicks a field card in F3, the right pane SHALL swap from
the extracted-fields list to a `FieldProvenancePanel` containing
sections FIELD / SOURCE / WHY MATCHED / CONFIDENCE / NEIGHBORS. A
breadcrumb row `← all fields › {category} · #{n} › {fieldKey}` SHALL
appear above the panes with `▴ collapse` and `↗ open full doc` ghost
controls. The selected field's source region MUST be highlighted on
the PDF with a floating `match · {confidence}%` label.

#### Scenario: Click field → provenance panel + breadcrumb

- **GIVEN** the user is on F3 with the extracted-fields panel visible
- **WHEN** they click the `account_number` field card
- **THEN** the right pane swaps to a `FieldProvenancePanel` with the five named sections
- **AND** a breadcrumb appears: `← all fields › statement · account_number`
- **AND** the PDF viewer highlights the source region in green with a `match · 98%` floating label.

#### Scenario: ▴ collapse returns to F3

- **GIVEN** F4 is open
- **WHEN** the user clicks `▴ collapse`
- **THEN** the right pane reverts to the extracted-fields list
- **AND** the breadcrumb disappears
- **AND** the PDF region highlight clears.

### Requirement: F5 InteractView SHALL light citation regions on the PDF in chip-keyed colors

The PdfViewerWidget SHALL paint one lit region per `[N]` footnote marker in the assistant
reply, color-matched to the marker itself, on any surface that shows an assistant answer
beside a viewer (Interact and steady-mode chat alike — not a single frame; the "F5" in this
requirement's name is legacy). Region colors MUST follow the canonical mapping:
`[1]` green (primary), `[2]–[3]` cyan, anomaly / low-confidence citations coral. The `[N]`
footnote markers carry these index-keyed colors, and the `SourceList` page-chips for the same
citation reuse the same color — so the marker, its source-list chip, and its lit region read
as one consistent unit. This is the SINGLE canonical lit-region color rule, shared with the
`litRegions[]`-derivation requirement below.

#### Scenario: 4-citation answer paints 4 lit regions

- **GIVEN** the user asks a question producing an answer with citations `[1]` (page 1), `[2]` (page 1), `[3]` (pages 1–2), `[4]` (page 3, coral)
- **WHEN** the answer bubble renders
- **THEN** the PDF viewer paints 4 lit regions
- **AND** region 1 is green, regions 2 and 3 are cyan, region 4 is coral
- **AND** clicking a marker scrolls the PDF to its region

### Requirement: F5 InteractView SHALL paint litRegions on the canvas PDF from the latest assistant citations

The viewer canvas SHALL mount a `PdfViewerWidget` whose `litRegions[]` prop is derived from
the citations on the latest assistant turn, on any surface that shows an assistant answer
beside a viewer (Interact and steady-mode chat alike — not a single frame; the "F5" in this
requirement's name is legacy). The widget SHALL paint one region per citation, color-keyed by
the SAME canonical mapping as the markers — `[1]` green (primary), `[2]–[3]` cyan, anomaly /
low-confidence coral — so a citation's marker, its `SourceList` chip, and its lit region share
one color. This SUPERSEDES the earlier first/middle/last positional coloring, removing the
prior conflict between this requirement and the chip-keyed-colors requirement (the anomaly →
coral semantic rule wins, matching the `CiteChip` `color` prop).

#### Scenario: 4-citation answer paints 4 lit regions

- **GIVEN** the user is on an answer-beside-viewer surface and the latest assistant turn has 4 citations, the 4th low-confidence
- **WHEN** the canvas renders
- **THEN** the `PdfViewerWidget` mounts with `litRegions` of length 4
- **AND** region `[1]` is green, `[2]`–`[3]` are cyan, and the low-confidence `[4]` is coral

#### Scenario: Empty / no citations renders no overlay

- **GIVEN** the latest assistant turn has zero citations
- **WHEN** the canvas renders
- **THEN** the `PdfViewerWidget` renders with an empty `litRegions[]`
- **AND** no `pdf-viewer-lit-region-*` elements appear

### Requirement: F3 PDF viewer SHALL highlight the selected field's source region

The F3 ExtractView SHALL pass the selected field's first citation as `targetPage` + `highlightBbox` to the left-pane `PdfViewerWidget`, so the source region is visually cross-linked when the user clicks (or focus-pre-selects) a field card. When no field is selected, the viewer falls back to its uncontrolled default.

#### Scenario: Clicking a field card highlights its source page + bbox

- **GIVEN** the user is on F3 with the Utility scenario
- **WHEN** they click `field-row-amount_due`
- **THEN** the left-pane PdfViewerWidget renders with `targetPage` matching the field's first citation page
- **AND** the widget renders an element with testid `pdf-viewer-highlight` overlaying the citation bbox.

#### Scenario: No field selected leaves the viewer at its default

- **GIVEN** the user is on F3 with no field selected
- **WHEN** the viewer renders
- **THEN** no `pdf-viewer-highlight` overlay is in the document.

### Requirement: The chat scroll container SHALL reserve a scrollbar gutter

The ChatColumn message scroll container SHALL use `scrollbar-gutter: stable` plus
right padding so the vertical scrollbar reserves its own gutter instead of painting
over the message bubbles. This applies to both ChatColumn scroll containers (the
onboarding and steady variants).

#### Scenario: Scrollbar does not overlay chat bubbles

- **GIVEN** a chat conversation tall enough to scroll
- **WHEN** the chat column renders its scroll container
- **THEN** the container has `scrollbar-gutter: stable`
- **AND** message bubbles are not visually overlapped by the scrollbar.

### Requirement: The PDF SHALL be reachable in compact layout

In compact single-pane layout the onboarding canvas SHALL be reachable via the "View canvas" toggle, and when revealed it MUST mount at a non-zero width so the PdfViewerWidget on F2/F3/F5 renders at a usable size rather than crushed to a sliver.

#### Scenario: Compact "View canvas" reveals a usable PDF

- **GIVEN** the user is on F2 in compact layout (chat pane shown)
- **WHEN** they activate the "View canvas" toggle
- **THEN** the canvas pane mounts with `data-testid="appshell-canvas"`
- **AND** it contains a `pdf-viewer-widget`
- **AND** the canvas pane width is non-zero (the PDF renders at a usable size).

### Requirement: F5 Interact SHALL render live chat turns, not a seeded script

F5 InteractView SHALL render chat turns from the live chat session and SHALL NOT seed them from
`scenario.manifest.sampleChatScript`. The turns and their citations, and the `litRegions` derived
from the latest assistant turn, MUST reflect live chat replies. The manifest `chatSeeds` MAY remain
as starter-chip prompts that feed the real chat.

#### Scenario: F5 shows no seeded mock turn

- **GIVEN** F5 InteractView before the user has chatted
- **WHEN** it renders
- **THEN** it does not display the `sampleChatScript` mock turn (e.g. the "$9,418" demand line)
- **AND** any displayed turns come from the live chat session.

### Requirement: F3 Extract SHALL render live workflow schema and extract values

F3 SHALL render the extraction schema and field values from live GroundX, not the scenario
manifest. The schema MUST come from `getGroundXWorkflow(filter.workflow_id)` (resolved via
`getDocument`) and the values from `getGroundXDocumentExtract(documentId)`; `ExtractView`,
`SchemaView` (F3a), and the `ChatColumn` schema read MUST NOT read
`scenario.manifest.extractionSchema` or `sampleExtractionValues`. The overlay-merge and F3a save
flow MUST operate on the live schema.

#### Scenario: F3 shows real extracted values

- **GIVEN** the Utility sample doc with a `filter.workflow_id`
- **WHEN** F3 renders
- **THEN** the values come from `getGroundXDocumentExtract` (the real bill figures)
- **AND** no manifest `sampleExtractionValues` are displayed.

### Requirement: The document viewer SHALL NOT fetch an X-Ray for a placeholder id

The document viewer SHALL gate its X-Ray fetch on a real GroundX document UUID and SHALL NOT
request an X-Ray for a placeholder id such as `scenario:utility`. Until the active entity resolves
a real `documentId`, the viewer MUST show a neutral loading state rather than firing a doomed
request and flashing an error.

#### Scenario: No request for a placeholder id

- **GIVEN** a scenario opened before its real documentId resolves
- **WHEN** the viewer mounts
- **THEN** no `GET /v1/ingest/document/xray/scenario:*` request is issued
- **AND** a neutral loading state is shown until the real documentId is available.

### Requirement: Chat citations SHALL persist with bbox and rehydrate on refresh

Chat-reply citations SHALL be persisted with their geometry and rehydrated on refresh. The reply's
`citations` (documentId, page, and normalized `bbox`) MUST be written to
`chat_messages.citations_json` and projected on `GET /chat-sessions/:id/messages`, so reloading a
session restores the citation chips at the same geometry as the live reply rather than dropping
them.

#### Scenario: Citations rehydrate after refresh

- **GIVEN** a RAG reply whose citations carried a `bbox`
- **WHEN** the session is reloaded and its messages are fetched
- **THEN** the assistant message's `citations` include page + bbox
- **AND** the chips render at the same geometry as the live reply.

### Requirement: F2 pick-view pills SHALL derive categories from the live schema

The F2 "pick a view" category pills SHALL derive their categories from the live schema source, not
`scenario.manifest.extractionSchema`. After the manifest fixtures are stripped, the category pills
(e.g. Statement / Meters / Charges) MUST still render — sourced from the live workflow schema via a
shared slot the workbench populates — so the chat surface and the extract workbench agree on the
same categories.

#### Scenario: Pick-view pills survive the manifest strip

- **GIVEN** a scenario whose manifest no longer carries `extractionSchema`
- **WHEN** the F2 pick-a-view bubble renders
- **THEN** the category pills are derived from the live workflow schema
- **AND** they are not reduced to only the "interact" pill.

### Requirement: Onboarding frame views SHALL render live GroundX data, not manifest fixtures

The onboarding frame views SHALL render live GroundX data and SHALL NOT read scenario-manifest
data fixtures. Specifically, F2 UnderstandView sources page images from `getGroundXDocumentXray`,
F3 ExtractView sources the schema from `getGroundXWorkflow(filter.workflow_id)` and values from
`getGroundXDocumentExtract`, and F5 InteractView sources chat turns from the live chat router —
none of them read `scenario.manifest.extractionSchema`, `sampleExtractionValues`, or
`sampleChatScript`. Each view MUST mount the same production widget used in steady mode and pass a
`mode: "onboarding" | "steady"` prop that locks editing affordances in onboarding without forking
the data path. There SHALL be no `MOCK_MODE` runtime fallback for any of these views; deterministic
behavior in tests is supplied by fakes/fixtures INJECTED at the data seam, not by a `MOCK_MODE` env
flag (none exists).

#### Scenario: F3 extract reads the live workflow schema, not the manifest

- **GIVEN** the Utility sample doc with `filter.workflow_id` set
- **WHEN** F3 ExtractView renders
- **THEN** the schema comes from `getGroundXWorkflow(filter.workflow_id)` and values from
  `getGroundXDocumentExtract(documentId)`
- **AND** no `scenario.manifest.extractionSchema` / `sampleExtractionValues` read remains.

#### Scenario: F5 chat citations come from the live router

- **GIVEN** F5 InteractView
- **WHEN** the displayed turns + their citations are assembled
- **THEN** they come from live chat replies (real `documentId` + `bbox`), not
  `scenario.manifest.sampleChatScript`
- **AND** the `litRegions` painted on the PDF derive from those live citations.

#### Scenario: No MOCK_MODE fallback path exists for the onboarding frame views

- **GIVEN** the onboarding frame views in any environment
- **WHEN** GroundX data is fetched
- **THEN** the data comes from the real GroundX clients (or a test-injected fake at the seam)
- **AND** there is no `MOCK_MODE` env-driven fallback path.

### Requirement: Steady-mode canvas SHALL mount live production widgets, not a placeholder

The Steady-mode canvas SHALL mount the live production widgets for the active session document and
SHALL NOT render a placeholder when a document is active. It MUST reuse the same
`PdfViewerWidget` / Extract / ChatWithSources path as onboarding, keyed off the steady session's
`documentId` and `ContentScope`, with `mode="steady"` so the onboarding locks are released. A
"no document selected" empty state MAY remain only when there is genuinely no active document.

#### Scenario: Active steady document renders the live viewer

- **GIVEN** a signed-in steady session with an active document
- **WHEN** the steady shell renders its canvas
- **THEN** the live `PdfViewerWidget` (fed by `getDocumentXray`) is mounted with `mode="steady"`
- **AND** the `steady-shell-canvas-placeholder` is not present.

### Requirement: Extract-field source highlight SHALL resolve geometry from X-Ray

The middleware extract path SHALL resolve each field's source geometry from the document's
X-Ray before serving it to F3/F4, because `document_getextract` returns field values only and
carries no page or bounding box. For each field the resolver SHALL normalize the value (strip
currency, commas, and formatting), match it against the X-Ray `chunks[].text` /
`suggestedText` using the field label as a secondary signal, lift the matched chunk's
`boundingBoxes`, and normalize them by the page's `width`/`height` into a 0-1 `{x,y,w,h}` bbox
plus the page number. The enriched field SHALL carry `citations: [{ documentId, page, bbox }]`;
when no chunk matches, the field SHALL ship with empty citations and the F4 source highlight
degrades to none. Resolution MUST be best-effort and reuse the per-document X-Ray cache from
WF-03; a resolver error MUST NOT fail the extract response. An OPTIONAL word-level precision
pass MAY first match the value against atoms in the `-118-map.json` OCR map for a tighter box,
but it MUST fall back to the chunk-envelope on any miss or schema change (the MAP is an
unsupported intermediate; X-Ray is the production-stable source).

#### Scenario: Field value resolves to a source region

- **GIVEN** an extracted field `amount_due = 7613.2` and an X-Ray chunk containing `"$7,613.20"`
  whose box is `(170,220)-(1530,300)` on a 1700×2200 page
- **WHEN** the extract path serves the field to F4
- **THEN** the field carries `citations: [{ documentId, page: <chunk page>, bbox: {...0-1...} }]`
- **AND** clicking the field card highlights that region on the PDF.

#### Scenario: Unmatched field ships without geometry

- **GIVEN** an extracted field whose normalized value matches no X-Ray chunk
- **WHEN** the extract path serves the field
- **THEN** the field carries empty `citations`
- **AND** the extract response still succeeds (no thrown error)
- **AND** the F4 source highlight is absent for that field.

### Requirement: The chat answer SHALL render claim segments whose highlight precision matches the citation tier

The ChatColumn SHALL render each cited claim in an assistant answer with an inline `[N]`
footnote marker (`CiteChip variant="footnote"`), and that marker SHALL be the affordance for
the claim: on hover or click of the marker, the ChatColumn SHALL highlight the claim's source
region at the precision of its citation `tier`. An `exact`-tier claim SHALL drive a tight
(word-level) `pdf-viewer-highlight`; a `paraphrase`-tier claim SHALL drive a chunk-region
overlay rendered with a distinct, lower-confidence (translucent) visual; an `ambient`-tier
claim SHALL drive the marker / source affordance only, with no inline span highlight. The
`highlightCitation` dispatch SHALL remain the path for ambient sources, so the floor behavior
is unchanged when no tier resolves above ambient. (The `exact` tier may be dormant until the
middleware emits it — the render MUST handle all three tiers regardless.) There SHALL be ONE
claim-interaction model: the footnote marker IS the tiered claim's affordance, not a second
parallel mechanism.

SCOPE: this change wires the marker as the affordance and renders the `ambient` floor (the
existing `highlightCitation` path that ships today); the `exact` (word-level) and
`paraphrase` (chunk-region) viewer-overlay precisions are handled-but-dormant pending the
middleware emitting those tiers. No NEW word-level/chunk overlay rendering is built here
beyond what already exists — only the unified marker → tiered-dispatch wiring.

#### Scenario: Tier drives highlight precision via the claim's marker

- **GIVEN** an assistant answer whose claims carry citations tiered `exact`, `paraphrase`, and `ambient`
- **WHEN** the user hovers or clicks each claim's `[N]` marker in turn
- **THEN** the `exact` claim lights a tight word-level highlight on the cited page
- **AND** the `paraphrase` claim lights the chunk-region overlay in the translucent style
- **AND** the `ambient` claim drives only its marker / source affordance with no inline highlight

### Requirement: The sign-in gate SHALL be a delayed chat moment with three doors

The onboarding sign-in gate (F6) SHALL render in the chat rail as an assistant message that
appears with a delayed / staggered reveal (a "thinking" beat, then the message), like a live
AI turn — not an instant mount and not a modal. The message SHALL offer all three wireframe
doors: an **email "send magic link"** action, an **SSO** action that dispatches
`commitGate({ method: "sso" })`, and a **book-a-call** action. Under
`prefers-reduced-motion: reduce` the reveal SHALL degrade to a crossfade. While the gate is
shown the onboarding step strip SHALL be on **Understand**.

#### Scenario: Gate streams in as a chat message with three doors

- **GIVEN** the gate is triggered (Save / Export / metered ceiling)
- **WHEN** the chat surface updates
- **THEN** after a short delay an assistant gate message reveals (it is not present on the same tick the gate fires)
- **AND** the message offers an email "send magic link" action, an SSO action dispatching `commitGate({ method: "sso" })`, and a book-a-call action
- **AND** the onboarding step strip is on "Understand"
- **AND** no modal dialog is used — the canvas stays visible behind the chat.

### Requirement: The gate canvas SHALL pitch the GroundX value proposition

On the gate screen the canvas (right pane) SHALL render a styled GroundX value-proposition
surface — a headline plus supporting points drawn from product messaging — instead of the
account-creation form (account creation moves to the chat doors). Styling SHALL use design
tokens only (no style literals; honors the drift guard).

#### Scenario: Value-prop pane replaces the form in the canvas

- **GIVEN** the gate screen is shown
- **WHEN** the canvas renders
- **THEN** a value-proposition pitch surface is present (headline + supporting points)
- **AND** no create-account form fields render in the canvas.

### Requirement: Sample selection SHALL stream the parse on Understand before advancing to Extract

Selecting a sample SHALL transition to the **Understand** frame (step strip on Understand),
where the parse status lines SHALL stream in **staggered** (one at a time, with delays), like
an AI emitting reasoning status. The step strip SHALL remain on Understand for the duration of
the stream, then **auto-advance to Extract**, where the canvas SHALL render the extract
workbench (PDF on the left, the Statement / Meters / Charges fields panel on the right). The
flow SHALL NOT jump directly to Interact on sample selection.

#### Scenario: Pick a sample → staggered Understand → Extract

- **GIVEN** the F1 picker with the Utility sample
- **WHEN** the user opens the sample
- **THEN** the frame becomes Understand with the step strip on Understand
- **AND** the parse status lines appear progressively (the rendered count grows across ticks), not all at once
- **AND** when the stream completes the step strip advances to Extract
- **AND** the Extract canvas shows the PDF viewer plus the Statement / Meters / Charges fields panel.

### Requirement: An Interact message SHALL light citation regions on the canvas PDF

In F5 Interact, sending a citation-bearing question SHALL produce an assistant turn whose
citations light region(s) on the canvas PDF for the cited page, resolving real source geometry
(X-Ray join for the extract-indexed sample), not only a fallback band. The canonical trigger
question is "What is the total amount due on this bill?". The F5 canvas SHALL render only the
source document viewer — no second chat transcript, input, or Save control (the shell
`ChatColumn` is the single chat surface). Citation snippets SHALL be human-readable, never raw
extract JSON, and every cited turn SHALL carry answer prose.

#### Scenario: Trigger message highlights the cited region

- **GIVEN** the Utility sample on F5 Interact
- **WHEN** the user asks "What is the total amount due on this bill?"
- **THEN** the answer renders prose plus citation chips
- **AND** the cited region is lit on the canvas PDF for the cited page
- **AND** each citation snippet is human-readable (not raw extract JSON)
- **AND** the canvas contains no second chat input or Save control.

### Requirement: Both shells SHALL host one shared `AppShell` main view

Each per-context shell SHALL host the same main view — `AppShell` with a `nav` slot, a `chat` slot
(`ConversationFlow` + the active `ChatExperience`), and a `canvas` slot (the experience/scope-driven
viewer). The shells themselves MAY differ (chrome, nav, entry points) and SHALL NOT be collapsed, but
neither shell SHALL re-implement the chat or canvas surface. The onboarding shell SHALL mount `AppShell`
(as it already does) and SHALL NOT carry a per-frame `canvasContent` canvas switch; its canvas slot SHALL
be the shared scope-driven viewer, exactly as the steady shell does.

#### Scenario: Onboarding and steady mount the same view assembly

- **GIVEN** the onboarding shell and the steady shell
- **WHEN** each renders its main view
- **THEN** both mount `AppShell` with `chat` = `ConversationFlow` and `canvas` = the scope-driven viewer
- **AND** the onboarding shell has no bespoke per-frame `canvasContent` switch
- **AND** the shells still differ only in chrome / nav / entry points (they are not collapsed).

### Requirement: The canvas SHALL be experience/scope-driven, not a per-frame view switch

The canvas slot SHALL select which `ScopedViewerWidget` to mount from the active viewer step kind and
SHALL feed it the active experience's `ContentScope` (and `documentId` where applicable), not from the
onboarding frame. The standalone per-frame views (`UnderstandView` / `ExtractView` / `InteractView` /
`IntegrateView`) SHALL be removed or reduced to thin wrappers with no `scenario.manifest` data reads.

#### Scenario: Frame advance changes the viewer step, not the canvas implementation

- **GIVEN** an onboarding session whose viewer step advances (e.g. doc-viewer → extract-workbench)
- **WHEN** the canvas re-renders
- **THEN** the same scope-driven canvas selector mounts the matching `ScopedViewerWidget` fed real data
- **AND** no standalone per-frame view is mounted
- **AND** no remaining code in `views/Onboarding/` reads `scenario.manifest.extractionSchema` / `sampleExtractionValues`.

### Requirement: The onboarding entry SHALL compose a `ChatExperience`; the gate remains a widget

The onboarding entry (the full-screen overlay / picker) SHALL select behavior by composing a
`ChatExperience` (`makeOnboardingExperience(...)`) and passing it to the shared view — not by branching
the shell on a frame to choose a view. The signup gate SHALL remain a widget (`SignUpWidget` /
`GateChatPanel` / `GateValueProp`, anonymous-only) shown by the onboarding surface, NOT a chat experience.

#### Scenario: Entry composes the experience; gate is a widget

- **GIVEN** the onboarding journey is active
- **WHEN** the shell mounts the main view
- **THEN** it composes `makeOnboardingExperience(...)` and passes it to `ConversationFlow`
- **AND** the gate, when active, is shown via its widgets, not as a `ChatExperience`
- **AND** the shell does not pick a canvas view by a `session.currentFrame` value (it selects from the active viewer step kind).

### Requirement: The steady ScopedConversationShell SHALL mount viewer widgets via the shared ScopedCanvas path

`ScopedConversationShell` SHALL render `<ScopedCanvas>` in its canvas slot, fed
by the active `ViewerStep` plus the shell's `scope` and `role` — the SAME shared
mount path `OnboardingShell` uses — so that orchestrator-pushed viewer steps
mount the production `PdfViewer` / `Extract` / `SmartReport` / `Integrate`
widgets on real data. The steady canvas slot MUST NOT be a static placeholder
that ignores the active viewer step, and MUST NOT import a viewer widget
directly. When no viewer step is active, the slot SHALL render `ScopedCanvas`'s
idle state, not an empty box.

For the `/projects` route, the shell's base scope SHALL be the workspace bucket
plus `filter.projectId` from the active project/scenario. It SHALL NOT use
`filter.project`.

#### Scenario: Project route scopes by projectId

- **GIVEN** the scenario registry is ready and the first scenario has
  `projectId:"proj_utility"`
- **WHEN** `/projects` mounts the scoped conversation shell
- **THEN** the active chat session scope key contains
  `"projectId":"proj_utility"`
- **AND** it does not contain `"project":"utility"`.

#### Scenario: Citation chip click mounts the PdfViewer in the steady canvas

- **GIVEN** the steady shell is mounted with a workspace scope and an assistant
  turn that carries citations
- **WHEN** the user clicks a `CiteChip` (dispatching `highlightCitation` to the
  `CanvasOrchestrator`)
- **THEN** `scoped-shell-canvas-pane` contains a `pdf-viewer-widget` element
  mounted by `ScopedCanvas` for the cited document/page
- **AND** the widget renders at non-zero width and height.

### Requirement: Signed-in OnboardingWizard SHALL use GroundX Studio onboarding content

The signed-in `OnboardingWizard` SHALL orient first-time authenticated users to
GroundX Studio capabilities, not starter-app scaffold mechanics. Its default
steps SHALL map to the F-series product journey: Ingest, Understand, Extract,
Interact/Report, and Integrate. The wizard MAY cite source frames such as F1,
F2, F3/F3a, F5/F6, and F7, and MAY link to the canonical `/onboarding` sandbox,
but it SHALL NOT introduce a second onboarding state machine.

Source of truth: `openspec/wireframes/source/spec-nav-v2.jsx` for F1/F7 and the
step strip, plus `openspec/wireframes/source/spec-flow.jsx` for the F3/F3a/F5
capability path.

#### Scenario: First-time signed-in user sees product-real onboarding

- **GIVEN** a signed-in user whose app metadata does not include
  `onboardingState: "complete"`
- **WHEN** the signed-in `OnboardingWizard` opens
- **THEN** it renders GroundX Studio capability copy for the product journey
- **AND** it offers a user-driven link to `/onboarding`
- **AND** it does not render generic scaffold instructions such as replacing a
  starter Home page.

#### Scenario: Completion still uses the existing metadata state

- **GIVEN** the signed-in `OnboardingWizard` is on its final step
- **WHEN** the user clicks `Finish`
- **THEN** the app persists `{ onboardingState: "complete" }`
- **AND** the wizard closes without mutating anonymous F-series onboarding
  session state.

### Requirement: Authenticated OnboardingWizard SHALL be reachable across signed-in product routes

The signed-in `OnboardingWizard` SHALL be mounted so first-time authenticated
users whose app metadata does not include `onboardingState: "complete"` can see
it on signed-in product surfaces, not only on `/home`. Public `/onboarding`
SHALL remain route-owned and SHALL NOT perform an anonymous auth probe on cold
loads; it MAY show the signed-in wizard only when auth state is already hydrated
by in-app navigation. The wizard SHALL remain gated by `auth.isLoggedIn`, a
loaded user, and incomplete onboarding metadata. Anonymous users SHALL NOT see
this signed-in wizard.

#### Scenario: First-time signed-in user sees the wizard on product routes

- **GIVEN** a signed-in user whose app metadata does not include
  `onboardingState: "complete"`
- **WHEN** the user opens `/projects`, `/workspaces`, or `/c/:sessionId`
- **THEN** the signed-in `OnboardingWizard` opens
- **AND** the page remains on the requested route.

#### Scenario: Public onboarding stays anonymous on cold loads

- **GIVEN** a user opens `/onboarding` without a hydrated authenticated app
  state
- **WHEN** the public onboarding sandbox renders
- **THEN** the app does not redirect to `/auth/login`
- **AND** the signed-in `OnboardingWizard` is not shown
- **AND** the route does not perform an `/api/auth/me` probe.

#### Scenario: Completed or anonymous users do not see the signed-in wizard

- **GIVEN** a user is anonymous, or signed-in with `onboardingState: "complete"`
- **WHEN** the user opens any product route
- **THEN** the signed-in `OnboardingWizard` is not shown.

### Requirement: Authenticated OnboardingWizard SHALL explain the signed-in Studio experience

The signed-in `OnboardingWizard` SHALL orient first-time authenticated users to
what they can do inside authenticated GroundX Studio using product judgment,
because the post-signup experience is not mocked in the wireframes. Its default
steps SHALL mention existing authenticated surfaces and capabilities, including
saved conversations or current sessions, Workspaces, Projects, the canonical
onboarding sandbox, grounded extraction/report/chat outputs, and Integrate/API
or plugin handoff. It SHALL NOT claim to implement a wireframed post-signup
workspace setup flow.

#### Scenario: Wizard copy describes authenticated destinations

- **GIVEN** the signed-in `OnboardingWizard` opens for a first-time authenticated
  user
- **WHEN** the user reads the default steps
- **THEN** the wizard names existing authenticated Studio destinations such as
  Workspaces, Projects, saved sessions, the onboarding sandbox, and Integrate
- **AND** it does not render generic scaffold instructions
- **AND** it does not reference a mocked post-signup workspace setup flow.

#### Scenario: Completion remains app metadata only

- **GIVEN** the signed-in `OnboardingWizard` is on its final step
- **WHEN** the user clicks `Finish`
- **THEN** the app persists `{ onboardingState: "complete" }`
- **AND** the wizard closes without mutating anonymous F-series onboarding
  session state.

### Requirement: F1 sign-up SHALL transition into the chat/viewer product surface

The F1 onboarding view SHALL remain full-bleed at `/onboarding`. When the user
clicks **Sign up** or lands on `/onboarding/signup`, the UI SHALL reveal the
standard AppShell split with the normal chat timeline and the sign-in viewer
overlay. This transition SHALL NOT mint a sample entity or a new chat session.

The sign-in viewer surface SHALL expose stable accessible controls and test
handles for its live actions: `sign-up-viewer-surface`,
`sign-up-viewer-close`, `sign-up-viewer-book-call`, and
`sign-up-viewer-continue-integrate` when the continue action is visible.

#### Scenario: F1 sign-up reveals chat and viewer

- **GIVEN** the user is on `/onboarding`
- **WHEN** the user clicks **Sign up**
- **THEN** the app navigates to `/onboarding/signup`
- **AND** the chat column is visible
- **AND** the viewer pane shows the sign-in surface
- **AND** the sign-in surface exposes **Back to samples**
- **AND** the F1 picker is no longer the full-screen foreground overlay.

#### Scenario: Closing sign-in from F1 returns to samples

- **GIVEN** the user entered sign-in from F1 with no active sample
- **WHEN** the user activates **Back to samples**
- **THEN** the app navigates to `/onboarding`
- **AND** the full-bleed F1 picker returns
- **AND** the chat session remains available for the next entry.

#### Scenario: Closing sign-in from a sample returns to the active viewer

- **GIVEN** the user opened sign-in from an active sample viewer
- **WHEN** the user activates **Close sign-in**
- **THEN** the sign-in overlay is popped
- **AND** the active sample viewer step remains visible
- **AND** the chat timeline remains mounted.

#### Scenario: Compact widths keep sign-in usable

- **GIVEN** the viewport is phone or compact tablet width
- **WHEN** sign-in opens
- **THEN** the viewer/sign-in surface is foregrounded
- **AND** a clear control lets the user return to chat
- **AND** no text, form controls, or close actions overlap.

### Requirement: Authenticated product viewer surfaces SHALL use the shared viewer frame

Authenticated product routes SHALL be treated as the base experience.
`/workspaces`, `/projects`, and `/c/:sessionId` SHALL preserve the canonical
product shell and SHALL render registry-mounted viewer content through the
shared viewer frame whenever the active viewer step resolves to a built viewer
widget.

The frame SHALL NOT rely on anonymous onboarding state. Viewer-frame labels,
close/back actions, gutters, loading/status bands, and content modes SHALL be
consistent with the same contract used by onboarding viewer overlays.

Authenticated product-route proof SHALL activate a `ViewerStep` that resolves to
a built `CanvasKind`. Rendering only the default `ingest-picker` state or the
`scoped-canvas-unavailable` placeholder SHALL NOT satisfy this requirement.

#### Scenario: Workspace and project viewer content use shared chrome

- **GIVEN** a signed-in user with onboarding complete opens `/workspaces` or
  `/projects`
- **WHEN** a viewer step resolves to a built registry-mounted viewer widget
- **THEN** the product route remains mounted
- **AND** one normal chat timeline remains present
- **AND** the viewer widget appears inside the shared viewer frame
- **AND** no anonymous sign-up overlay or widget-local close/header chrome is
  visible.
- **AND** the assertion names the built `CanvasKind` under test.

#### Scenario: Steady session viewer content uses shared chrome

- **GIVEN** a signed-in user with onboarding complete opens `/c/:sessionId`
- **WHEN** a citation or active viewer step resolves to document viewer content
- **THEN** `SteadyShell` keeps the route and chat session active
- **AND** the document viewer appears inside the shared viewer frame
- **AND** the frame content mode preserves document/canvas affordances without
  duplicating top-level close/back chrome.
- **AND** the assertion is driven by a real `doc-viewer` viewer step or
  citation/tool path, not by a static placeholder.

#### Scenario: Signed-in onboarding wizard decorates the product route

- **GIVEN** a signed-in user with incomplete onboarding state opens
  `/workspaces`, `/projects`, or `/c/:sessionId`
- **WHEN** the signed-in onboarding wizard opens
- **THEN** the current product route pathname remains unchanged
- **AND** the product shell is not replaced by a second AppShell/chat/viewer
  hierarchy
- **AND** the wizard is treated as a product overlay, not as anonymous sign-up
  viewer content.

#### Scenario: Anonymous product route users do not receive signed-in onboarding

- **GIVEN** an anonymous user opens `/workspaces`, `/projects`, or
  `/c/:sessionId`
- **WHEN** auth routing resolves
- **THEN** the existing auth gate or redirect behavior applies
- **AND** the signed-in onboarding wizard is not visible
- **AND** onboarding viewer overlays are not mounted inside the product route.

### Requirement: Blocking onboarding viewer overlays SHALL use the shared viewer frame

Blocking onboarding viewer overlays, including sign-in and book-call, SHALL use
the shared viewer frame for their visible chrome. Overlay-specific content MAY
differ, but close/back placement, accessible name rhythm, pane gutters, loading
band placement, and scroll behavior SHALL be consistent across overlays.

The chat column SHALL remain the normal `ConversationFlow`; changing the viewer
frame SHALL NOT create a parallel chat surface.

The frame SHALL expose a labelled `region` by default. It SHALL NOT trap focus
away from chat unless a future modal policy is explicitly specified and tested.
Blocking overlay underlays remain inert at the viewer-stack level; the active
foreground frame remains keyboard reachable through the normal AppShell focus
model.

#### Scenario: Sign-in opens with standard viewer chrome

- **GIVEN** the user opens sign-in from F1 or from an active sample
- **WHEN** the sign-in overlay renders
- **THEN** the active viewer contains one shared viewer frame
- **AND** the frame close/back action uses contextual copy
- **AND** the sign-up form appears as frame content, not as a separate
  self-framed page
- **AND** the frame is labelled by the visible sign-in title or an equivalent
  accessible label
- **AND** the normal chat timeline remains reachable through compact shell
  controls.

#### Scenario: Book-call opens with standard viewer chrome

- **GIVEN** the user opens book-call from nav, chat intent, or sign-in
- **WHEN** the booking overlay renders
- **THEN** the active viewer contains one shared viewer frame
- **AND** the Calendly content uses the frame embed body
- **AND** the frame loading/status band appears while the embed is
  `initializing` or `embedding`
- **AND** the loading/status band clears when the embed reaches `ready`
- **AND** an error/status band replaces loading when the embed reaches `error`
- **AND** no loading indicator is absolutely positioned over the loaded
  Calendly widget.

#### Scenario: Booking opened from sign-in activates only the booking frame

- **GIVEN** sign-in is open from F1 or an active sample
- **WHEN** the user activates the sign-in content action to book a call
- **THEN** the sign-in frame remains mounted only as an inert underlay
- **AND** the book-call frame is the only active foreground frame
- **AND** closing book-call returns focus to the sign-in frame unless booking
  commits the gate.

#### Scenario: Compact layouts preserve the same chrome contract

- **GIVEN** the viewport is tablet or mobile width
- **WHEN** sign-in or book-call opens
- **THEN** the viewer frame remains the chrome owner
- **AND** the chat remains reachable through compact shell controls
- **AND** no widget-local close/header appears only at that breakpoint
- **AND** the active frame body has non-zero rendered width and height
- **AND** the page has no horizontal document overflow
- **AND** the close/back accessible name is not clipped or hidden.

### Requirement: Citation rendering SHALL use shared inline-marker + source-list components on every surface

The inline-marker (`CiteChip` `variant="footnote"`) and the grouped `SourceList` SHALL be
the citation presentation on EVERY surface that renders citations app-wide — chat answers,
extract field rows (the Extract widget wherever it mounts, onboarding and authenticated
alike), and report sections — with no surface-specific or frame-specific fork. Citation
numbering SHALL be local to each rendering unit (per answer / per field row / per section),
matching how `citations[]` is already scoped to that unit. The `SourceList` SHALL label each
document group by the citation's `fileName` (GroundX's display name), falling back to
`documentId` only when `fileName` is absent. Surfaces whose unit carries a
single citation SHALL render the inline marker plus a one-line source without collapse
chrome.

#### Scenario: Extract field row renders the shared citation components

- **GIVEN** an extract field row whose value carries one citation
- **WHEN** the row renders on any surface that mounts the Extract widget
- **THEN** it uses the same inline `CiteChip` footnote variant as chat (no Extract-specific chip)
- **AND** clicking it routes to the cited region exactly as the chat marker does

#### Scenario: Report section renders the shared citation components

- **GIVEN** a report section whose prose carries multiple citations
- **WHEN** the section renders
- **THEN** it uses the same inline markers + grouped `SourceList` as chat (no report-specific fork)

### Requirement: The step strip and jump-ahead gating SHALL read journey progress, not frames

The onboarding step strip and the jump-ahead guard SHALL derive their current
stage, completion marks, and gating from the explicit journey-progress state, not
from any frame value and not from the viewer step history. The strip covers Ingest,
Understand, Analyze (with Extract, Interact, and Report sub-steps), and Integrate. A
step-strip pill click SHALL change the canvas by dispatching the corresponding
navigation intent through the orchestrator, never by calling a frame action.

#### Scenario: Clicking a step-strip pill dispatches an intent

- **GIVEN** the onboarding step strip
- **WHEN** the user clicks the Report sub-step
- **THEN** the canvas changes via a dispatched `showReport` intent
- **AND** the step strip's reached/gating state comes from journey progress

### Requirement: The Understand auto-advance SHALL go through dispatch

When the Understand "reading the document" animation finishes, the canvas SHALL
advance to Extract by dispatching the `showExtract` intent through the orchestrator
(the same path every other trigger uses), not by a direct frame or step mutation.
This auto-advance behavior is retained.

#### Scenario: Auto-advance on done dispatches showExtract

- **GIVEN** the Understand scan animation completes on first arrival
- **THEN** a `showExtract` intent is dispatched
- **AND** the canvas shows the extract-workbench step

### Requirement: The onboarding pick-a-view pills SHALL dispatch showExtract directly

The onboarding "Pick a view" pills SHALL remain per-schema-category in onboarding
(a curated, small, known schema) and SHALL remain the existing `PickViewPill`
component, dispatching a `showExtract` intent carrying that category as
`focusedCategoryId` directly through the orchestrator. They SHALL NOT route through
the suggested-action rendering path. A pill SHALL work from any current view (it
names its full destination), and SHALL re-focus the live Extract view when Extract
is already shown.

#### Scenario: A pick-a-view pill works from another view

- **GIVEN** the canvas currently shows the Report view and the chat shows the pick-a-view pills
- **WHEN** the user clicks the "Meters" pill
- **THEN** a `showExtract` intent with `focusedCategoryId` Meters is dispatched
- **AND** the canvas switches to Extract focused on Meters

#### Scenario: Re-focusing within Extract is live

- **GIVEN** the canvas shows Extract focused on Statement
- **WHEN** the user clicks the "Charges" pill
- **THEN** Extract re-focuses to Charges without a remount

