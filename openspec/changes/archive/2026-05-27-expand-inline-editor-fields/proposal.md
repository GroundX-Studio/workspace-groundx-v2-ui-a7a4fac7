# Expand inline editor fields

## Why

The current inline editor exposes name, type, required toggle, prompt,
instructions, identifier chips (read-only — wrong concept), and preview
chip. The spec (`v2-dashboard/spec-flow.jsx::Flow_EditSchema`, lines
1109-1184) calls for a richer editor body:

- 3-column grid: `name (yaml key) | type | format (opt)` — the **format**
  field is missing today.
- Description with `✨ rewrite with agent` link — present, label drift:
  spec says "rewrite with agent", we have "rewrite with AI".
- **Identifiers** as an editable chip array of "labels nearby" (e.g.
  `Peak kW`, `DEMAND SUMMARY`), each with `×` to remove + `+ add` to
  append. The current build renders other field IDs in a read-only
  chip strip — wrong shape entirely.
- **Instructions** as a multi-line textarea with `- ` rule prefix and
  `+ add rule`. Present.
- **Preview** chip with `preview on <sample> · <value> · conf <new> ↑ <old>`
  — current build shows label + value but no sample reference and no
  confidence delta.
- Coral-bordered card with 3px inset coral left-border that visually
  continues the parent row's editing state. Present (coral border),
  not the inset stripe.
- Action row: `cancel · ↻ rerun · save field` — primary `save field` is
  green; rerun is per-field; cancel discards. Present, label drift:
  spec says `save field` (not `Save`).
- The required toggle is NOT in the spec wireframe — it lives in the
  type column area as a flag. Reconcile: keep the required toggle but
  move it into the type column (spec has it adjacent to type).

## What changes

- ADD `format?: string` to `SchemaFieldDef` AND to the inline editor
  form state + rendered grid column.
- REPLACE the read-only identifier chip strip with an editable chip
  array bound to the field's own `identifiers[]`. Add ChatStore action
  `setFieldIdentifiers(fieldId, string[])`.
- RENAME `✨ rewrite with AI` → `✨ rewrite with agent`.
- REWORK the preview chip to render `preview on <sample> · <value> · conf <new> ↑ <old>` when an extraction has run; current behavior (label + value) becomes a fallback when no extraction has completed.
- RELABEL action buttons: `cancel · ↻ rerun · save field`.
- ADD a 3px coral inset stripe on the editor card's left edge to mirror the parent row's editing state.

## Out of scope

- The `format` field's effect on extraction (validation, post-processing)
  — for now treat it as a free-text hint stored on the overlay.

## Affected

- Scaffold: `scaffold/app/src/types/scenarios.ts`, `SchemaView.tsx`,
  `ChatStoreContext/types.ts`, `ChatStoreContext.tsx`.
- Requirement: `Inline editor SHALL expose name, type, format, description, identifiers, instructions, preview, actions`.
