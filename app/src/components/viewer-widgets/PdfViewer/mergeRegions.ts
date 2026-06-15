/**
 * multi-region-citations P2.1 (display refinement) — combine ADJACENT highlight
 * regions for rendering.
 *
 * A "show every occurrence" citation can resolve to dozens of regions: the same
 * source chunk gets matched by several cited values (duplicate, exactly-
 * overlapping boxes), and genuinely contiguous runs (e.g. a column of table
 * rows) produce stacks of touching boxes. Drawing each one floods the page.
 *
 * This merges OVERLAPPING or near-touching SAME-TIER regions into their bounding
 * box so the overlay reads as a few clean regions, while DISTINCT (non-adjacent)
 * occurrences stay separate — it never unions the whole page into one envelope.
 * It is a RENDER-time transform only: the citation's underlying `regions` (the
 * proof set) are unchanged.
 */
import type { NormalizedBbox } from "@groundx/shared";

import type { CitationTier } from "@/types/onboarding";

export interface MergeableRegion {
  page: number;
  bbox: NormalizedBbox;
  tier?: CitationTier;
}

/**
 * Normalized-coordinate gap below which two boxes count as "adjacent". ~0.6% of
 * the page (≈13px on a 2200px-tall page) — enough to fuse touching line/row
 * boxes and exact duplicates, small enough to keep clearly-separated rows apart.
 */
const ADJACENCY_GAP = 0.006;

/**
 * A connected component only merges into its bounding box when the member boxes
 * actually FILL it (their combined area is at least this fraction of the
 * bounding box). A sparse/L-shaped chain (boxes that connect transitively but
 * leave most of the bounding box empty) stays as its individual boxes — so the
 * merge can't re-create the loose "single enclosing envelope" this whole change
 * moved away from. Duplicates/overlaps and tight rows easily clear it.
 */
const MIN_FILL_RATIO = 0.5;

/**
 * Defensive cap: merging is O(n²) per page+tier group, and the citation region
 * count is intentionally uncapped. Above this many regions on one page, skip the
 * pairwise merge (render them as-is) rather than risk a CPU spike — realistic
 * post-dedupe counts are far below it.
 */
const MAX_MERGE_INPUT = 500;

function isAdjacent(a: NormalizedBbox, b: NormalizedBbox): boolean {
  // Overlap test with each side expanded by the gap (so touching boxes count).
  return (
    a.x - ADJACENCY_GAP < b.x + b.w &&
    b.x - ADJACENCY_GAP < a.x + a.w &&
    a.y - ADJACENCY_GAP < b.y + b.h &&
    b.y - ADJACENCY_GAP < a.y + a.h
  );
}

/**
 * O(n) fallback for an implausibly large region set: snap each box to a coarse
 * grid cell (by its top-left) and union boxes that land in the same page+tier+
 * cell. Bounds BOTH the CPU (no O(n²) pairwise scan) AND the rendered box count
 * (≤ the number of occupied cells), so a degenerate citation can't flood the
 * overlay. Realistic post-dedupe sets never reach this path.
 */
function coarseBucketMerge(regions: readonly MergeableRegion[]): MergeableRegion[] {
  const GRID = 0.1;
  const cells = new Map<string, { page: number; tier?: CitationTier; minX: number; minY: number; maxX: number; maxY: number }>();
  for (const r of regions) {
    const key = `${r.page}|${r.tier ?? ""}|${Math.floor(r.bbox.x / GRID)}|${Math.floor(r.bbox.y / GRID)}`;
    const x2 = r.bbox.x + r.bbox.w;
    const y2 = r.bbox.y + r.bbox.h;
    const c = cells.get(key);
    if (c) {
      c.minX = Math.min(c.minX, r.bbox.x);
      c.minY = Math.min(c.minY, r.bbox.y);
      c.maxX = Math.max(c.maxX, x2);
      c.maxY = Math.max(c.maxY, y2);
    } else {
      cells.set(key, { page: r.page, tier: r.tier, minX: r.bbox.x, minY: r.bbox.y, maxX: x2, maxY: y2 });
    }
  }
  return [...cells.values()].map((c) => ({
    page: c.page,
    tier: c.tier,
    bbox: { x: c.minX, y: c.minY, w: c.maxX - c.minX, h: c.maxY - c.minY },
  }));
}

export function mergeAdjacentRegions(regions: readonly MergeableRegion[]): MergeableRegion[] {
  // Defensive: above the cap, fall back to the O(n) coarse-grid merge — it bounds
  // both the CPU and the rendered box count (the O(n²) pairwise pass below would
  // spike, and rendering every box would flood the overlay).
  if (regions.length > MAX_MERGE_INPUT) return coarseBucketMerge(regions);
  // Only ever merge within the same page + tier (an `exact` word box must not
  // be swallowed by a looser `paraphrase` chunk box).
  const groups = new Map<string, MergeableRegion[]>();
  for (const r of regions) {
    const key = `${r.page}|${r.tier ?? ""}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const out: MergeableRegion[] = [];
  for (const group of groups.values()) {
    // Union-find over adjacency → connected components, each → its bounding box.
    const parent = group.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (isAdjacent(group[i].bbox, group[j].bbox)) parent[find(i)] = find(j);
      }
    }
    const comps = new Map<number, MergeableRegion[]>();
    for (let i = 0; i < group.length; i++) {
      const root = find(i);
      const c = comps.get(root);
      if (c) c.push(group[i]);
      else comps.set(root, [group[i]]);
    }
    for (const comp of comps.values()) {
      // A lone region passes through UNCHANGED (no bounding-box recompute → no
      // floating-point drift on its exact coords).
      if (comp.length === 1) {
        out.push(comp[0]);
        continue;
      }
      const minX = Math.min(...comp.map((r) => r.bbox.x));
      const minY = Math.min(...comp.map((r) => r.bbox.y));
      const maxX = Math.max(...comp.map((r) => r.bbox.x + r.bbox.w));
      const maxY = Math.max(...comp.map((r) => r.bbox.y + r.bbox.h));
      const boundingArea = (maxX - minX) * (maxY - minY);
      // Combined member area (overlaps over-count, which is correct — heavily
      // overlapping/duplicate boxes SHOULD merge). Sparse chains fall below the
      // fill floor → keep their individual boxes instead of one loose envelope.
      const memberArea = comp.reduce((s, r) => s + r.bbox.w * r.bbox.h, 0);
      if (boundingArea > 0 && memberArea / boundingArea < MIN_FILL_RATIO) {
        out.push(...comp);
        continue;
      }
      out.push({
        page: comp[0].page,
        tier: comp[0].tier,
        bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      });
    }
  }
  return out;
}
