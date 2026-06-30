# Tasks — expand-inline-editor-fields

## 1. Failing closure-gate tests

- [x] Inline editor test: open editor → assert presence of:
  - `schema-field-editor-name-<id>`
  - `schema-field-editor-type-<id>`
  - `schema-field-editor-format-<id>` (NEW)
  - `schema-field-editor-prompt-<id>`
  - `schema-field-editor-identifiers-<id>` (now an editable chip-array container)
  - `schema-field-editor-instructions-<id>`
  - `schema-field-editor-preview-<id>`
  - `schema-field-editor-rewrite-<id>` (text content: `✨ rewrite with agent`)
  - `schema-field-editor-rerun-<id>` (label `↻ rerun`)
  - `schema-field-editor-save-<id>` (label `save field`)
  - `schema-field-editor-cancel-<id>` (label `cancel`)
- [x] Identifier chip test: add via `+ add` affordance → chip renders with `×` → click `×` removes it.
- [x] Preview-with-confidence: when `extraction.previousConfidence` is present, the preview chip renders `preview on <sample>` + `· <value> · conf <new> ↑ <old>`; falls back to legacy shape otherwise.

## 2. Implementation

- [x] Add `format?: string` + `identifiers?: string[]` on `SchemaFieldDef` (front-end + middleware mirror).
- [x] Add a 3-column grid in the editor with name / type / format inputs (required toggle stays adjacent).
- [x] Replace the read-only identifier chip strip with an editable chip array + `+ add` button.
- [x] `editedFields` already carries `identifiers: string[]` via the existing `editSchemaField(fieldId, edit)` action; FieldInlineEditor includes `identifiers` in the edit it dispatches on save.
- [x] Rename `✨ rewrite with AI` → `✨ rewrite with agent`.
- [x] Relabel `Save` button to `save field` per spec.
- [x] Extend `SchemaFieldExtractionResult` with `previousConfidence?: number` AND populate it during `setSchemaFieldExtraction` when an existing extraction is being replaced.
- [x] Rework preview chip to render `preview on <sample> · <value> · conf <new> ↑ <old>` when `previousConfidence` is set; fall back to current behavior otherwise.
- [x] Add a 3px coral inset stripe on the editor card's left edge (`box-shadow: inset 3px 0 0 CORAL`).

## 3. Cross-checks

- [x] Dead-context: `format`, `identifiers[]`, `previousConfidence` are all READ by the editor — preview chip surfaces previousConfidence; identifiers render as editable chips; format renders as a free-text input.
- [x] Round-trip: covered by tests in step 1 (editable identifiers test asserts add + remove flow end-to-end).

## 4. Verification

- [x] vitest + tsc green (878 app tests pass; tsc clean on app side; pre-existing middleware errors unrelated).
- [x] `openspec validate expand-inline-editor-fields --strict` green.
