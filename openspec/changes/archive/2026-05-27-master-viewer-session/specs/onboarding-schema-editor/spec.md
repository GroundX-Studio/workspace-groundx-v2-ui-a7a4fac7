# Spec Delta — onboarding-schema-editor

## ADDED Requirements

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

## MODIFIED Requirements

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
