import { describe, expect, it } from "vitest";

import { mergeAdjacentRegions, type MergeableRegion } from "./mergeRegions";

const r = (page: number, x: number, y: number, w: number, h: number, tier?: MergeableRegion["tier"]): MergeableRegion => ({
  page,
  bbox: { x, y, w, h },
  tier,
});

describe("mergeAdjacentRegions (combine adjacent highlight boxes for display)", () => {
  it("collapses exact-duplicate boxes (same chunk matched by several values) into one", () => {
    const merged = mergeAdjacentRegions([
      r(2, 0.1, 0.2, 0.3, 0.04, "paraphrase"),
      r(2, 0.1, 0.2, 0.3, 0.04, "paraphrase"),
      r(2, 0.1, 0.2, 0.3, 0.04, "paraphrase"),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].bbox.x).toBeCloseTo(0.1, 6);
    expect(merged[0].bbox.y).toBeCloseTo(0.2, 6);
    expect(merged[0].bbox.w).toBeCloseTo(0.3, 6);
    expect(merged[0].bbox.h).toBeCloseTo(0.04, 6);
  });

  it("merges overlapping boxes into their bounding box", () => {
    const merged = mergeAdjacentRegions([
      r(2, 0.1, 0.2, 0.2, 0.1, "paraphrase"),
      r(2, 0.25, 0.25, 0.2, 0.1, "paraphrase"), // overlaps the first
    ]);
    expect(merged).toHaveLength(1);
    // bounding of (0.1,0.2)-(0.45,0.35)
    expect(merged[0].bbox.x).toBeCloseTo(0.1, 6);
    expect(merged[0].bbox.y).toBeCloseTo(0.2, 6);
    expect(merged[0].bbox.w).toBeCloseTo(0.35, 6);
    expect(merged[0].bbox.h).toBeCloseTo(0.15, 6);
  });

  it("fuses near-touching boxes (within the adjacency gap), e.g. stacked table rows", () => {
    const merged = mergeAdjacentRegions([
      r(2, 0.1, 0.20, 0.3, 0.03, "paraphrase"),
      r(2, 0.1, 0.235, 0.3, 0.03, "paraphrase"), // ~0.005 gap below → adjacent
    ]);
    expect(merged).toHaveLength(1);
  });

  it("keeps DISTINCT (clearly separated) occurrences separate — no whole-page union", () => {
    const merged = mergeAdjacentRegions([
      r(2, 0.1, 0.1, 0.2, 0.04, "paraphrase"),
      r(2, 0.1, 0.8, 0.2, 0.04, "paraphrase"), // far below → distinct
    ]);
    expect(merged).toHaveLength(2);
  });

  it("never merges across tiers (an exact word box is not swallowed by a paraphrase chunk box)", () => {
    const merged = mergeAdjacentRegions([
      r(2, 0.1, 0.2, 0.3, 0.1, "paraphrase"),
      r(2, 0.12, 0.22, 0.05, 0.02, "exact"), // sits inside the paraphrase box but different tier
    ]);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.tier).sort()).toEqual(["exact", "paraphrase"]);
  });

  it("never merges across pages", () => {
    const merged = mergeAdjacentRegions([
      r(1, 0.1, 0.2, 0.3, 0.04, "paraphrase"),
      r(2, 0.1, 0.2, 0.3, 0.04, "paraphrase"),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("leaves a single whole-page ambient region untouched", () => {
    const merged = mergeAdjacentRegions([r(2, 0, 0, 1, 1, "ambient")]);
    expect(merged).toHaveLength(1);
    expect(merged[0].bbox).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("does NOT merge a sparse/L-shaped chain into one loose envelope (fill-ratio guard)", () => {
    // A horizontal bar + a vertical bar touching at the corner: connected, but
    // their bounding box is mostly empty → keep them as two boxes.
    const merged = mergeAdjacentRegions([
      r(2, 0.0, 0.0, 0.5, 0.05, "paraphrase"), // wide thin bar
      r(2, 0.0, 0.05, 0.05, 0.5, "paraphrase"), // tall thin bar touching below-left
    ]);
    expect(merged).toHaveLength(2);
  });

  it("above the input cap, coarse-buckets to bound BOTH cpu and rendered box count", () => {
    // 600 boxes stacked in one grid cell → collapse to a single bucket (no O(n²),
    // no 600-box flood).
    const many = Array.from({ length: 600 }, (_, i) => r(1, 0.1, i * 0.0001, 0.2, 0.01, "paraphrase"));
    const merged = mergeAdjacentRegions(many);
    expect(merged.length).toBeLessThan(600);
    expect(merged.length).toBeLessThanOrEqual(110); // bounded by the coarse grid
  });
});
