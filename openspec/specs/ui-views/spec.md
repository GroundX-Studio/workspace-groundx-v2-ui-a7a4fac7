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

Citation chips SHALL be clickable on EVERY chat surface that renders
assistant turns (F2 onboarding chat, F5 InteractView, steady-mode
chat, AND F3/F3a/F4 ExtractView field rows) — not just F5. Clicking
a chip SHALL switch the viewer pane to the cited document (if not
already active), navigate the viewer to the cited page, and render
a region highlight overlay scoped to the cited bbox. There is no
separate side-panel widget — the existing viewer pane in
`OnboardingShell` / `SteadyShell` IS the destination.

#### Scenario: Click a citation chip from chat (any surface)

- **GIVEN** an assistant turn carrying a citation `{documentId: D, page: 7, bbox: {...}}`
- **WHEN** the user clicks the `[1]` chip
- **THEN** the viewer pane shows document `D`
- **AND** the page image renders page 7
- **AND** a highlight overlay covers the cited region (best-effort if bbox is absent → page-level highlight only)
- **AND** the `cite.peeked` telemetry event still fires with the same payload

#### Scenario: Click a citation chip while viewer already shows the doc

- **GIVEN** the viewer already shows document `D` on page 3
- **WHEN** the user clicks a chip pointing at `D` page 7
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

Each F-series transition SHALL push a corresponding `ViewerStep` onto `viewer.history` carrying the surface's cross-navigation state in its payload. F1 → ingest-picker (with optional `attachedSchema` annotation); F2 → doc-viewer(documentId); F3/F3a/F4 → extract-workbench(scenarioId, focusedCategoryId?); F5/F6 → interact-chat(scenarioId); F7 → integrate.

`OnboardingShell.canvasContent` SHALL switch on `currentStep.kind` to select which surface to render. Surfaces SHALL read scenario / category / document props from the step's payload — NOT from a top-level `currentFrame` slot. The legacy `currentFrame` is preserved as a derived getter on `useOnboardingSession().state` for backwards-compat with StepStrip + step-pill click handlers; new code MUST NOT depend on it for surface selection.

#### Scenario: currentStep.kind drives canvas rendering

- **GIVEN** the active session's `viewer.currentStep` points at `{ kind: "extract-workbench", scenarioId: "utility", focusedCategoryId: "meters" }`
- **WHEN** `OnboardingShell` renders
- **THEN** `<ExtractView />` mounts with scenario + focused-category props read from the step payload
- **AND** no read of `session.currentFrame` is on the render hot path

#### Scenario: F1 banner reads attachment from the viewer step

- **GIVEN** the latest viewer step is `{ kind: "ingest-picker", attachedSchema: { schemaId: "es-1", name: "Utility (custom)" } }`
- **WHEN** `IngestView` renders
- **THEN** the `ingest-pre-attached-schema` banner renders showing the schemaId
- **AND** no read of `session.preAttachedSchemaId` exists

### Requirement: ChatColumn SHALL render citation chips beneath every assistant bubble

`ChatColumn` SHALL render a row of `<CiteChip>` components beneath
each assistant `BotBubble` whose backing `LiveTurn` carries a
non-empty `citations` array, on BOTH the `F2ConversationFlow`
(onboarding) and `SteadyConversationFlow` (steady-mode) branches.
The chip indices SHALL be 1-based and match the order returned by
the chat router. The same `CiteChip` component is used on every
surface (no per-surface fork).

#### Scenario: Assistant reply with two citations

- **GIVEN** a steady-mode chat send returns `{ answer: "...", citations: [c1, c2] }`
- **WHEN** the reply renders
- **THEN** the bubble has two chips labeled `[1]` and `[2]`
- **AND** each chip exposes `data-citation-doc` + `data-citation-page` for downstream wiring

### Requirement: Citation chips SHALL survive a refresh

Assistant turns SHALL carry their citation chips after a page refresh
just as they did at first render. The hydrate path (`GET
/api/chat-sessions/:id/messages`, RT-01) SHALL parse the persisted
`citations_json` per row and project it through the API helper into
`PersistedChatMessage.citations`, which then feeds `LiveTurn.citations`
in `ChatColumn`. No citation data SHALL be dropped between insert
and rehydrate.

#### Scenario: Refresh re-renders chips

- **GIVEN** the user sent a chat turn that produced two citations
- **WHEN** the user refreshes the browser
- **THEN** the same two `[1]` `[2]` chips render beneath the bot bubble
- **AND** clicking either still routes to the viewer

### Requirement: F1 IngestView SHALL render full-bleed without app chrome

The F1 IngestView SHALL be rendered with no sidebar nav AND no chat
pane. The AppShell MUST expose a `chrome="bare"` mode that
`OnboardingShell` activates when `session.currentFrame === "f1"`.
The IngestView occupies the full viewport width minus standard page
gutters; sidebar + chat slide back in during the F1→F2 transition
animation per `openspec/wireframes/source/spec-nav-v2.jsx`.

#### Scenario: F1 hides sidebar and chat

- **GIVEN** the user is on `/onboarding` (no scenario picked) and the
  current frame is `f1`
- **WHEN** the OnboardingShell renders
- **THEN** no element with `aria-label="Primary navigation"` is in the document
- **AND** no element with `aria-label="Chat pane"` is in the document
- **AND** the IngestView fills the viewport.

#### Scenario: F1→F2 transition restores chrome

- **GIVEN** the user clicks a sample tile on F1
- **WHEN** the frame transitions to `f2`
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

While `session.currentFrame === "f2"`, the canvas SHALL render the
`PdfViewerWidget` (centered, max-width ~560px, aspect 8.5/11) with the
scan-line animation overlaid, and the thinking-stream notes MUST render
in the chat column — NOT in the canvas. The step strip SHALL remain on
`Understand` (active green) for the entire F2 phase; it advances to
`Extract` only when the chat emits the `Done. … Ready to analyze.`
bubble.

#### Scenario: F2 canvas shows PDF + scan, chat shows thinking notes

- **GIVEN** the user has just clicked the Utility sample tile
- **WHEN** the F2 frame settles
- **THEN** the canvas contains a `PdfViewerWidget` element
- **AND** a scan-line animation is running over the PDF
- **AND** the thinking notes (`parsing layout · page 1` …) render inside the chat column, not the canvas
- **AND** the step strip's active step is `Understand` (not `Extract`).

#### Scenario: Step strip advances on Done bubble

- **GIVEN** the F2 thinking stream is playing
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

The F5 PdfViewerWidget SHALL paint one lit region per `[N]` CiteChip in the assistant reply, color-matched to the chip itself. Region colors MUST
follow the canonical mapping: `[1]` green (primary), `[2]–[3]` cyan,
anomaly / low-confidence citations coral.

#### Scenario: 4-citation answer paints 4 lit regions

- **GIVEN** the user asks an F5 question producing an answer with citations `[1]` (page 1), `[2]` (page 1), `[3]` (pages 1–2), `[4]` (page 3, coral)
- **WHEN** the answer bubble renders
- **THEN** the PDF viewer paints 4 lit regions
- **AND** region 1 is green, regions 2 and 3 are cyan, region 4 is coral
- **AND** clicking a chip scrolls the PDF to its region.

### Requirement: F5 InteractView SHALL paint litRegions on the canvas PDF from the latest assistant citations

The F5 InteractView canvas SHALL mount a `PdfViewerWidget` whose `litRegions[]` prop is derived from the citations on the latest assistant turn. The widget SHALL paint one region per citation, color-keyed: first citation green (primary), middle citations cyan, last citation coral (anomaly / contrast).

#### Scenario: 4-citation answer paints 4 lit regions

- **GIVEN** the user is on F5 and the latest assistant turn has 4 citations
- **WHEN** the canvas renders
- **THEN** the PdfViewerWidget mounts with `litRegions` of length 4
- **AND** the first region's color is `green`
- **AND** the last region's color is `coral`
- **AND** any middle regions are `cyan`.

#### Scenario: Empty / no citations renders no overlay

- **GIVEN** the latest assistant turn has zero citations
- **WHEN** the canvas renders
- **THEN** the PdfViewerWidget renders with an empty `litRegions[]`
- **AND** no `pdf-viewer-lit-region-*` elements appear.

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
the data path. `MOCK_MODE` MUST remain only a local fallback for when GroundX is unreachable, not
the demo path.

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

