# Extract

**Slot:** `viewer-widgets` · **Frame:** `f3` / `f3a` / `f4` · **Status:** Phase 3a
(2026-05-30-onboarding-shell-shared-view)

## What it does

The production **extraction workbench** — the live schema/values/geometry view
packaged as a **ScopedViewerWidget** (PdfViewer · Extract · SmartReport ·
Integrate). It loads the document's extraction schema + values from GroundX
(getDocument → `filter.workflow_id` → getGroundXWorkflow → `workflowToSchema`;
getDocumentExtract → `extractToValues`; field-source geometry via
`fetchFieldGeometry`), renders the fields panel + a `<PdfViewerWidget>` source
peek, and hosts the F3a Design surface (`<SchemaView>`) for inline schema edits
+ Save.

This is the SAME widget the authenticated experience uses (per
`feedback_no_onboarding_duplicates`); `views/Onboarding/ExtractView.tsx` is now
a thin wrapper that mounts it with a scenario-derived scope. The F3/F3a/F4 guts
were lifted verbatim from `ExtractView` + `SchemaView` — NOT reimplemented —
the only change being that the primary `documentId` is derived from `scope`,
not from scenario context, and the live load runs inside `useScopeAdapter`.

## Props

```ts
interface ExtractProps {
  /** REQUIRED content scope (ScopedViewerWidget). Single-doc case:
      { type: "documents", documentIds: [id] }. The widget resolves the live
      schema/values/geometry for documentIds[0]; a placeholder/non-UUID id
      falls back to the scenario manifest schema. */
  scope: ContentScope;
  /** REQUIRED authorization role (anonymous | member). Gates export / Save. */
  role: WidgetRole;
}
```

Both `role` and `scope` are REQUIRED by the widget contract. No raw
`documentId` / `bucketId` / `projectId` prop — they collapse into `scope`.

## Scope

`scope: ContentScope` selects the document(s) the workbench extracts over. The
primary `documentId` is `scope.documentIds[0]` (the single-doc case the demos
use). `useScopeAdapter` re-runs the live schema/values/geometry load whenever
the scope IDENTITY changes, with a monotonic load token guarding against a slow
prior load committing stale state. A `bucket`/`group` scope (or a placeholder
id) resolves to no live document and falls back to the manifest schema.

## Locked affordances

- **Export / Save** are **locked-for-anonymous**: the topbar `export ▾` and
  `💾 Save` controls show a 🔒 padlock for an `anonymous` role, and the Save
  path that hits the auth-gated `POST /api/templates` returns 401 → opens the
  sign-up gate (`openGate("save", { cause: "save-schema" })`) with a
  post-commit retry that re-saves + attaches the schema. The unlock banner
  (anon only) routes to the gate too.
- F3a inline field edits accumulate in the per-session overlay; persistence is
  gated at the Save boundary.

## Events

- **Save** — persists the merged (manifest + overlay) template, attaches it to
  the ingest step, and appends a chat agent message.
- **Field click** — selects a field → the source `<PdfViewerWidget>` jumps to
  the field's first-citation page + highlights its X-Ray-resolved region.
- **`↻` / `✎ edit schema`** — switches Results (f3) ↔ Design (f3a) via
  `advanceFrame`; `advance-to-f5` routes to Interact.

## How to mount

```tsx
// Via <ScopedCanvas> ONLY — the sole mount path. Do NOT import the component
// directly (the ESLint no-restricted-imports ban routes it through the registry).
<ScopedCanvas
  step={{ kind: "extract-workbench", scenarioId }}
  scope={{ type: "documents", documentIds: [docId] }}
  role={role}
/>
```

`<ScopedCanvas>` resolves `extract-workbench` → this widget through the
production registry (`scopedViewerWidgetRegistryProduction.ts`).

## LLM tools

`Extract.tools.ts` declares `show_extraction({ scope, schema_id? })` — the
canvas-dispatch tool for the workbench. `show_` is the canonical canvas-dispatch
verb for every ScopedViewerWidget (allowlisted in `check-tool-quality`). The
handler returns a `showExtract` `CanvasIntent`; the orchestrator's built-in
handler routes it to `advanceFrame("f3")` — the SAME canvas move the Extract
sub-pill performs. Mirrored on the middleware `SERVER_TOOL_CATALOG`.

## Tests

`Extract.test.tsx` covers the role + scope contract:

1. Mounts for BOTH roles (`anonymous`, `member`); `data-role` reflects the prop.
2. Renders the Utility manifest schema categories over a documents scope.
3. The anon unlock banner / Save padlock is present for `anonymous`, absent for
   `member`.
4. `useScopeAdapter` re-resolves when the scope IDENTITY changes.
