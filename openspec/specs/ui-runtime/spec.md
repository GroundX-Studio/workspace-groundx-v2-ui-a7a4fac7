# ui-runtime Specification

## Purpose

Define the durable contract for the front-end runtime — pdfjs-dist
viewer behavior, Framer Motion choreography, react-hotkeys-hook
bindings, focus management, multi-doc navigation, and the step-strip
animation invariants the onboarding journey relies on.
## Requirements
### Requirement: Global hotkey surface SHALL bind cmd-K, Esc, etc. via react-hotkeys-hook

The product SHALL ship a global hotkey surface backed by
`react-hotkeys-hook` (per `memory/project_ui_runtime.md`). At minimum:
`cmd-K` opens the session switcher; `Esc` dismisses the topmost overlay.
Bindings SHALL respect `prefers-reduced-motion: reduce` for their
animation accompaniments and avoid trapping focus inside disabled
inputs.

#### Scenario: cmd-K opens the switcher; Esc closes overlays

- **GIVEN** the user is on any surface
- **WHEN** the user presses `cmd-K`
- **THEN** the session switcher opens
- **AND** pressing `Esc` closes the switcher
- **AND** pressing `Esc` with no overlay open SHALL be a no-op (not navigate away)

### Requirement: PdfViewerWidget SHALL accept a controlled targetPage prop

`PdfViewerWidget` SHALL accept an optional `targetPage?: number` prop
that, when changed by the caller, navigates the widget to that page
on the next render. `targetPage` overrides `initialPage` and follows
prop changes via effect. Thumb clicks still update an internal
`activePage` (so the user can browse freely after a programmatic
jump); a subsequent change to `targetPage` re-overrides.

#### Scenario: Controlled page navigation

- **GIVEN** `<PdfViewerWidget documentId="X" targetPage={1} />` mounted
- **WHEN** the parent re-renders with `targetPage={7}`
- **THEN** the page image switches to page 7
- **AND** the active thumb's highlight ring follows

### Requirement: PdfViewerWidget SHALL render a citation highlight overlay

`PdfViewerWidget` SHALL render an absolutely-positioned highlight
`<Box>` over the active page image when passed an optional
`highlightBbox?: { x: number; y: number; w: number; h: number }`
prop (values are 0–1 page-relative coordinates), positioned at the
corresponding `left`/`top`/`width`/`height` percentages. When
`highlightBbox` is `null` or omitted, no overlay SHALL render.
The overlay carries `data-testid="pdf-viewer-highlight"` for
end-to-end coverage.

#### Scenario: Highlight overlay positioned proportionally

- **GIVEN** `<PdfViewerWidget ... highlightBbox={{x:0.1,y:0.2,w:0.5,h:0.05}} />`
- **WHEN** the widget renders
- **THEN** a `pdf-viewer-highlight` overlay is positioned at `10% / 20%` with `50% / 5%` dimensions over the active page image

### Requirement: CanvasOrchestrator SHALL handle the highlightCitation intent end-to-end

`CanvasOrchestratorContext` SHALL register a handler for
`{ kind: "highlightCitation", documentId, page, bbox? }` that:

1. Sets the active viewer step to a `doc-viewer` for `documentId`,
   reusing the current step when the documentId matches (mutation) or
   pushing a new step otherwise.
2. Records `{ page, bbox?, sourceCitationIndex? }` as a `highlight`
   slot on the `doc-viewer` step.
3. Persists the mutation via the existing `patchChatSession` writer.

**Toggle:** when the intent is dispatched with `source: "user"` AND it matches
the active `doc-viewer` step's current highlight (same `documentId`, `page`, and
`bbox`), the handler SHALL CLEAR the highlight instead of re-applying it — so
clicking the active citation chip again dismisses the highlight (the doc page
stays shown; only the overlay is removed). A non-matching citation switches as
before. An `agent`-sourced highlight (the automatic "show the answer's source")
SHALL always set and never toggle.

The `CiteChip` component's existing dispatch SHALL no longer be
silent — the handler is the canonical sink. The pre-UI-04 Popover
fallback in `CiteChip` is RETIRED.

#### Scenario: Dispatching highlightCitation while showing a different document

- **GIVEN** the active viewer step is `doc-viewer(documentId: A)`
- **WHEN** `dispatch({ kind: "highlightCitation", documentId: "B", page: 3 })` fires
- **THEN** a new `doc-viewer(documentId: B, highlight: { page: 3 })` step is pushed
- **AND** the persisted viewer-state PATCH includes the new step

#### Scenario: Clicking the active citation again toggles the highlight off

- **GIVEN** the active `doc-viewer` step's highlight is `{ page: 3, bbox: B }` for document A
- **WHEN** the user clicks that same citation chip again (`dispatch({ kind: "highlightCitation", documentId: A, page: 3, bbox: B }, "user")`)
- **THEN** the step's `highlight` is cleared (no overlay) while the doc page A stays shown
- **AND** a subsequent identical user click re-applies the highlight

#### Scenario: Agent auto-highlight never toggles

- **GIVEN** the active step's highlight already matches an answer's primary citation
- **WHEN** the auto-highlight dispatches it again with `source: "agent"`
- **THEN** the highlight remains set (it is NOT cleared)

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

