# SmartReportBuilder

**Slot:** `viewer-widgets` · **Frame:** `f4a` / spec `S3a` · **Status:** Phase 4
(2026-05-29-smart-report-screen)

## What it does

Renders the Report **builder** surface (f4a): the F3a schema-editor chrome,
reused verbatim — a pinned-samples row, `Sections` / `Render` sub-tabs, a row
list with an inline section editor, the `⋮` row menu, and the
`export ▾ 🔒 · ↻ render · 💾 Save 🔒` control row.

Reports are **schemas for questions**: the template is an ordered list of
sections, each `name + renderAs + question + instructions + variables`. The
inline editor exposes exactly those fields. The builder is a
**ScopedViewerWidget** — it takes a real `ContentScope` (which template's
sections to seed from) and adapts on scope change; v1 seeds rows from the
MOCK_MODE fixture (`getReportFixture`), the live template read lands in Phase 6.

It is the **real second consumer** of the generalized editing overlay: row
edits drive `reportOverlay` on the active ChatSession (`addReportSection` /
`editReportSection` / `removeReportSection`), the `report`-kind sibling of the
Extract schema overlay built on the same generic `PendingTemplateOverlay` shell.

## Props

```ts
interface SmartReportBuilderProps {
  /** REQUIRED render-time scope (a real ContentScope — ScopedViewerWidget). */
  scope: ContentScope;
  /** REQUIRED authorization role (anonymous | member). Gates Save / export. */
  role: WidgetRole;
}
```

The render→builder section *pre-selection* (the `✎ edit §N` hand-off carrying a
section id) lands in **Phase 5** with the `show_smart_report_edit` tool that
carries the id — it is NOT shipped here as a dormant prop with no production
caller.

Both `role` and `scope` are REQUIRED by the widget contract. No raw
`documentId` / `bucketId` / `projectId` prop — they collapse into `scope`.

## Scope

`scope: ContentScope` selects which template's sections to seed (the template
itself is **scope-independent** — `Result = Template + Scope + answers`, with
the render scope supplied at render time on the render surface, NOT stored on
the template or its sections). The demos open on
`{ type: "bucket", bucketId, filter: { project } }` (Utility → the bill);
`useScopeAdapter` re-seeds the rows whenever the scope IDENTITY changes.

There is deliberately **NO per-section scope control** in the inline editor —
sections share the report's single render-time scope.

## Locked affordances

- **Save** is **sign-in-gated** (`widgetRoleCanEdit(role)`): an `anonymous`
  user's Save opens the sign-in gate (`commitGate` via `openGate("save")`)
  rather than persisting; a `member`'s Save is enabled (the persist endpoint
  wires in Phase 6). The control renders for both roles; the lock is the `🔒`
  affordance, not a hidden control.
- **export ▾** is locked-for-anonymous (the `🔒` affordance).
- **Variables are manual / literal-only (#12)** — the per-section "make
  variable" affordance records a literal variable the user names; there is NO
  auto-inference.
- **No version-history UI (#13)** — latest-saved only; the `templates` table
  has no `version` column.

## Events

- Section edits dispatch `addReportSection` / `editReportSection` /
  `removeReportSection` on the active ChatSession's `reportOverlay` (the
  `report`-kind sibling of the Extract schema overlay).
- An anonymous Save dispatches `openGate("save")` (the `commitGate` entry).
- The render surface's `✎ edit §N` routes the frame f4 → f4a (live since
  Phase 1); the section-id pre-selection hand-off lands in Phase 5.

## How to mount

```tsx
import { SmartReportBuilder } from "@/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder";

<SmartReportBuilder
  role={role}
  scope={{ type: "bucket", bucketId: 28454, filter: { project: "utility" } }}
/>
```

Mounted by `ReportBuilderView` (the f4a thin layout wrapper). The onboarding
view passes the active scenario's scope + the auth-derived role.

## No LLM tools

This widget ships `no-llm.md` (not a `.tools.ts`): its canvas-dispatch
`show_smart_report_edit` tool plus the per-control mutation tools
(`add`/`edit`/`remove` section, `render_report`) — and the `show_` verb
allowlist add + the middleware `SERVER_TOOL_CATALOG` mirror — are authored
together in **Phase 5** (step 17), where the real chat→canvas dispatch lands.
Registering a `show_*` descriptor now would be a no-op tool with no caller. See
`no-llm.md` for the rationale.

## Tests

`SmartReportBuilder.test.tsx` covers the role + scope contract:

1. Mounts for BOTH roles (`anonymous`, `member`); `data-role` reflects the prop.
2. Renders the F3a-style chrome (pinned-samples row, Sections/Render sub-tabs,
   control row).
3. Renders the fixture section rows + opens the inline editor (name + renderAs
   + question + instructions; NO per-section scope).
4. Manual "make variable" affordance (#12); no version-history UI (#13).
5. Save is locked + opens the sign-in gate for an anonymous viewer; unlocked
   for a member.
