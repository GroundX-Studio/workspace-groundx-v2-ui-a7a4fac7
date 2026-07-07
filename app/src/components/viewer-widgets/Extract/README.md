# Extract

**Slot:** `viewer-widgets` · **Frame:** `f3` / `f3a` / `f4` · **Status:** Phase 3a
(2026-05-30-onboarding-shell-shared-view)

## Viewer chrome

Policy: `framed`

Content mode: `edge-to-edge`

`ScopedCanvas` wraps Extract in `ViewerWidgetFrame`. Extract owns its full
layout — a full-width `extract-topbar` plus its own internal scroll container —
so the frame is `edge-to-edge` (no frame padding/scroll). `padded-scroll` would
add a redundant top inset above the topbar, leaving a visible gap between the
nav and the topbar controls. The widget owns workbench-local controls, including
field selection, pane tabs, Save/export, and the `extract-topbar-back` content
action that moves Design back to Results. That back action is not viewer-frame
close/back chrome.

## What it does

The production **extraction workbench** — the live extraction view packaged as
a **ScopedViewerWidget** (PdfViewer · Extract · SmartReport · Integrate). The
render is **output-first** (analyze-and-chat-ux): `useExtractWorkbench` (one
TanStack `useQuery`) loads getDocument → `filter.workflow_id` →
getGroundXWorkflow → `workflowToSchema` (a flat LABEL dictionary) →
getDocumentExtract → `extractToInstances` (STRUCTURE from the output tree —
statement scalars at root, `meters[]` each with nested `meter_charges`,
`account_charges`; output keys with no schema field are hidden) → per-instance
`fetchFieldGeometry` keyed by instance path. `<InstanceFields>` renders the
tree recursively: each object level is a tab bar (scalars tab + one tab per
array group), array groups show instance pills (labeled by an identifying
field, else `#n`) — EVERY instance renders, no `[0]` flatten. Hovering/focusing
a field row lights that instance's regions on the embedded `<PdfViewerWidget>`;
clicking PINS the highlight (second click unpins). It also hosts the Design
surface (`<SchemaView>`) for inline schema edits + Save.

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
use). The live load is ONE TanStack `useQuery` keyed by documentId
(`useExtractWorkbench` — adopt-tanstack-query): a scope-identity change re-keys
the query, stale results are dropped by the cache (no manual load token), and
an Interact↔Extract toggle over the same doc reads the cache instead of
refetching. A `bucket`/`group` scope (or a failed load) resolves to no live
document and falls back to the manifest schema (rendered as a degenerate
single-instance tree through the same recursive render).

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
- **Field hover/focus** — lights the hovered INSTANCE's X-Ray regions on the
  embedded `<PdfViewerWidget>` (per-instance geometry); leave/blur clears.
- **Field click** — PINS the highlight (stable target for keyboard/touch); a
  second click unpins. In the stacked single-pane layout, pinning brings the
  document pane forward. No detail card — the row carries id · value ·
  confidence band (when scored) · `p.N` source chip · description inline.
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
middleware `SERVER_TOOL_CATALOG` intentBuilder returns a `showExtract`
`CanvasIntent`; the orchestrator's built-in handler routes it to
`advanceFrame("f3")` — the SAME canvas move the Extract sub-pill performs. The
app declaration is metadata only.

## Tests

`Extract.test.tsx` covers the role + scope contract:

1. Mounts for BOTH roles (`anonymous`, `member`); `data-role` reflects the prop.
2. Renders the Utility groups as instance tabs over a documents scope.
3. The anon unlock banner / Save padlock is present for `anonymous`, absent for
   `member`.
4. The keyed query re-resolves when the scope IDENTITY changes.
5. Hover lights the hovered INSTANCE's own regions (§3.2); click pins across
   mouse-leave, second click unpins (§3.2b) — no viewer navigation.

`InstanceFields.test.tsx` covers the recursive render itself (tab bar per
level, instance pills, per-instance nested groups, empty-group state, the
anti-hardcode arbitrary-shape walk, hover/pin callbacks, source chip).
