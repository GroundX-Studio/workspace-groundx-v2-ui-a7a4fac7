# Add pinned-samples row

## Why

Spec (`v2-dashboard/spec-flow.jsx::Flow_EditSchema`, lines 1042-1050)
puts a thin row between the topbar and the subseg tabs that names the
**sample(s) the schema is being designed against** plus the **active
category**. The chip's `×` lets the user unpin; `+ pin another sample`
lets them add up to 3. The right-aligned `category: <id>` label echoes
the topbar title's category half so the user always knows the scope.

The current scaffold has no pinned-samples concept; the active scenario
is implicit. This row is the only place the user can swap samples
without leaving F3a, which is the explicit intent of "designer + stress
test" sample pinning.

## What changes

- ADD an `extract-pinned-samples-row` block between the topbar and the
  subseg tabs in `ExtractView.tsx` (Design surface only — F3 Results
  view doesn't need it).
- The row's contents:
  - `PINNED <count>/3` eyebrow
  - One chip per pinned sample: `<filename> · <pages>p · ×`
  - `+ pin another sample` link (disabled when 3 pinned; opens a small
    picker popover listing the project's other samples)
  - Right-aligned `category: <id>` chip — clicking opens a popover of
    category options
- ADD a per-session `pinnedSamples: string[]` slot on `pendingSchemaOverlay`
  AND a `focusedCategoryId: string | null` slot.
- Initial state on F3a entry: `pinnedSamples = [<active-scenario's
  primary doc>]` (auto-pinned); `focusedCategoryId = <first category in
  schema>` (or from `?focus=` URL param if present).
- The `category: <id>` value drives which category the Fields tab
  renders (see sibling change `category-scoped-fields-view`).

## Out of scope

- The actual "pin from project" picker UI is stubbed; in onboarding
  there's only one sample, so the link is disabled with tooltip
  "Sign in to load more samples".

## Affected

- Scaffold: `ExtractView.tsx`, `ChatStoreContext/types.ts`,
  `ChatStoreContext.tsx` (add the two overlay slots), `SchemaView.tsx`
  (read `focusedCategoryId`).
- Requirement: `Pinned-samples row SHALL render above the subseg tabs`.
