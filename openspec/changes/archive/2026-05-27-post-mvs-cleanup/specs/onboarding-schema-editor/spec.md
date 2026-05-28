# Spec Delta — onboarding-schema-editor

(Phase E deferred — no schema-editor delta shipped in this change. See `tasks.md` for the deferral rationale: the provider-level projection layer from master-viewer-session Phase 4 already keeps `viewer.workspace.schemaOverlay` in lockstep with `ChatSession.pendingSchemaOverlay`; the focused migration of SchemaView readers + slot deletion is held for a follow-up `schema-overlay-canonical-on-viewer` change.)

## ADDED Requirements

### Requirement: Schema overlay SHALL be available on both ChatSession and ViewerSession transitionally

The pending schema overlay SHALL be available on BOTH `ChatSession.pendingSchemaOverlay` (legacy) AND `ViewerSession.workspace.schemaOverlay` (canonical), kept in lockstep by the provider's projected-state layer. Readers MAY use either slot; future cleanup is to migrate all readers to the viewer-workspace slot and delete the legacy `pendingSchemaOverlay`.

The lockstep contract: every mutation that lands on the legacy slot SHALL be reflected on the viewer-workspace slot on the next render. The provider does this via an `identity-short-circuit` projection (`session.viewer.workspace.schemaOverlay := session.pendingSchemaOverlay` whenever they diverge).

#### Scenario: A mutation on one slot appears on the other

- **GIVEN** a user edits a field on F3a
- **WHEN** `editSchemaField` writes to `pendingSchemaOverlay.editedFields`
- **THEN** the next render of the active session also surfaces the edit on `viewer.workspace.schemaOverlay.editedFields` (via the provider's projection)
- **AND** subsequent hydrates from the server populate both slots from the server's `viewer_workspace_json.schemaOverlay`
