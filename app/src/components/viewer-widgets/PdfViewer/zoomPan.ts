import type { ContainContentRect } from "./overlayGeometry";

/**
 * Pure zoom/pan math for the document viewer (add-pdf-zoom-pan).
 *
 * The viewer applies `transform: translate(pan) scale(zoom)` with
 * `transform-origin: center` to a stage that fills the pane. The screen
 * position of a stage-local point is therefore:
 *
 *   screen = center + (point - center) * zoom + pan
 *
 * These helpers carry the bug-prone arithmetic (jsdom has no layout, so the
 * component test can't catch a wrong formula — this is where it's pinned).
 */

export const ZOOM_MIN = 1; // Fit (whole page)
export const ZOOM_MAX = 3; // 300% — the crisp limit of the high-res raster
export const ZOOM_STEP = 0.25;

export interface Vec2 {
  x: number;
  y: number;
}
export interface Size {
  w: number;
  h: number;
}

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

export function stepZoom(z: number, dir: "in" | "out"): number {
  return clampZoom(dir === "in" ? z + ZOOM_STEP : z - ZOOM_STEP);
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * Clamp a pan offset so the scaled page can never be dragged fully out of the
 * pane. The pannable range on each axis is half the amount the scaled content
 * overflows the pane; at zoom 1 (or before the content is measured) there is
 * nothing to pan, so pan is forced to {0,0}.
 */
export function clampPan(
  pan: Vec2,
  zoom: number,
  pane: Size,
  content: ContainContentRect | null,
): Vec2 {
  if (!content || zoom <= ZOOM_MIN) return { x: 0, y: 0 };
  const maxX = Math.max(0, (content.width * zoom - pane.w) / 2);
  const maxY = Math.max(0, (content.height * zoom - pane.h) / 2);
  return { x: clamp(pan.x, -maxX, maxX), y: clamp(pan.y, -maxY, maxY) };
}

/**
 * Zoom to `nextZoom` (clamped) while keeping the content point currently under
 * `pointer` (pane-relative px) fixed on screen. Returns the new zoom + the
 * adjusted pan (the caller is responsible for `clampPan`).
 *
 * From `screen = center + (point - center) * zoom + pan`, holding `screen`
 * (the cursor) constant gives:
 *   panNext = pan - (pointer - center - pan) * (zoom - prevZoom) / prevZoom
 */
export function zoomAtPoint(
  prevZoom: number,
  nextZoom: number,
  pointer: Vec2,
  pan: Vec2,
  pane: Size,
): { zoom: number; pan: Vec2 } {
  const zoom = clampZoom(nextZoom);
  const center = { x: pane.w / 2, y: pane.h / 2 };
  const factor = prevZoom > 0 ? (zoom - prevZoom) / prevZoom : 0;
  return {
    zoom,
    pan: {
      x: pan.x - (pointer.x - center.x - pan.x) * factor,
      y: pan.y - (pointer.y - center.y - pan.y) * factor,
    },
  };
}
