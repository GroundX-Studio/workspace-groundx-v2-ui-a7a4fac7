# Spec Delta — smart-report (initial-render round-trip + live verify)

Routes the render surface's INITIAL paint through the render endpoint (closing the client↔server
round-trip for the surface the user sees first) and locks the loading/empty/error first-paint
lifecycle. Phase 7 (live multi-doc Solar render) stays out of scope, blocked on WF-10.

## MODIFIED Requirements

### Requirement: The report render surface (frame f4 / S3) SHALL stream ordered, cited sections

The render surface SHALL obtain its rendered report from the render endpoint
(`POST /api/widgets/smart-report/reports/render`) on its **initial** paint — not from a synchronous
client-side fixture read — so the surface the user first sees on frame `f4` is the endpoint response
(the same path the `↻ re-render` control and the builder Save already use). It SHALL display the
rendered report as its template's sections in order, each with a heading, a body formatted per
`renderAs`, and inline citations using the shared `CiteChip` (honoring the WF-06b tiers); sections
SHALL stream in render order; and each section heading SHALL carry an **✎ edit §N** affordance that
navigates to the builder (frame `f4a`) with that section pre-selected. While the initial render is in
flight the surface SHALL show a visible loading state; if the endpoint returns no renderable report
for the scope it SHALL show the empty state; if the initial render call fails it SHALL show a
retryable error affordance rather than a blank surface or a thrown render. (MOCK_MODE backs the
endpoint response; the live multi-document fan-out remains deferred to WF-10.)

#### Scenario: Initial paint renders the endpoint response

- **GIVEN** the user reaches the Report render surface on frame `f4`
- **WHEN** the surface mounts
- **THEN** it calls `POST /api/widgets/smart-report/reports/render` for its initial report (not a synchronous fixture read)
- **AND** on the response the sections render in order with headings, `renderAs`-formatted bodies, and `CiteChip`s
- **AND** each heading exposes an edit affordance that opens frame `f4a` with that section selected.

#### Scenario: Initial render degrades through loading, empty, and error

- **GIVEN** the initial render call to the endpoint
- **WHEN** the call is in flight
- **THEN** the surface shows a visible loading state (not a blank surface)
- **AND** **WHEN** the endpoint returns no renderable report for the scope
- **THEN** the surface shows the empty state
- **AND** **WHEN** the initial render call fails
- **THEN** the surface shows a retryable error affordance and does not throw.

#### Scenario: Initial paint and re-render share one fetch path

- **GIVEN** the render surface
- **WHEN** the initial paint and a later `↻ re-render` both resolve their report
- **THEN** both come from the same `POST /api/widgets/smart-report/reports/render` call path
- **AND** no synchronous client-side fixture-read survives as the surface's first-paint source.

## ADDED Requirements

### Requirement: The live multi-document render (Phase 7) SHALL remain deferred to WF-10

The live multi-document render path SHALL remain NOT built until WF-10 (real Solar source assets)
lands. That path fans each section's `question` through `search_groundx` (scoped by the section's
`ContentScope`) with grounded generation and WF-06b verification against real documents, including the
Solar multi-document / multi-project / multi-workspace render. The MOCK_MODE fixtures SHALL remain the
offline render path, and the render surface SHALL serve the live multi-document case with no surface
rework once WF-10 lands.

#### Scenario: Multi-doc live render is not attempted before WF-10

- **GIVEN** WF-10 (real Solar source assets) has not landed
- **WHEN** the report surface renders any scope
- **THEN** the report is sourced from the MOCK_MODE-backed render endpoint, not a live `search_groundx` fan-out
- **AND** the render surface requires no rework to serve the live multi-document case once WF-10 lands.
