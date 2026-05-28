# Tasks — realign-f3a-topbar-chrome

## 1. Failing closure-gate test (round-trip)

- [x] Added ExtractView test asserting `extract-topbar-back`, `extract-topbar-title` (`Designing utility · statement`), `extract-topbar-version` (`v1 · draft`), `extract-topbar-export`, `extract-topbar-rerun`, `extract-topbar-save`; and absence of `extract-topbar-edit-schema`.
- [x] Added test: clicking `← back` calls `advanceFrame("f3")`.

## 2. Implementation

- [x] Removed the `extract-topbar-edit-schema` button + the `handleToggleEditSchema` callback.
- [x] Added the `← back` leading button → `advanceFrame("f3")`.
- [x] Compute `focusedCategoryId` from URL `?focus=` or schema's first category.
- [x] Render title block `Designing <scenarioId> · <categoryId>` + version chip `v1 · draft`.

## 3. Cross-checks

- [x] Dead-context: `grep extract-topbar-edit-schema` → zero hits outside this change's archive.
- [x] Dead-test: removed the toggle-test from ExtractView.test.tsx.
- [x] Round-trip: covered by step 1.

## 4. Verification

- [x] vitest 873/873 green.
- [x] `tsc --noEmit` clean.
- [x] `openspec validate realign-f3a-topbar-chrome --strict` green.
