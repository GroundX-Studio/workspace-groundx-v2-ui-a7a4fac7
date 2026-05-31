# SmartReportRender

**Slot:** `viewer-widgets` · **Frame:** `f4` / spec `S3` · **Status:** Phase 3
(2026-05-29-smart-report-screen)

## What it does

Renders the Report **render** surface (f4): an ordered list of report sections,
each a generated body shown by its `renderAs` formatter (¶ PARAGRAPH / • BULLETS
/ ▦ TABLE via the shared `Markdown` primitive) with the shared `CiteChip` in the
section footer. It is a **ScopedViewerWidget** — it takes a real `ContentScope`
and adapts on scope change. v1 reads a MOCK_MODE fixture (`getReportFixture`);
the live render endpoint + multi-doc fan-out are Phases 6-7.

## Props

```ts
interface SmartReportRenderProps {
  /** REQUIRED render-time scope (a real ContentScope — ScopedViewerWidget). */
  scope: ContentScope;
  /** REQUIRED authorization role (anonymous | member). Gates export / Save. */
  role: WidgetRole;
  /** Fired by `✎ edit §N` — host routes to f4a with this section selected. */
  onEditSection?: (sectionId: string) => void;
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

- `onEditSection(sectionId)` — fires when the user activates `✎ edit §N` on a
  section heading (the host opens the builder f4a with that section selected).
- `CiteChip` click — dispatches `highlightCitation` (the shipped clickable-
  citation path) → the `PdfViewerWidget` jumps to the cited page + lit region.

## How to mount

```tsx
import { SmartReportRender } from "@/components/viewer-widgets/SmartReportRender/SmartReportRender";

<SmartReportRender
  role={role}
  scope={{ type: "bucket", bucketId: 28454, filter: { project: "utility" } }}
  onEditSection={(id) => advanceToBuilder(id)}
/>
```

Mounted by `ReportRenderView` (the f4 thin layout wrapper). The onboarding view
passes the active scenario's scope + the auth-derived role.

## No LLM tools

This widget ships `no-llm.md` (not a `.tools.ts`): its canvas-dispatch `show_*`
tool plus the full per-control LLM tool surface (`show_` verb allowlist + pin /
section-mutation tools + `SERVER_TOOL_CATALOG` mirror) are authored together in
**Phase 5** (step 17), where the real chat→canvas dispatch lands. Registering a
`show_*` descriptor now would be a no-op tool with no caller. See `no-llm.md`
for the rationale.

## Tests

`SmartReportRender.test.tsx` covers the role + scope contract:

1. Mounts for BOTH roles (`anonymous`, `member`); `data-role` reflects the prop.
2. Renders the Utility fixture's four sections + CiteChips over a
   `bucket + project filter` scope.
3. Export / Save lock state differs by role + `preview_only`.
4. `✎ edit §N` fires `onEditSection`.
5. The empty state renders when the scope has no fixture.
