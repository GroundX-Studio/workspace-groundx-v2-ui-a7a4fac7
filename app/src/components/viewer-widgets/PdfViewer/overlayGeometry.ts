import type { NormalizedBbox } from "@groundx/shared";

/**
 * Geometry for citation/lit-region overlays on top of an `object-fit: contain`
 * page image.
 *
 * The bug this fixes (extract-screen-audit / citations): the overlay used to be
 * positioned as a percentage of a `position:relative` wrapper whose rendered
 * height did NOT match the page image's rendered height (the image overflowed
 * because a percentage `max-height` against an auto-height inline-block parent
 * is ignored). So a citation at `y:0.69` of the page landed ~25% of the page
 * height too high.
 *
 * The page is now drawn with `object-fit: contain` filling a measured box, and
 * the overlay is positioned in PX against the actual contained content rect.
 * These pure helpers are the math; they carry the test coverage a jsdom render
 * (no layout) cannot.
 */

export interface ContainContentRect {
  /** px offset of the contained image's left edge inside the box. */
  offsetX: number;
  /** px offset of the contained image's top edge inside the box. */
  offsetY: number;
  /** px width of the contained image. */
  width: number;
  /** px height of the contained image. */
  height: number;
}

/**
 * The rect (px, relative to the box's top-left) that an `object-fit: contain`
 * image of natural size `pageW × pageH` actually occupies inside a
 * `boxW × boxH` container. Returns `null` when any dimension is non-positive
 * (e.g. before the container is measured), so callers can fall back.
 */
export function containContentRect(
  boxW: number,
  boxH: number,
  pageW: number,
  pageH: number,
): ContainContentRect | null {
  if (!(boxW > 0) || !(boxH > 0) || !(pageW > 0) || !(pageH > 0)) return null;
  const scale = Math.min(boxW / pageW, boxH / pageH);
  const width = pageW * scale;
  const height = pageH * scale;
  return {
    offsetX: (boxW - width) / 2,
    offsetY: (boxH - height) / 2,
    width,
    height,
  };
}

export interface OverlayPxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Map a 0–1 page-relative bbox to a px rect inside the contained content rect.
 * This is what places a citation highlight exactly over the cited region.
 *
 * `padPx` grows the rect outward by that many px on every side (default 0) so a
 * highlight border doesn't sit right on the glyphs — the padded rect is clamped
 * to the contained page so it never spills outside the image.
 */
export function overlayPxRect(
  bbox: NormalizedBbox,
  content: ContainContentRect,
  padPx = 0,
): OverlayPxRect {
  const left = content.offsetX + bbox.x * content.width;
  const top = content.offsetY + bbox.y * content.height;
  const width = bbox.w * content.width;
  const height = bbox.h * content.height;
  if (!padPx) return { left, top, width, height };
  const minX = content.offsetX;
  const minY = content.offsetY;
  const maxX = content.offsetX + content.width;
  const maxY = content.offsetY + content.height;
  const l = Math.max(minX, left - padPx);
  const t = Math.max(minY, top - padPx);
  const r = Math.min(maxX, left + width + padPx);
  const b = Math.min(maxY, top + height + padPx);
  return { left: l, top: t, width: r - l, height: b - t };
}
