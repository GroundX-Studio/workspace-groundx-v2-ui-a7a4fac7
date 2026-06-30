# Spec Delta — onboarding-schema-editor

## MODIFIED Requirements

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
