# Onboarding Schema Editor (F3a) — Durable Spec

## Purpose

Define the durable requirements for the **F3a Edit Schema** surface in
the onboarding flow. Source of truth is `v2-dashboard/spec-flow.jsx`
function `Flow_EditSchema()`, the corresponding section in `Onboarding
Spec _standalone_.html`, and Neil's Batch E mock card
(`groundx-wireframes/00-agent-reference/mock-cards/neil-schemas-stress.md`)
which the onboarding spec explicitly mirrors with the addition of the
onboarding step strip and anonymous-user padlocks.

The F3a surface lets the user shape a reusable extraction schema while
still anonymous, against a pinned sample document, with a Schema Agent
proposing field changes via accept/dismiss cards. The schema persists
on Save, which gates on sign-in.

## Frame role

F3a is a **side-branch from F3** in the Analyze · Extract step. Entry
is from F3's fields-panel hamburger menu (`Save schema…` /
`Edit schema…`). Onboarding step strip continues to show
Analyze · Extract active.

## Layout

The F3a surface uses the standard AppShell (chat-left, canvas-right):

- **Left pane**: chat with the **Schema Agent**, including:
  - Header row: agent name + sample switcher (`sample: Utility Bill · switch ▾`)
  - Earlier-turns compaction summary
    (e.g. `▾ earlier turns (3 proposals · 11 fields accepted)`)
  - Live chat bubbles (user + agent) with proposal-card affordances
  - Composer at bottom: `ask the agent to add, edit, or split a field…`
- **Right pane** (the schema editor body), top-to-bottom:
  - Onboarding step strip (Analyze · Extract active)
  - Topbar: `← back · Designing <sample> · <category> · v<N> · draft · [spacer] · export ▾ JSON·CSV·YAML 🔒 · ↻ rerun · 💾 Save 🔒`
  - Pinned-samples row: `PINNED <pinned>/3 · <sample-chip × …> · + pin another sample · category: <name>`
  - Subseg tabs: `Design · Fields · <count> · Results` (Fields default)
  - Active-sub-tab body (scrollable)
## Requirements
### Requirement: F3a SHALL be entered from F3's fields-panel hamburger menu

F3a SHALL be entered only by clicking the hamburger icon on the F3
fields panel and selecting `Save schema…` or `Edit schema…`. F3a is
not a top-level step-strip frame and SHALL NOT appear in nav as a peer
to F3. The step strip's Analyze · Extract pill SHALL remain active.

The `edit-schema` view picker pill in F2's post-ThinkingStream view
picker SHALL be removed; F2's pick-a-view affordance is for category
selection within Extract (statement / meters / charges), not for
launching the editor.

#### Scenario: User opens F3a from F3 hamburger

- **GIVEN** the user is on F3 with `utility-bill` selected
- **WHEN** the user opens the fields-panel hamburger and clicks `Edit schema…`
- **THEN** F3a mounts in the canvas pane
- **AND** the step strip continues to show Analyze · Extract active
- **AND** the F3 fields panel is replaced by the schema editor body

#### Scenario: F2 view picker no longer offers Edit schema

- **GIVEN** F2 just completed its ThinkingStream
- **WHEN** the user sees the "Pick a view:" bubble
- **THEN** the pill row SHALL contain only category-scope pills (e.g. `statement`, `meters`, `charges`) plus `interact`
- **AND** SHALL NOT contain an `edit schema` pill

### Requirement: F3a topbar SHALL render the spec'd chrome

The topbar SHALL contain, left-to-right:

1. `← back` link (returns to F3 via `advanceFrame("f3")`)
2. Schema title block: `Designing <sample-id> · <category-id>` followed by `v<N> · draft`
3. Flexible spacer
4. `export ▾ JSON·CSV·YAML` button with `🔒` padlock for anonymous users
5. `↻ rerun` button (topbar-level rerun against pinned samples)
6. `💾 Save` button with `🔒` padlock for anonymous users

Padlocks SHALL be visual indicators only — anonymous users can click
both buttons; clicking opens the sign-in gate (F6) rather than no-op.

The topbar SHALL NOT contain an `✎ edit schema ▾` toggle.

#### Scenario: F3a topbar shows the spec chrome

- **GIVEN** the user is on F3a with `utility-bill` selected and `meters` as the focused category
- **WHEN** the editor mounts
- **THEN** the topbar renders, in order:
  `← back` · `Designing utility-bill · meters` · `v1 · draft` · spacer · `export ▾ JSON·CSV·YAML 🔒` · `↻ rerun` · `💾 Save 🔒`
- **AND** clicking `← back` returns the user to F3
- **AND** no `✎ edit schema` button is present

### Requirement: Pinned-samples row SHALL render above the subseg tabs

The pinned-samples row SHALL render between the topbar and the subseg
tabs on the Design surface (F3a) and contain:

1. `PINNED <count>/3` eyebrow
2. One chip per pinned sample: `<filename> · <pages>p · ×`
3. `+ pin another sample` link (disabled when 3 pinned)
4. Right-aligned `category: <id>` badge — clicking opens a popover of
   the schema's category ids; selecting one updates the focused category

The row SHALL initialize with the active scenario's primary document
auto-pinned and the first schema category as the focused category
(unless an inbound `?focus=<id>` URL param specifies a different one).

The focused-category badge SHALL drive the Fields tab's scope: the
Fields tab body renders only fields belonging to the focused category.

#### Scenario: F3a entry with utility scenario auto-pins the bill

- **GIVEN** the user opens F3a from F3 with `utility-bill` selected
- **WHEN** the editor mounts
- **THEN** the pinned-samples row renders `PINNED 1/3`
- **AND** one chip is present: `utility-bill.pdf · 3p · ×`
- **AND** the right-aligned badge reads `category: meters` (the first category)

#### Scenario: User changes the focused category

- **GIVEN** F3a with `category: meters` active
- **WHEN** the user clicks the `category:` badge and selects `statement`
- **THEN** the badge updates to `category: statement`
- **AND** the topbar title block updates to `Designing utility-bill · statement`
- **AND** the Fields tab body re-renders with only the `statement` fields

#### Scenario: Anonymous user attempts to pin another sample

- **GIVEN** F3a in anonymous mode with 1 pinned sample
- **WHEN** the user clicks `+ pin another sample`
- **THEN** a disabled-state tooltip surfaces:
  `Sign in to load more samples`
- **AND** no new chip is added

### Requirement: Subseg tabs SHALL switch the right-pane body between Design / Fields / Results

The subseg tab row SHALL render three buttons in order:
`Design`, `Fields <count>`, `Results`. Fields SHALL be the default on
F3a entry. The active sub-tab MUST be visually distinguished (cyan
fill + bold text). Only one sub-tab body SHALL be visible at a time.

The `<count>` next to `Fields` SHALL show the number of
**accepted** fields in the currently scoped category (overlay's
effective field list, post-merge).

#### Scenario: User switches from Fields to Results

- **GIVEN** F3a on the Fields tab with 7 accepted fields
- **WHEN** the user clicks the `Results` subseg tab
- **THEN** the Results body mounts (sample × field grid)
- **AND** the Fields body unmounts
- **AND** the Fields tab pill drops its active styling

#### Scenario: Fields is the default sub-tab on F3a entry

- **GIVEN** the user enters F3a from F3's hamburger menu
- **WHEN** the editor mounts
- **THEN** the Fields sub-tab body is the active body
- **AND** the Fields tab pill carries the active styling
- **AND** the Design and Results sub-tabs are dormant

### Requirement: Fields tab SHALL render existing fields above proposed fields

The Fields tab body SHALL:

- Render only fields belonging to the **focused category** (driven by
  `pendingSchemaOverlay.focusedCategoryId`) as a flat list.
- Group as two sections in this order:
  1. Header: `Existing fields · <N> accepted`, with an optional
     `● <M> unsaved` coral indicator when the overlay has uncommitted
     changes affecting this category.
  2. The list of accepted fields in the focused category (in
     manifest order, additions appended at end).
  3. When `K > 0` proposals exist for this category:
     `Proposed fields · <K> from the latest agent turn` header
     followed by the ProposalCard list.
- Proposals appearing in chat that have not been resolved SHALL also
  surface in this list (chat is a mirror; the canvas is where the user
  acts).

When `focusedCategoryId` is null (defensive fallback), the body SHALL
fall back to the existing per-category multi-section render.

#### Scenario: Fields tab scoped to meters

- **GIVEN** F3a with `focusedCategoryId === "meters"`
- **AND** the utility schema has 2 meters fields and 5 statement fields
- **WHEN** the Fields tab body renders
- **THEN** only the 2 meters fields appear
- **AND** the header reads `Existing fields · 2 accepted`
- **AND** no statement fields are visible

### Requirement: Each field row SHALL show name, type, prompt + Edit/Remove links

Each field row SHALL render the following elements:

- `<field-key>` in monospaced font + uppercase type chip (`STRING` / `NUMBER` / `DATE` / `BOOLEAN`)
- Optional `● just edited` indicator (when the row's edit was just committed)
- Optional `✎ editing` indicator (when the row's inline editor is open)
- The field's prompt/description in italic Kalam beneath the name
- Right-aligned `Edit` and `Remove` controls — SHALL render as text **links**, not buttons

A field that is currently being edited SHALL have its bottom borders
removed and visually attach to the inline editor below it.

#### Scenario: User clicks Edit on a row

- **GIVEN** a field row that is not currently editing
- **WHEN** the user clicks `Edit`
- **THEN** the row shows `✎ editing`
- **AND** the row's bottom borders are removed
- **AND** the inline editor expands below the row, visually attached
- **AND** any other row that was editing closes

### Requirement: Inline editor SHALL expose name, type, format, description, identifiers, instructions, preview, actions

The inline editor body SHALL render four blocks, top-to-bottom:

1. **Grid: name (yaml key) | type | format (opt)**
   - Name: monospaced field-key text input
   - Type: select with `STRING / NUMBER / DATE / BOOLEAN`
   - Format: optional free-text hint (e.g. `float · kW`)
   - A `required` toggle SHALL render adjacent to the type column
2. **Description / prompt**
   - Eyebrow: `description · what the field represents` + right-aligned
     `✨ rewrite with agent` link
   - Textarea with italic Kalam styling for body; supports inline `<b>`
     highlights for identifier anchors
3. **Identifiers + Instructions side-by-side grid**
   - **Identifiers**: editable chip array of "labels nearby" (e.g.
     `Peak kW`, `DEMAND SUMMARY`); each chip has a `×` to remove;
     `+ add` opens a free-text entry. Chips bind to the field's own
     `identifiers[]` via the ChatStore overlay's `editedFields[id].identifiers`.
   - **Instructions**: multi-line textarea, one rule per line
     (e.g. `- Return the numeric value only · strip "kW"`);
     `+ add rule` appends a row.
4. **Preview chip + actions**
   - Preview chip (left): when an extraction has run with a previous
     confidence on record, renders
     `preview on <sample> · <value> · conf <new> ↑ <old>`. When no
     prior confidence is known, falls back to the label + value layout.
   - Right-aligned actions: `cancel · ↻ rerun · save field`. `save field`
     is the primary action (green fill).

The editor's visual frame SHALL be a coral-bordered card with a 3px
inset coral left-border stripe (`box-shadow: inset 3px 0 0 CORAL`) that
visually continues the parent row's editing state. The card's top
borders SHALL be removed; the parent row's bottom borders SHALL be
removed; together they form a single visually attached editor block.

#### Scenario: Save field commits the edit and closes the editor

- **GIVEN** an open inline editor with a modified description
- **WHEN** the user clicks `save field`
- **THEN** the edit is committed to `pendingSchemaOverlay.editedFields`
- **AND** the inline editor closes
- **AND** the parent row shows `● just edited`
- **AND** the row's coral edited-state styling persists until the
  topbar Save commits to the server

#### Scenario: Identifier chip add/remove

- **GIVEN** a field with `identifiers: ["Peak kW", "DEMAND SUMMARY"]`
- **WHEN** the user clicks the `×` on `Peak kW`
- **THEN** the chip disappears
- **AND** the overlay's `editedFields[fieldId].identifiers` is
  `["DEMAND SUMMARY"]`
- **AND** clicking `+ add`, typing `Peak Demand`, and pressing Enter
  appends a new chip and the overlay updates accordingly

### Requirement: ProposalCard SHALL declare envelope provenance and offer Accept/Dismiss

Each ProposalCard SHALL render:

- `PROPOSAL` badge (coral pill, white text)
- Headline: `Add <N> field(s)`
- `proposal_v<version> · envelope verified` provenance label — sourced
  from the parsed proposal's `provenance.version` AND only rendered
  when `provenance.verified === true`.
- The proposed field's full shape: name + type chip + prompt
- Right-aligned `Accept` (primary green) and `Dismiss` (ghost) buttons

The provenance label SHALL only render when the server-side Zod
validator (`proposalEnvelopeV<N>Schema`) successfully parsed the LLM's
structured output. Proposals that fail Zod validation SHALL NOT surface
to the user — the LLM response is silently dropped and the parse error
is logged to Sentry. This ensures the user never sees a half-built or
malformed proposal.

The same provenance label SHALL render on BOTH:

1. The chat-side `ProposeSchemaFieldCard` (inline in the assistant turn)
2. The F3a Fields-tab ProposalCard variant (above-the-list canvas surface)

#### Scenario: Well-formed envelope renders with provenance

- **GIVEN** the grounded LLM emits a fenced JSON block with
  `{"proposedSchemaField": {"version":"v1", "categoryId":"meters", "name":"total_kwh", "type":"NUMBER", "description":"…"}}`
- **WHEN** `parseGroundedAnswer` runs `proposalEnvelopeV1Schema.safeParse`
- **THEN** the parse succeeds
- **AND** the response carries `proposedSchemaField.provenance = {version: "v1", verified: true}`
- **AND** the rendered ProposalCard shows `proposal_v1 · envelope verified`

#### Scenario: Malformed envelope is dropped silently

- **GIVEN** the grounded LLM emits a fenced JSON block missing `categoryId`
- **WHEN** `parseGroundedAnswer` runs the Zod parse
- **THEN** the parse fails
- **AND** the response carries `proposedSchemaField: null`
- **AND** the parse error is logged to Sentry
- **AND** no ProposalCard renders on either surface

### Requirement: Schema-Agent chat affordances SHALL surface earlier-turns + confidence delta

The left-pane chat (in F3a) SHALL:

- Render a `Schema Agent` header above the conversation containing:
  - The label `Schema Agent`
  - A sample-switcher chip of the form
    `sample: <Display Name> · switch ▾`
  - The chip's `switch ▾` SHALL open a popover listing the project's
    other samples (stub in onboarding mode where only one sample
    exists; tooltip "Sign in to load more samples").
- Render an earlier-turns summary at the top of the conversation when
  `ChatSession.summaries.length > 0`, of the form:
  `▾ earlier turns (<P> proposals · <A> fields accepted)`
  where `<P>` and `<A>` are derived from the dismissed-proposal count
  and `pendingSchemaOverlay.addedFields.length` respectively.
- When a per-field rerun completes (extraction status flips to `done`
  with a `previousConfidence` value on record), the chat SHALL append
  an assistant bubble with the body:
  `Re-ran on the sample: <value> · confidence <new> ↑ from <old>`

These affordances render ONLY on F3a (`currentFrame === "f3a"`). The
standard ChatColumn surface on F2/F5 is unchanged.

#### Scenario: F3a chat shows the Schema-Agent header and sample chip

- **GIVEN** the user is on F3a with `utility-bill` (display name `Utility Bill`) as the active scenario
- **WHEN** ChatColumn renders
- **THEN** the chat surface shows a `Schema Agent` header
- **AND** a sample-switcher chip with text `sample: Utility Bill · switch ▾`

#### Scenario: Field rerun appends a confidence-delta bubble

- **GIVEN** an open inline editor on `peak_demand_kw` with a prior extraction `value: 14.5, confidence: 0.83`
- **WHEN** the user clicks `↻ rerun` and the extraction returns `{value: 16.2, confidence: 0.98}`
- **THEN** the chat stream appends an assistant bubble whose text matches
  `Re-ran on the sample: 16.2 kW · confidence 0.98 ↑ from 0.83`

### Requirement: Save SHALL gate on sign-in and pre-attach the schema on F1 return

The Save flow's anonymous path SHALL push a `{ kind: "sign-up", state:
"pending", cause: "save-schema" }` overlay onto `ViewerSession.overlays`
rather than setting a top-level `gate.status === "open"` slot. On
successful commit, the overlay SHALL mutate to `state: "done"` and
auto-pop after the post-commit handoff fires.

On persist success, the scaffold SHALL:

a. Append a chat widget message `{ kind: "schema-attached", schemaId, name }` to the active chat session's history.
b. Push the next viewer step `{ kind: "ingest-picker", attachedSchema: { schemaId, name } }` (or annotate the next pushed ingest step with `attachedSchema`).
c. The F1 banner SHALL read `currentStep.attachedSchema`, NOT a top-level `preAttachedSchemaId` slot.

`OnboardingSessionContext.preAttachedSchemaId` AND
`setPreAttachedSchemaId` SHALL be deleted. The annotation + chat widget
are the only sources of truth.

#### Scenario: Anonymous Save → sign-in → F1 banner reads from the viewer step

- **GIVEN** an anonymous user on F3a with overlay diff `(2 added, 1 edited)`
- **WHEN** the user clicks `💾 Save 🔒`
- **THEN** a `{ kind: "sign-up", state: "pending", cause: "save-schema" }` overlay is pushed
- **AND** the user completes sign-up via the overlay (commit → state: "done")
- **AND** the post-commit effect persists the schema, appends a `schema-attached` chat widget, AND pushes the next ingest-picker step with `attachedSchema: { schemaId, name }`
- **AND** the F1 banner renders `attachedSchema.name` from the viewer step (no `preAttachedSchemaId` slot involved)

#### Scenario: Signed-in Save renders the chat widget + step annotation immediately

- **GIVEN** a signed-in user on F3a with overlay changes
- **WHEN** the user clicks `💾 Save`
- **THEN** no sign-up overlay is pushed
- **AND** the schema persists immediately
- **AND** a `schema-attached` chat widget message lands
- **AND** any subsequent return to F1 surfaces the banner via the step annotation

### Requirement: Schema overlay SHALL be stored on ViewerSession workspace, not on ChatSession

The pending schema overlay SHALL live on `ViewerSession.workspace.schemaOverlay` and SHALL NOT be stored on `ChatSession`. This covers additions, removals, edits, pinned samples, focused category, and pending proposals. The schema editor is a viewer-state concept — its overlay belongs in the viewer session that accumulates workspace history, not in the chat session that accumulates conversation turns.

For one release cycle, `ChatSession.pendingSchemaOverlay` MAY remain as
a deprecated getter that proxies to the viewer slot AND emits a
`console.warn` on access. After the cycle, the getter SHALL be deleted.

#### Scenario: Editing a field on F3a writes to the viewer session

- **GIVEN** the user is on F3a editing `account_number`'s extraction prompt
- **WHEN** the user clicks `save field`
- **THEN** the edit lands on `ViewerSession.workspace.schemaOverlay.editedFields`
- **AND** no write hits `ChatSession.pendingSchemaOverlay` (which now proxies the same data)

#### Scenario: Hydrate restores the schema overlay from the viewer slot

- **GIVEN** a chat session row with `viewer_workspace_json.schemaOverlay` carrying 2 edits + 1 pinned sample
- **WHEN** the user refreshes
- **THEN** the rehydrated session exposes the overlay at `viewer.workspace.schemaOverlay`
- **AND** SchemaView renders the 2 edits + 1 pinned sample correctly

### Requirement: Schema overlay SHALL be available on both ChatSession and ViewerSession transitionally

The pending schema overlay SHALL be available on BOTH `ChatSession.pendingSchemaOverlay` (legacy) AND `ViewerSession.workspace.schemaOverlay` (canonical), kept in lockstep by the provider's projected-state layer. Readers MAY use either slot; future cleanup is to migrate all readers to the viewer-workspace slot and delete the legacy `pendingSchemaOverlay`.

The lockstep contract: every mutation that lands on the legacy slot SHALL be reflected on the viewer-workspace slot on the next render. The provider does this via an `identity-short-circuit` projection (`session.viewer.workspace.schemaOverlay := session.pendingSchemaOverlay` whenever they diverge).

#### Scenario: A mutation on one slot appears on the other

- **GIVEN** a user edits a field on F3a
- **WHEN** `editSchemaField` writes to `pendingSchemaOverlay.editedFields`
- **THEN** the next render of the active session also surfaces the edit on `viewer.workspace.schemaOverlay.editedFields` (via the provider's projection)
- **AND** subsequent hydrates from the server populate both slots from the server's `viewer_workspace_json.schemaOverlay`

