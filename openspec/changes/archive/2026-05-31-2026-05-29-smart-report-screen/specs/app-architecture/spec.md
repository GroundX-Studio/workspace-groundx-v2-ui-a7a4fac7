# Spec Delta — app-architecture

Wires the Report chapter into the frame model and the shell canvas, defines the `ScopedViewerWidget`
class the main viewer surfaces share, and corrects the step-strip pill so Report is reachable (anon
previews) rather than auth-disabled.

## ADDED Requirements

### Requirement: The frame model SHALL include a report builder frame f4a

`FFrame` SHALL include `f4a` (the report builder / S3a), alongside the existing `f4` (the report
render / S3). `f4` SHALL route the shell canvas to the report **render** surface and `f4a` to the
report **builder** surface — `f4` SHALL NOT render the extract workbench. Advancing
`f4 → f4a` (via a section's edit affordance or `show_smart_report_edit`) and returning `f4a → f4`
(via `← back`) SHALL mirror the F3 ↔ F3a navigation.

#### Scenario: f4 renders report, f4a renders builder

- **GIVEN** the active frame is `f4`
- **WHEN** the shell resolves the canvas
- **THEN** it renders the report render surface (not the extract workbench)
- **AND** **WHEN** the frame is `f4a`
- **THEN** it renders the report builder surface.

### Requirement: SmartReport SHALL build on the shared ScopedViewerWidget base

SmartReport's render and builder widgets SHALL build on the `ScopedViewerWidget` base — each taking a
real `ContentScope` `scope` (plus `role: WidgetRole` per `widget-role-access`), adapting when the
scope changes (re-render in place, not a remount fork) across the full scope union (`bucket` ·
`bucket+filter` · `documents[]` · `documents[]+filter` · `group` · `group+filter`), and registering
its `show_smart_report_render` / `show_smart_report_edit` tools. The `ScopedViewerWidget` base
class/object + registry + its structural contract test are **owned by `core-data-model-hardening`**
(which establishes that the four main viewer widgets — PdfViewer, Extract, SmartReport, Integrate —
each build on a common base): this change does NOT re-declare that contract, it CONSUMES it.
Dependency: blocks on the base landing in `core-data-model-hardening`.

#### Scenario: SmartReport adapts to a scope change on the shared base

- **GIVEN** the SmartReport render widget mounted with a `bucket + project filter` scope on the shared base
- **WHEN** the scope prop changes (e.g. to `documents[]` or a `group`)
- **THEN** the widget re-renders against the new scope without a remount fork
- **AND** the widget exposes its `show_smart_report_render` canvas-dispatch tool via the shared registry.

### Requirement: The Report sub-pill SHALL be reachable for all scenarios

The Report step-strip / nav sub-pill SHALL be reachable (clickable, advancing the canvas to `f4`) for
**all scenarios** — Report is a general capability over the active `ContentScope`, not a per-scenario
feature. The hard-coded always-disabled state (`reportActive = false`) SHALL be removed. Reachability
SHALL NOT depend on `chapters.report` (which, if retained, only flavors guided-demo emphasis) and
SHALL NOT be auth-gated — anonymous users reach Report and preview it (Save/Export/BYO gate per the
`smart-report` contract, mirroring Extract).

#### Scenario: Report pill is reachable on every scenario, including for anon

- **GIVEN** any scenario (Utility, Loan, Solar) and an anonymous user
- **WHEN** the step strip renders
- **THEN** the Report sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** clicking it advances the canvas to `f4` and previews the report.

## MODIFIED Requirements

### Requirement: Step-strip sub-pills SHALL be keyboard-navigable when reachable

The step-strip Extract / Interact / Report sub-pills SHALL each render with `role="button"`,
`tabindex="0"` when reachable, and an `onClick` handler that advances the canvas to the corresponding
frame. Disabled sub-pills MUST carry `aria-disabled="true"` and MUST NOT receive focus. Report is a
general capability and SHALL be reachable for anonymous users (it previews like Extract); it SHALL
NOT be treated as auth-disabled. Sign-in gating applies to report **actions** (Save / Export / BYO
scope) via the shared gate, not to the pill.

#### Scenario: Reachable sub-pill is clickable + focusable

- **GIVEN** the user has reached the Analyze step (Extract is the active sub-step)
- **WHEN** the step strip renders
- **THEN** the `Extract` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** the `Interact` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** clicking `Interact` advances the canvas to F5 InteractView.

#### Scenario: Report is reachable for anon (preview), gated only on actions

- **GIVEN** an anonymous user who has reached the Analyze step
- **WHEN** the step strip renders
- **THEN** the `Report` sub-pill has `role="button"`, `tabindex="0"`, and is clickable
- **AND** clicking it advances to `f4` and previews the report
- **AND** Save / Export / rendering a BYO scope trigger the sign-in gate (not the pill).
