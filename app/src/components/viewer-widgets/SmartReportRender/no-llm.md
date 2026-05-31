# SmartReportRender — no LLM tools (yet)

## Why

This widget ships **no** `*.tools.ts` in this change. Its LLM surface — the
`show_smart_report_render` canvas-dispatch tool, the `show_` verb allowlist
addition in `check-tool-quality`, the per-control mutation tools, and the
middleware `SERVER_TOOL_CATALOG` mirror — is authored together in **Phase 5**
(step 17 of `2026-05-29-smart-report-screen/tasks.md`), where the real chat→
canvas dispatch and the production `ScopedViewerWidget` registry singleton land.

Authoring a `show_*` descriptor now would be a **no-op tool with no caller** and
an un-allowlisted verb — exactly the dormant / spec-only plumbing
`feedback_no_shortcuts` and the adversarial-review gate forbid. So this change
ships the render surface as a pure, user-driven viewer widget (mounted by
`ReportRenderView`, scope + role supplied by the host) and explicitly defers the
tool surface via this opt-out until its real caller exists.
