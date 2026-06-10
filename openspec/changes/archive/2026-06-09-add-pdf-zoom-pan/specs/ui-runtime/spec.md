# Spec Delta — ui-runtime

## ADDED Requirements

### Requirement: PdfViewerWidget SHALL provide zoom and pan controls

`PdfViewerWidget` SHALL let the user zoom the page from **Fit (whole page,
zoom = 1)** to **300% (zoom = 3)** in **25% steps**, and pan when zoomed in.

It SHALL render an inline control cluster — zoom out, current level, zoom in,
and Fit — built from existing primitives and design tokens (no hardcoded style
literals). The controls SHALL NOT be extracted into a separate reusable
component while `PdfViewerWidget` is the only caller.

The page image and its citation / lit-region overlays SHALL share a single
transform layer so overlays stay aligned with the page at any zoom level.

The feature SHALL be available on both surfaces the viewer appears on: the
desktop side-by-side canvas and the mobile single-pane.

#### Scenario: Zoom in magnifies the page

- **GIVEN** `<PdfViewerWidget>` showing a page at Fit (zoom 1)
- **WHEN** the user activates the zoom-in control
- **THEN** the page is rendered at a larger scale (zoom 1.25)
- **AND** the zoom level indicator reflects the new level
- **AND** the zoom-out and Fit controls become enabled

#### Scenario: Zoom is bounded to Fit–300%

- **GIVEN** the viewer at zoom 3 (300%)
- **WHEN** the user activates zoom-in again
- **THEN** the zoom stays at 3 and the zoom-in control is disabled
- **AND** at Fit (zoom 1) the zoom-out control is disabled

#### Scenario: Citation highlight stays aligned when zoomed

- **GIVEN** a citation highlight rendered over the cited region at Fit
- **WHEN** the user zooms to 200%
- **THEN** the highlight overlay scales and moves with the page and remains
  positioned over the same cited region

### Requirement: Viewer pan SHALL use explicit gestures only — plain scroll never pans

Panning SHALL be available **only when zoomed in (zoom > 1)** and SHALL be
driven by explicit gestures: dragging the page, **Ctrl/Cmd + wheel** to zoom
toward the cursor, and the keyboard (`+` / `-` / `0`) when the viewer is
focused. A **plain wheel / scroll SHALL NOT pan or zoom** the page. A drag that
begins on a control or a citation chip SHALL NOT pan.

#### Scenario: Plain scroll does nothing

- **GIVEN** the viewer at any zoom level
- **WHEN** the user scrolls the wheel without a modifier key
- **THEN** the page does not pan and the zoom does not change

#### Scenario: Drag pans only when zoomed

- **GIVEN** the viewer at Fit (zoom 1)
- **WHEN** the user drags on the page
- **THEN** nothing pans
- **GIVEN** the viewer at 200%
- **WHEN** the user drags on the page (not starting on a control or chip)
- **THEN** the page pans, clamped so it can never be dragged fully out of view

### Requirement: Zoom SHALL reset to Fit on navigation

Zoom and pan are ephemeral view state. They SHALL reset to Fit (zoom 1, pan 0)
whenever the active page changes, the document changes, or a citation is opened
(via a chip, the auto-highlight on an answer, or "Show all sources"). They SHALL
NOT be persisted across sessions.

#### Scenario: Opening a citation resets zoom to Fit

- **GIVEN** the user has zoomed the viewer to 250%
- **WHEN** a citation is opened (chip click, answer auto-highlight, or "Show all sources")
- **THEN** the viewer resets to Fit and shows the cited page with the highlight visible
