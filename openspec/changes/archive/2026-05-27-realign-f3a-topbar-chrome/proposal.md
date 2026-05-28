# Realign F3a topbar chrome

## Why

The scaffold's F3a topbar (after the prior pass) reads:
`export ▾ 🔒 · ↻ rerun · ✎ edit schema ▾ · 💾 Save 🔒`. The spec
(`v2-dashboard/spec-flow.jsx::Flow_EditSchema`, lines 1022-1039) calls
for `← back · "Designing <sample-id> · <category-id>" · v<N> · draft ·
[spacer] · export ▾ JSON·CSV·YAML 🔒 · ↻ rerun · 💾 Save 🔒`. Three
deltas:

1. **No `✎ edit schema ▾` toggle** — the user IS in the editor; switching
   to Results is the subseg-tab job.
2. **Title block** uses `sample · category` (not the schema's stored
   name) with a version chip `v<N> · draft`.
3. **`← back` link** as the first item (returns to F3), separate from
   the breadcrumb.

## What changes

- REMOVE the `extract-topbar-edit-schema` button and `handleToggleEditSchema` from `ExtractView.tsx`.
- ADD a `← back` button as the first topbar element; click → `advanceFrame("f3")`.
- REPLACE the topbar's title block with `Designing <sample-id> · <category-id>` + version chip `v<N> · draft`.
- KEEP `export ▾ JSON·CSV·YAML 🔒` + `↻ rerun` + `💾 Save 🔒` (already present; verify locked-as-visual-only behavior).

## Out of scope

- Implementing real `export` (file download) — stub for now.
- Implementing topbar-level `↻ rerun` (the per-field rerun in the inline editor stays where it is).
- The pinned-samples row that sits below the topbar — covered by `add-pinned-samples-row`.

## Affected

- Scaffold: `scaffold/app/src/views/Onboarding/ExtractView.tsx`, `ExtractView.test.tsx`, `SchemaView.test.tsx`.
- Requirement: `F3a topbar SHALL render the spec'd chrome`.
