import { describe, expect, it } from "vitest";

import { litRegionsFromCitations } from "./litRegions";

describe("litRegionsFromCitations (WF-03 consume verification)", () => {
  it("uses a citation's REAL bbox verbatim (not the fallback band)", () => {
    const regions = litRegionsFromCitations([
      { page: 2, bbox: { x: 0.213, y: 0.27, w: 0.729, h: 0.654 } },
    ]);
    expect(regions).toEqual([{ page: 2, x: 0.213, y: 0.27, w: 0.729, h: 0.654, color: "green" }]);
  });

  it("falls back to a top-of-page band when a citation lacks a bbox", () => {
    const regions = litRegionsFromCitations([{ page: 1 }]);
    expect(regions[0]).toMatchObject({ page: 1, x: 0.05, w: 0.5, h: 0.05 });
    expect(regions[0].y).toBeCloseTo(0.08, 5);
  });

  it("color-keys: idx 0 green, last coral, middle cyan", () => {
    const regions = litRegionsFromCitations([
      { page: 1, bbox: { x: 0, y: 0, w: 0.1, h: 0.1 } },
      { page: 1, bbox: { x: 0, y: 0.2, w: 0.1, h: 0.1 } },
      { page: 1, bbox: { x: 0, y: 0.4, w: 0.1, h: 0.1 } },
    ]);
    expect(regions.map((r) => r.color)).toEqual(["green", "cyan", "coral"]);
  });

  it("a single citation is the primary (green)", () => {
    const regions = litRegionsFromCitations([{ page: 5, bbox: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }]);
    expect(regions[0].color).toBe("green");
  });

  it("empty citations → no regions", () => {
    expect(litRegionsFromCitations([])).toEqual([]);
  });
});
