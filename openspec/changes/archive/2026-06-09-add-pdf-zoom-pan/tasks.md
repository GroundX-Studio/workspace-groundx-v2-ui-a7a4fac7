# Tasks — add-pdf-zoom-pan

Every task is **SEQUENTIAL**: it must finish and pass its adversarial review
gate before the next one starts. The list begins with a failing user-visible
test (discipline §9 / principle 2).

## Task 1 — Failing user-visible test first  [SEQUENTIAL]

Write a `PdfViewerWidget` test (Testing Library) that drives the new behavior
from the user's point of view and **fails today**:

- clicking the zoom-in control magnifies the page (the page image / transform
  layer reports a scale > 1);
- the citation highlight overlay is still present and inside the zoomed layer;
- when zoomed, a drag moves the page (pan changes); plain scroll does not.

**Adversarial review gate:** the test is genuinely red, and red for the right
reason (no zoom controls exist yet) — not a typo/import failure. It asserts
user-visible behavior, not an internal seam.

## Task 2 — Pure zoom/pan math: `PdfViewer/zoomPan.ts`  [SEQUENTIAL]

Implement and unit-test the pure helper: `ZOOM_MIN=1`, `ZOOM_MAX=3`,
`ZOOM_STEP=0.25`; `clampZoom`, `stepZoom(z, dir)`, `clampPan(pan, zoom,
paneSize, contentRect)` (the scaled page can never be dragged fully out of the
pane; pan is forced to 0 at zoom 1), and `zoomAtPoint(prevZoom, nextZoom,
pointer, pan, contentRect)` (the point under the cursor stays fixed).

**Adversarial review gate:** falsify the math — the cursor point is invariant
under `zoomAtPoint`; `clampPan` keeps the page on screen and zeroes pan at
fit; bounds are inclusive; no NaN on a zero-size pane. Tests failed first.

## Task 3 — Zoom state + transform layer + inline controls + reset-on-nav  [SEQUENTIAL]

In `PdfViewerWidget`: add local `{ zoom, pan }` state; wrap the page image AND
the highlight/lit-region overlays in one transform layer
(`translate(pan) scale(zoom)`); render the **inline** control cluster (zoom
out / level / zoom in / Fit) using existing primitives and design tokens; add
an effect that resets `{ zoom: 1, pan: 0 }` when `activePage`, `documentId`,
or `highlightBbox` changes.

**Adversarial review gate:** every existing `PdfViewerWidget` test stays green
(highlight + lit-regions still render); overlays are children of the
transformed node; Fit and citation-jump both reset to fit; `overlayGeometry`
is unchanged; `no-hardcoded-styles` and `widget-contract` guards pass.

## Task 4 — Interactions: drag-pan, modifier-wheel, no plain-scroll, keyboard  [SEQUENTIAL]

Wire the inputs: drag-to-pan **only when zoom > 1** (ignore pointer-downs that
start on a control or a citation chip; clean up pointer capture); **Ctrl/Cmd +
wheel** → `zoomAtPoint`; **plain wheel/scroll is a no-op**; keyboard `+` / `-`
/ `0` when the viewer is focused. No pinch.

**Adversarial review gate:** assert plain scroll changes nothing (the original
complaint); a drag never swallows a citation-chip click; touch works via
pointer events; listeners are removed on unmount.

## Task 5 — Make the user-visible test green + cross-surface + browser verify  [SEQUENTIAL]

Bring Task 1's test to green. Verify in a real browser (Chrome DevTools) at
1× / 2× / 3× that the page zooms, drags, and that the citation highlight still
sits exactly on the cited text when zoomed (measured, not assumed). Confirm it
works on desktop side-by-side and the mobile single-pane.

**Adversarial review gate:** browser-measured overlay alignment at 2×/3×; full
`app` + `middleware` vitest suites, ESLint, and `npm run build` green;
`openspec validate --all --strict` passes; then archive the change and update
the `project_citation_highlight` memory.

## Definition of done

All five gates passed; Task 1's user-visible test green and browser-confirmed;
suites + lint + build green; `openspec validate` clean; change archived; pdfjs
recorded as the Phase-2 follow-up (no dormant code shipped).
