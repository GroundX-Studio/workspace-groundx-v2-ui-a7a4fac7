# SmartReportRender

**Slot:** `viewer-widgets` · **Frame:** `f4` / spec `S3` · **Status:** Phase 3
(2026-05-29-smart-report-screen)

## What it does

Renders the Report **render** surface (f4): an ordered list of report sections,
each a generated body shown by its `renderAs` formatter (¶ PARAGRAPH / • BULLETS
/ ▦ TABLE via the shared `Markdown` primitive) with the shared `CiteChip` in the
section footer. It is a **ScopedViewerWidget** — it takes a real `ContentScope`
and adapts on scope change. The **initial paint** routes through the render
endpoint (`POST /api/widgets/smart-report/reports/render` via `renderReport`) —
the same path the **↻ re-render** control uses — so the surface the user first
sees is the endpoint response, not a synchronous client-side fixture read
(2026-05-31-smart-report-followups closed that round-trip; the server runs the
live render path). First paint has an explicit lifecycle:
`loading` (`smart-report-loading`) → `ready` / `empty` (`smart-report-empty`,
endpoint returned no sections) / `error` (`smart-report-error` +
`smart-report-retry`, retryable). `reportTemplateIdForScope(scope)` resolves
which template to render (a scope→template routing decision, not a report read);
a scope with no template shows the empty state without a network call. The
**↻ re-render** control re-runs the same fetch and swaps in the endpoint
response. The live multi-doc fan-out is Phase 7 (BLOCKED on WF-10) — the same
endpoint serves it with no surface rework.

## Props

```ts
interface SmartReportRenderProps {
  /** REQUIRED render-time scope (a real ContentScope — ScopedViewerWidget). */
  scope: ContentScope;
  /** REQUIRED authorization role (anonymous | member). Gates export / Save. */
  role: WidgetRole;
}
```

Both `role` and `scope` are REQUIRED by the widget contract. No raw
`documentId` / `bucketId` / `projectId` prop — they collapse into `scope`.

## Scope

`scope: ContentScope` is the render-time scope (`Result = Template + Scope +
answers`). The template is scope-independent; the scope rides the transition
from Extract / Interact and is recorded on the rendered result. The demos open
on `{ type: "bucket", bucketId, filter: { project } }` (Utility → the bill); a
`group` scope renders the same surface (Solar scale-out). `useScopeAdapter`
re-resolves the report whenever the scope IDENTITY changes.

## Locked affordances

- **Export / Save** are **locked-for-anonymous** (`widgetRoleCanEdit(role)`) and
  on any `preview_only` sample render (#9). The control renders for every role;
  the lock is its disabled state + the `Preview only` badge, not a hidden
  control. The actual write is gated at the Save / render-endpoint boundary.
- The rendered sections are read-only for both roles.

## Events

- `✎ edit §N` — dispatches the `editTemplate` `CanvasIntent` through the canvas
  orchestrator (`useCanvasOrchestratorOptional`), the SAME intent the
  `show_smart_report_edit` tool emits. The orchestrator routes it to
  `advanceFrame("f4a", { selectedReportSectionId })`, opening the builder with
  that section pre-selected. No host callback prop — the `{ scope, role }`
  ScopedCanvas mount contract can't supply one, so the control drives its
  cross-surface effect through the orchestrator (works with zero per-frame
  wiring; a no-op when no orchestrator is mounted, e.g. a standalone test).
- `CiteChip` click — dispatches `highlightCitation` (the shipped clickable-
  citation path) → the `PdfViewerWidget` jumps to the cited page + lit region.

## How to mount

```tsx
import { SmartReportRender } from "@/components/viewer-widgets/SmartReportRender/SmartReportRender";

<SmartReportRender
  role={role}
  scope={{ type: "bucket", bucketId: 28454, filter: { project: "utility" } }}
/>
```

Mounted by `<ScopedCanvas>` (the SOLE canvas mount path) for the `report`
canvas kind, which passes the active experience's scope + the auth-derived role.

## LLM tools

`SmartReportRender.tools.ts` declares `show_smart_report_render({ scope,
template_id? })` — the canvas-dispatch tool for the render surface. `show_` is
the canonical canvas-dispatch verb for every ScopedViewerWidget, allowlisted
once in `check-tool-quality` by this phase. The middleware `SERVER_TOOL_CATALOG`
intentBuilder returns the same `showReport` `CanvasIntent` the step-strip pill /
"make me a report" path dispatches, so the tool drives the identical canvas
move. The app declaration is metadata only. Its `_edit` sibling
(`show_smart_report_edit`) lives on `SmartReportBuilder.tools.ts`.

## Tests

`SmartReportRender.test.tsx` covers the role + scope contract:

1. Mounts for BOTH roles (`anonymous`, `member`); `data-role` reflects the prop.
2. Renders the Utility fixture's four sections + CiteChips over a
   `bucket + project filter` scope.
3. Export / Save lock state differs by role + `preview_only`.
4. `✎ edit §N` dispatches the `editTemplate` intent through the orchestrator
   (the render→builder hand-off; routes to `advanceFrame("f4a", { selectedReportSectionId })`).
5. The empty state renders when the scope has no fixture.
