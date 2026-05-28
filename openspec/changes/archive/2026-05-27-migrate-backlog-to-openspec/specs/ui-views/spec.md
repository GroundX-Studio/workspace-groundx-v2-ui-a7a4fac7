# Spec Delta — ui-views

Migrated from `backlog.md` Epic UI (active rows only). UI-01 lives in
its own `onboarding-schema-editor` capability; UI-05 closed.

## ADDED Requirements

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

F5's citation chips SHALL be clickable. Clicking a chip SHALL open a
side panel showing the source page for the cited document, with the
relevant region highlighted.

#### Scenario: Click a citation chip on F5

- **GIVEN** an assistant turn on F5 carrying a citation chip
- **WHEN** the user clicks the chip
- **THEN** a side panel opens
- **AND** the panel renders the source PDF page with the snippet region highlighted

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
