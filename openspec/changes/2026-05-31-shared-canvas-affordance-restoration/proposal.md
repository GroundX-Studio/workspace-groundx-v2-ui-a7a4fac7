# Restore the two affordances the shared `<ScopedCanvas>` retired

## Why

`2026-05-30-onboarding-shell-shared-view` Phases 1–3 made `<ScopedCanvas>` the SOLE
canvas mount path, passing each ScopedViewerWidget only the locked
`{ scope, role }` contract. That intentionally retired three host-wired
affordances that the deleted per-frame views previously supplied — two
user-visible, one silent:

1. **Render→builder edit hand-off.** `SmartReportRender`'s `✎ edit §N` button
   fires an optional `onEditSection` prop. The deleted `ReportRenderView` wired
   it to `advanceFrame("f4a", { selectedReportSectionId })`. `<ScopedCanvas>`
   can't pass `onEditSection` (it's not in the `{ scope, role }` contract), so on
   the live f4 render surface the edit buttons are **dead no-ops**.

2. **Builder section pre-open (silent companion of #1).** `SmartReportBuilder`
   pre-opens a section's editor from its `selectedSectionId` prop, which the
   deleted `ReportBuilderView` fed from `session.selectedReportSectionId`.
   `<ScopedCanvas>` can't pass it either — so even when the builder opens, the
   targeted section's editor stays closed. The hand-off is broken end-to-end,
   not just at the click.

3. **F5 Interact "💾 Save 🔒" → sign-in gate.** The deleted `InteractView`
   rendered a Save button (`advance-to-f6`) calling
   `advanceFrame("f6") + openGate("save")`. The f5 canvas is now the shared
   `PdfViewer`, so nothing on the live Interact surface opens the gate. Per
   `no-onboarding-duplicates` the shared `PdfViewer` MUST NOT grow an
   onboarding-only Save button, so this must become chat/tool-driven.

The target architecture is already built for #1/#2 — the orchestrator routes the
`editTemplate` intent (the `show_smart_report_edit` tool's intent) to
`advanceFrame("f4a", { selectedReportSectionId })` — the on-screen control just
isn't using it. And the `openGate` `CanvasIntent` is declared but **unrouted with
no producer** (dormant plumbing — a `no-shortcuts` violation), because the
existing widgets call `useOnboardingSession().openGate()` directly.

## What Changes

- **Report edit hand-off (composable, no per-frame wiring).** `SmartReportRender`'s
  `✎ edit §N` dispatches the `editTemplate` `CanvasIntent` via
  `useCanvasOrchestratorOptional()` — the SAME intent the `show_smart_report_edit`
  tool emits. The dead `onEditSection` prop is removed.
- **Builder section pre-open.** `SmartReportBuilder` seeds its open row from
  `selectedSectionId ?? session.selectedReportSectionId` (read from the
  onboarding session context it already consumes), so the pre-open works on the
  live `<ScopedCanvas>` path with no prop threading.
- **Route the dormant `openGate` intent.** The orchestrator routes
  `{ kind: "openGate", trigger }` → `onboardingSession.openGate(trigger)`
  (soft-fail in the steady tree, matching the gate-lifecycle block). Closes the
  dormant-plumbing gap.
- **New `save_to_account` chat tool.** A `mutate`-category tool on
  `GateChatRail.tools.ts` (the gate-lifecycle widget) whose handler emits
  `{ kind: "openGate", trigger: "save" }`, mirrored on the middleware
  `SERVER_TOOL_CATALOG`. It surfaces as a `tool:save_to_account` suggested-action
  chip; clicking it (or the agent calling it) opens the sign-in gate on the live
  Interact canvas — the chat-driven successor to the retired Save button.
- **Retire the orphaned per-frame views.** Delete
  `UnderstandView` / `ExtractView` / `InteractView` / `IntegrateView` /
  `ReportRenderView` / `ReportBuilderView` (+ their tests) — they have zero
  production importers since Phase 3 packaged the production widgets. Completes
  `onboarding-shell-shared-view` Phase 3 cleanup.

## Impact

- Affected specs: `agent-tools` (new `save_to_account` tool + `openGate` routing),
  `app-architecture` (shared-canvas affordances route through the orchestrator;
  per-frame views retired).
- Affected code: `SmartReportRender.tsx`, `SmartReportBuilder.tsx`,
  `CanvasOrchestratorContext.tsx`, `GateChatRail.tools.ts`,
  `middleware/.../toolCatalog.ts` (+ drift guards `toolCatalog.test.ts`,
  `catalog-parity.test.ts`), and the six deleted `views/Onboarding/*View.tsx`.
- No DB / wire-format change. No new abstraction — both affordances reuse the
  existing `CanvasIntent` orchestrator + the existing tool/chip path.
