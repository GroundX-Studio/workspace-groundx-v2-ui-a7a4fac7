/**
 * WF-01b / WF-03 — derive PdfViewer `litRegions` from an assistant turn's
 * citations. Each citation → one lit region, color-keyed (idx 0 = green
 * primary, last = coral, middle = cyan). When a citation carries a real
 * `bbox` (WF-03 populates these off the search result), it is used verbatim;
 * otherwise a best-effort top-of-page band is drawn as a fallback.
 */

import type { NormalizedBbox } from "@groundx/shared";

export type LitRegionColor = "green" | "cyan" | "coral";

export interface LitRegion {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: LitRegionColor;
}

interface CitationLike {
  page: number;
  bbox?: NormalizedBbox;
}

export function litRegionsFromCitations(citations: readonly CitationLike[]): LitRegion[] {
  return citations.map((c, idx) => {
    const last = idx === citations.length - 1;
    const color: LitRegionColor = idx === 0 ? "green" : last ? "coral" : "cyan";
    // Real geometry (WF-03) wins; fallback band only when bbox is absent.
    const bbox = c.bbox ?? { x: 0.05, y: 0.08 + idx * 0.12, w: 0.5, h: 0.05 };
    return { page: c.page, x: bbox.x, y: bbox.y, w: bbox.w, h: bbox.h, color };
  });
}
