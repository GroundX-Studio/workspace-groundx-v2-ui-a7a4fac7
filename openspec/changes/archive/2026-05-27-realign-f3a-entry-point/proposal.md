# Realign F3a entry point

## Why

The current scaffold lets the user reach F3a via the F2 "Pick-a-view"
pill that renders after the ThinkingStream completes (`Edit schema`
pill → `advanceFrame("f3a")`). The spec
(`v2-dashboard/spec-flow.jsx::Flow_EditSchema` docblock, line 944–950)
calls for a different entry: F3a is a **side-branch from F3** opened
via the **fields-panel hamburger menu** (`Save schema…` /
`Edit schema…`). The user has already seen F3 and decided to refine
the schema — they don't pick "Edit schema" from a pre-canvas chat.

Keeping the F2 entry point misses the spec's intent ("the user dropped
into the schema editor to add fields, retype, or toggle required-ness
… purpose of doing extraction on the sample is to leave with a
*reusable schema*") AND collides with the natural reading of the step
strip — F3a should not show until the user has been on F3.

## What changes

- ADD a hamburger-menu trigger to F3's fields panel
  (`scaffold/app/src/views/Onboarding/ExtractView.tsx`) exposing
  `Save schema…` and `Edit schema…` items.
- ADD a route: `Edit schema…` → `advanceFrame("f3a")`.
- REMOVE the `edit-schema` pick-a-view pill from
  `scaffold/app/src/components/chat-widgets/ChatColumn/ChatColumn.tsx`'s
  post-ThinkingStream view picker.
- VERIFY the step strip continues to show Analyze · Extract active
  when frame === f3a (already correct; add a regression test).

## Out of scope

- Reshaping the F3a topbar / editor body — covered by
  `realign-f3a-topbar-chrome` and `expand-inline-editor-fields`.
- The eventual sign-in-gated Save flow — covered by
  `f3a-save-signin-gate-handoff`.

## Affected

- Scaffold modules:
  - `scaffold/app/src/views/Onboarding/ExtractView.tsx` (add hamburger menu)
  - `scaffold/app/src/components/chat-widgets/ChatColumn/ChatColumn.tsx` (drop pill)
  - `scaffold/app/src/views/Onboarding/ExtractView.test.tsx` (new test)
  - `scaffold/app/src/components/chat-widgets/ChatColumn/ChatColumn.test.tsx` (updated test)
- Closure: vitest passes; `openspec validate --all --strict` passes.
- Affected requirement: `onboarding-schema-editor: F3a SHALL be entered from F3's fields-panel hamburger menu`.
