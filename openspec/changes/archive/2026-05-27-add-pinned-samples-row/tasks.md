# Tasks — add-pinned-samples-row

## 1. Failing closure-gate test (round-trip)

- [x] ExtractView tests: row renders + chip-remove + count decrement.

## 2. Implementation

- [x] Extended `PendingSchemaOverlay` with `pinnedSamples: string[]` + `focusedCategoryId: string | null`.
- [x] Added ChatStore actions `pinSample` / `unpinSample` / `setFocusedCategory`.
- [x] Updated `EMPTY_PENDING_SCHEMA_OVERLAY`.
- [x] ExtractView renders `<PinnedSamplesRow>` between topbar status and body on the Design surface (`isDesignSurface`).
- [x] Auto-pin effect on F3a entry seeds the primary doc + first category.
- [x] Topbar title now reads `focusedCategoryId` from the overlay (`category-scoped-fields-view` will pick the same slot up for the Fields-tab filter).
- [x] Updated `ChatStoreServerHydrator.test.tsx` mock to include the new overlay slots.

## 3. Cross-checks

- [x] Dead-context: `pinnedSamples` is READ by `PinnedSamplesRow`; `focusedCategoryId` is READ by the topbar title (and will be by SchemaView's Fields-tab filter in the next change).
- [x] Round-trip: covered by step 1 tests.

## 4. Verification

- [x] vitest 875/875 green.
- [x] `tsc --noEmit` clean.
- [x] `openspec validate add-pinned-samples-row --strict` green.
