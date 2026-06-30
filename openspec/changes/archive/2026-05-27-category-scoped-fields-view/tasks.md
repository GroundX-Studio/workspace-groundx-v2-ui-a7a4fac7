# Tasks — category-scoped-fields-view

## 1. Failing closure-gate test (round-trip)

- [x] SchemaView tests via ExtractView mount: focused-category filter renders only that category + flat header + unsaved coral indicator on diff.

## 2. Implementation

- [x] SchemaView IIFE branches on `focusedCategoryId`:
  - Focused → flat `Existing fields · <N> accepted` header + optional `● <M> unsaved` coral, then a single SchemaCategorySection with `hideCategoryHeader`.
  - Null (defensive fallback) → original per-category multi-section render.
- [x] Extended SchemaCategorySection with `hideCategoryHeader?: boolean`.
- [x] Updated the SchemaView fallback overlay literal to include the new `pinnedSamples` + `focusedCategoryId` slots.

## 3. Cross-checks

- [x] Dead-context: `focusedCategoryId` is READ by SchemaView (here) AND ExtractView topbar title + PinnedSamplesRow.
- [x] Round-trip: covered by step 1.

## 4. Verification

- [x] vitest 877/877 green.
- [x] `tsc --noEmit` clean.
- [x] `openspec validate category-scoped-fields-view --strict` green.
