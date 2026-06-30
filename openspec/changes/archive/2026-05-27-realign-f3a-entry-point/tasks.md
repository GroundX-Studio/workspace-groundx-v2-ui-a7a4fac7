# Tasks — realign-f3a-entry-point

Per `scaffold/docs/agents/discipline.md` Rule 9, tasks start with the
failing user-visible test, then implementation, then dead-context
cross-check.

## 1. Failing closure-gate test (round-trip)

- [x] Add `ExtractView.test.tsx`: `it("opens F3a from the fields-panel hamburger menu", …)`

## 2. Implementation

- [x] Add hamburger-menu primitive to ExtractView's fields panel (top-right of the panel header).
- [x] Render two menu items: `Save schema…` and `Edit schema…`.
- [x] `Edit schema…` → `advanceFrame("f3a")`. `Save schema…` opens the same target for now (Save behavior in `f3a-save-signin-gate-handoff`).
- [x] Remove the `edit-schema` pill from ChatColumn's view picker (and the `view.key === "edit-schema"` branch).
- [x] Update `ChatColumn.test.tsx` to not look for the `edit-schema` pill.

## 3. Cross-checks (Rule 9 closure gate)

- [x] Dead-context: grep confirmed no other caller dispatches `advanceFrame("f3a")` other than the new hamburger handler and the topbar toggle (`extract-topbar-edit-schema`, which `realign-f3a-topbar-chrome` will remove).
- [x] Dead-endpoint: N/A.
- [x] Dead-column: N/A.
- [x] Round-trip user-visible: covered by step 1 test.

## 4. Verification

- [x] `npx vitest run` passes (872/872)
- [x] `npx tsc --noEmit` passes
- [x] `openspec validate realign-f3a-entry-point --strict` passes
