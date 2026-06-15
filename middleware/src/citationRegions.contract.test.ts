import { describe, expect, it } from "vitest";

import {
  citationRegions,
  citationSourceRegionSchema,
  parseCitations,
} from "@groundx/shared";

/**
 * multi-region-citations P1.1 — `Citation` gains `regions: {page,bbox,tier}[]`
 * (the canonical multi-region proof shape), with the legacy single
 * `page`/`bbox`/`tier` retained as a derived FIRST-REGION alias for the
 * migration window. `parseCitations` (the boundary sanitizer) normalizes BOTH
 * directions so old readers (`.page`/`.bbox`/`.tier`) and new readers
 * (`.regions`) both work. `page` is now OPTIONAL so the one permitted pageless
 * case — a validated-but-unlocatable extraction value (review #8) — survives
 * instead of being dropped.
 */
describe("Citation.regions[] — multi-region shape + legacy first-region alias (P1.1)", () => {
  const bbox = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
  const bbox2 = { x: 0.5, y: 0.5, w: 0.1, h: 0.1 };

  it("citationSourceRegionSchema validates a {page,bbox,tier} region", () => {
    const r = citationSourceRegionSchema.parse({ page: 2, bbox, tier: "exact" });
    expect(r).toEqual({ page: 2, bbox, tier: "exact" });
  });

  it("parseCitations synthesizes regions[] from a legacy {page,bbox,tier} citation", () => {
    const [c] = parseCitations([{ documentId: "D", page: 3, bbox, tier: "paraphrase" }]);
    expect(c.regions).toEqual([{ page: 3, bbox, tier: "paraphrase" }]);
    // legacy fields retained unchanged
    expect(c.page).toBe(3);
    expect(c.bbox).toEqual(bbox);
    expect(c.tier).toBe("paraphrase");
  });

  it("parseCitations defaults a legacy citation's region tier to paraphrase when absent", () => {
    const [c] = parseCitations([{ documentId: "D", page: 1, bbox }]);
    expect(c.regions).toEqual([{ page: 1, bbox, tier: "paraphrase" }]);
  });

  it("parseCitations backfills an absent legacy tier from regions[0] (dual-write case)", () => {
    // P1.1 producers dual-write the first-region alias (page+bbox), so the
    // input carries page; a missing legacy `tier` is backfilled from regions[0].
    const [c] = parseCitations([
      {
        documentId: "D",
        page: 5,
        bbox,
        regions: [
          { page: 5, bbox, tier: "exact" },
          { page: 5, bbox: bbox2, tier: "paraphrase" },
        ],
      },
    ]);
    expect(c.page).toBe(5);
    expect(c.bbox).toEqual(bbox);
    expect(c.tier).toBe("exact"); // backfilled from regions[0]
    expect(c.regions).toHaveLength(2);
  });

  it("preserves a regionless citation (the unlocatable validated-value case), not dropped", () => {
    // P1.3 — `page` is OPTIONAL so a validated-but-unlocatable value survives as
    // a regionless source chip ("location unknown") rather than being dropped.
    const [c] = parseCitations([
      { documentId: "D", tier: "ambient", snippet: "balance_payable: 7613.2" },
    ]);
    expect(c.documentId).toBe("D");
    expect(c.regions ?? []).toEqual([]);
    expect(c.page).toBeUndefined();
    expect(c.tier).toBe("ambient");
  });

  it("backfills page/bbox/tier from regions[0] when the legacy fields are absent", () => {
    // A regions-only citation (no top-level page) hydrates the first-region alias.
    const [c] = parseCitations([
      { documentId: "D", regions: [{ page: 9, bbox, tier: "exact" }] },
    ]);
    expect(c.page).toBe(9);
    expect(c.bbox).toEqual(bbox);
    expect(c.tier).toBe("exact");
  });

  it("still drops an entry with no documentId (the trust anchor stays required)", () => {
    expect(parseCitations([{ page: 1, bbox }])).toEqual([]);
  });

  it("citationRegions() returns regions for both shapes and [] when regionless", () => {
    expect(
      citationRegions({ documentId: "D", regions: [{ page: 1, bbox, tier: "exact" }] }),
    ).toEqual([{ page: 1, bbox, tier: "exact" }]);
    expect(citationRegions({ documentId: "D", page: 2, bbox, tier: "paraphrase" })).toEqual([
      { page: 2, bbox, tier: "paraphrase" },
    ]);
    expect(citationRegions({ documentId: "D", page: 2, bbox })).toEqual([
      { page: 2, bbox, tier: "paraphrase" },
    ]);
    expect(citationRegions({ documentId: "D", tier: "ambient" })).toEqual([]);
  });
});
