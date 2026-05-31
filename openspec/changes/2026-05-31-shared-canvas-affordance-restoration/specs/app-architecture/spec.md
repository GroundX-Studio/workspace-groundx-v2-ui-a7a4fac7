# Spec Delta — app-architecture (shared-canvas affordances route through the orchestrator)

`<ScopedCanvas>` passes each ScopedViewerWidget only `{ scope, role }`. Any
on-screen control that previously depended on a host callback prop SHALL instead
drive its effect through the canvas orchestrator, so the control works on the
shared canvas with no per-frame view wiring. Completes the retirement of the
per-frame onboarding views.

## ADDED Requirements

### Requirement: On-canvas controls SHALL drive host effects through the orchestrator, not host callback props

A ScopedViewerWidget control whose effect lives outside the widget SHALL dispatch a `CanvasIntent` via the canvas orchestrator (the SAME intent the equivalent LLM tool emits) rather than rely on a callback prop the `{ scope, role }` mount contract cannot supply. The render-to-builder
edit-section control SHALL dispatch the `editTemplate` intent (the
`show_smart_report_edit` intent); the report builder SHALL pre-open the targeted
section from `session.selectedReportSectionId` when no `selectedSectionId` prop
is supplied, so the hand-off completes on the live `<ScopedCanvas>` path.

#### Scenario: Edit-section reaches the builder with the section pre-opened

- **GIVEN** the report render surface (f4) mounted via `<ScopedCanvas>`
- **WHEN** the user clicks a section's `✎ edit §N` control
- **THEN** an `editTemplate` intent dispatches through the orchestrator, the
  canvas moves to the report builder (f4a / `report-builder`), and that section's
  inline editor is open — with no `onEditSection` host callback involved.

#### Scenario: Save-to-account reaches the gate from the Interact canvas

- **GIVEN** the Interact (f5) canvas (the shared `PdfViewer`) mounted via `<ScopedCanvas>`
- **WHEN** the `save_to_account` chat tool / chip fires
- **THEN** the sign-in gate opens via the orchestrator's `openGate` routing — the
  shared `PdfViewer` grows no onboarding-only Save affordance.

### Requirement: The orphaned per-frame onboarding views SHALL be removed

The standalone per-frame views (`UnderstandView`, `ExtractView`, `InteractView`, `IntegrateView`, `ReportRenderView`, `ReportBuilderView`) SHALL be deleted once the production ScopedViewerWidgets are the SOLE canvas surfaces — they
hold no production importers and their host wiring is superseded by the
orchestrator-driven controls above. No dead per-frame view SHALL remain as
"reference."

#### Scenario: No per-frame view file remains

- **WHEN** the onboarding canvas renders any frame
- **THEN** it mounts a production ScopedViewerWidget through `<ScopedCanvas>` and
  no `*View.tsx` per-frame view file exists under `views/Onboarding/`.
