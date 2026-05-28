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

F7 IntegrateView SHALL ship connector cards and agent-plugin download
buttons that produce real artifacts. The current scaffold shows the
buttons but they MUST become functional on this requirement closing.

#### Scenario: Plugin download

- **GIVEN** a signed-in user on F7
- **WHEN** the user clicks "Download" on an agent plugin card
- **THEN** the browser receives a real plugin artifact
- **AND** the download manifest matches the documented plugin shape

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

