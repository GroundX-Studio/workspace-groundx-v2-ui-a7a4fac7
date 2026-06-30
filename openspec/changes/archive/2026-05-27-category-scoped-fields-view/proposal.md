# Category-scoped Fields view

## Why

Spec (`v2-dashboard/spec-flow.jsx::Flow_EditSchema`, the ACCEPTED const
+ category context on line 1049) shows the Fields tab **scoped to one
category at a time** (e.g. `category: meters`). The user pins the
focused category via the pinned-samples row's `category:` chip; the
Fields tab body renders only the fields of that category, with a flat
`Existing fields · <N> accepted` header (not per-category sub-headers).

The current scaffold renders ALL categories side-by-side with eyebrow
labels (`statement`, `meters`, `charges`). This makes the editor noisy
and prevents the spec's category-focused flow.

## What changes

- READ `focusedCategoryId` from `pendingSchemaOverlay` (slot landed in
  `add-pinned-samples-row`).
- FILTER the rendered categories in `SchemaView.tsx` to the focused
  category only when set; render the focused-category fields as a
  **flat list** with a single `Existing fields · <N> accepted` header.
- ADD a `● <M> unsaved` indicator next to the header (coral text) when
  the overlay has uncommitted changes affecting this category.
- KEEP the per-category eyebrow when `focusedCategoryId` is null
  (defensive fallback for tests that don't pin a category).

## Out of scope

- The accepted-fields list shape itself (`Edit`/`Remove` text links, row
  styling) — covered by `expand-inline-editor-fields`.

## Affected

- Scaffold: `SchemaView.tsx`.
- Requirement: `Fields tab SHALL render existing fields above proposed fields` (refined to be category-scoped).
