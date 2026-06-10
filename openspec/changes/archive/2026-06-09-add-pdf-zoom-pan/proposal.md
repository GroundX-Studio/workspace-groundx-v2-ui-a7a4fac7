# Add pan & zoom to the document viewer

## Why

The document viewer (`PdfViewerWidget`) shows a page image scaled to fit the
pane, with no way to zoom in. Fine print on dense documents (utility bills,
contracts) is hard to read, and there is no way to inspect a cited region up
close. We want pan and zoom — done in a way that keeps the existing citation
highlights perfectly aligned and does not reintroduce the accidental
scroll-pan the user previously rejected.

## What changes

A renderer-agnostic zoom/pan layer is added to `PdfViewerWidget`:

- Zoom from **Fit (whole page) to 300%** in **25% steps**.
- An on-screen control cluster: zoom out, current level, zoom in, Fit.
- **Drag to pan** only when zoomed in (zoom > 1). **Ctrl/Cmd + wheel** zooms
  toward the cursor. **Plain scroll does nothing** — the page never moves by
  accident.
- Keyboard: `+` / `-` / `0` (fit) when the viewer is focused.
- The page image and its citation/lit-region overlays live inside one
  transform layer, so highlights stay pixel-aligned at any zoom.
- Zoom **resets to Fit on navigation** — changing page, document, or opening a
  citation always lands on the whole page with the highlight visible.
- Works on both surfaces the viewer appears in: desktop side-by-side and the
  mobile single-pane.

The zoom math (clamp, pan bounds, pointer-anchored zoom) lives in one pure,
unit-tested helper (`PdfViewer/zoomPan.ts`).

## Scope

**In:** the zoom/pan layer, the inline controls, the interactions above, the
reset-on-navigation behavior, and tests (unit + component + browser).

**Out (tracked, not built):** `pdfjs-dist` as a future crisp-render / text-layer
surface. The raster page image stays the universal render surface (GroundX
rasterizes every doc type). pdfjs would later slot in *behind this same
transform + overlay layer* for PDF sources only, gated on a real need for text
selection, find-in-page, an accessibility text layer, or crisp zoom past ~3×.
Recorded here as the Phase-2 follow-up; no dormant code is added now.

## Conformance to core architectural decisions

- **Principle 1 — composable, not forked.** No new forked viewer. Zoom/pan is
  added to the existing `PdfViewerWidget` (the `ScopedViewerWidget`). The one
  genuine axis is the **render surface**: a transform + overlay layer that is
  renderer-agnostic, so pdfjs can later replace the `<img>` with a `<canvas>`
  behind the same layer. **Earn-every-axis guardrail honored:** the zoom
  controls are built **inline and concrete** in `PdfViewerWidget` — NOT
  extracted into a speculative reusable `ZoomToolbar` component, because there
  is only one caller. If a second caller ever needs the controls, extract then.
- **Principle 5 — done = user-visible.** Done is defined by a browser-verified
  user-visible behavior (zoom magnifies the page; highlight stays on the cited
  text at 2×/3×), not a seam. Zoom is **ephemeral view state** held locally in
  the component and reset on navigation — it is not app-owned persisted data,
  so there is no persistence and therefore no round-trip obligation. This is
  intentional, not missing plumbing.
- **Principle 6 — one source of truth, one planning surface.** Zoom/pan is
  pure front-end view state that never crosses the wire, so it needs no
  `@groundx/shared` Zod type (adding one would be a twin definition for no
  consumer). The existing `overlayGeometry` helper is reused unchanged.
  Planning lives only in this OpenSpec change.
