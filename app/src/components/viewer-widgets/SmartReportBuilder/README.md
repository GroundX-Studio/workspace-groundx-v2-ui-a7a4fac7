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
  /** Optional section to pre-open the inline editor on (the edit hand-off). */
  selectedSectionId?: string;
}
```

`selectedSectionId` (optional) pre-opens that section's inline editor on mount —
the render→builder `✎ edit §N` hand-off and the `show_smart_report_edit` tool
both carry it. `ReportBuilderView` reads `OnboardingSession.selectedReportSectionId`
(set by `advanceFrame("f4a", { selectedReportSectionId })`) and passes it through.
Omitted → the builder opens with no editor expanded.

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
  Phase 1) AND carries the section id via
  `advanceFrame("f4a", { selectedReportSectionId })`, which the builder consumes
  through its `selectedSectionId` prop to pre-open that row's editor. The
  `show_smart_report_edit` tool carries `selected_section_id` into the same
  `editTemplate` intent field (`selectedSectionId`).

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

## LLM tools

`SmartReportBuilder.tools.ts` declares the builder's chat-drivable controls —
the SAME shared family as the Extract schema-builder's field-mutation tools:

- `show_smart_report_edit({ template_id, selected_section_id? })` — open the
  builder (f4a) at a section (the `_edit` sibling of
  `show_smart_report_render`). `read`-category nav → `editTemplate` intent.
- `propose_report_section({ name, render_as, question })` — surface a
  ProposalCard → `proposeReportSection` intent → `enqueueReportProposal`.
- `accept_report_section` / `reject_report_section({ proposal_id })` — act on a
  queued proposal → `acceptReportProposal` / `dismissReportProposal`.
- `edit_report_section({ section_id, … })` — the chat twin of the inline editor
  → `editReportSection` (shallow-merge patch).
- `delete_report_section({ section_id })` — the chat twin of `⋮ → Remove` →
  `removeReportSection`.

Each handler returns the SAME `CanvasIntent` the on-screen control dispatches;
the orchestrator routes both to the identical ChatStore action (the interim
AgentToolBus bridge), so a chat tool performs the same mutation as its UI
control. Every tool is mirrored on the middleware `SERVER_TOOL_CATALOG`. The
`show_` verb is allowlisted in `check-tool-quality` (once, by this phase).

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
