import { describe, expect, it } from "vitest";

import {
  bboxForResult,
  dedupeGeometryRegions,
  groupByPage,
  normalizeBox,
  normalizeBoxes,
  normalizeText,
  pageOf,
  parseBoundingBoxes,
  parsePages,
  resolveGeometryFromXray,
  resolveFieldGeometry,
  resolveWordGeometry,
  valueMatchesChunk,
  type BoundingBox,
  type WordMap,
  type XrayDoc,
} from "./citationGeometry.js";

import wordMapFixture from "./wordMap.fixture.json" with { type: "json" };

const box = (p: number, tlx: number, tly: number, brx: number, bry: number): BoundingBox => ({
  pageNumber: p,
  topLeftX: tlx,
  topLeftY: tly,
  bottomRightX: brx,
  bottomRightY: bry,
});

describe("citationGeometry — pure helpers (WF-03)", () => {
  describe("groupByPage", () => {
    it("buckets boxes by pageNumber and never merges across pages", () => {
      const grouped = groupByPage([box(1, 0, 0, 10, 10), box(1, 5, 5, 20, 20), box(2, 0, 0, 5, 5)]);
      expect(grouped.get(1)).toHaveLength(2);
      expect(grouped.get(2)).toHaveLength(1);
      expect([...grouped.keys()].sort()).toEqual([1, 2]);
    });
  });

  describe("normalizeBox (single box → 0-1)", () => {
    it("normalizes one box against its page dims", () => {
      const bbox = normalizeBox(box(2, 362, 593, 1601, 2031), { number: 2, width: 1700, height: 2200 });
      expect(bbox).not.toBeNull();
      expect(bbox!.x).toBeCloseTo(0.213, 2);
      expect(bbox!.y).toBeCloseTo(0.27, 2);
      expect(bbox!.w).toBeCloseTo(0.729, 2);
      expect(bbox!.h).toBeCloseTo(0.654, 2);
    });

    it("returns null on missing / zero page dims", () => {
      expect(normalizeBox(box(1, 0, 0, 1, 1), undefined)).toBeNull();
      expect(normalizeBox(box(1, 0, 0, 1, 1), { number: 1, width: 0, height: 0 })).toBeNull();
    });

    it("clamps a malformed box (out-of-bounds or inverted) into the page (no negative/oversized overlay)", () => {
      const page = { number: 1, width: 1000, height: 1000 };
      // corner beyond the page → clamped to [0,1], width capped so x+w <= 1
      const over = normalizeBox(box(1, 800, 800, 1500, 1500), page);
      expect(over!.x).toBeCloseTo(0.8, 6);
      expect(over!.w).toBeCloseTo(0.2, 6); // capped to 1 - 0.8, not 0.7
      expect(over!.x + over!.w).toBeLessThanOrEqual(1 + 1e-9);
      // inverted (bottomRight < topLeft) → non-negative (degenerate) dims
      const inv = normalizeBox(box(1, 500, 500, 100, 100), page);
      expect(inv!.w).toBe(0);
      expect(inv!.h).toBe(0);
    });
  });

  describe("normalizeBoxes (multi-region — one region PER box, NO union)", () => {
    it("emits a region per box, each normalized against its page (no envelope union)", () => {
      const regions = normalizeBoxes(
        [box(1, 100, 100, 200, 200), box(1, 150, 50, 400, 300)],
        [{ number: 1, width: 1000, height: 1000 }],
      );
      expect(regions).toHaveLength(2);
      // The OLD behavior unioned these into one envelope (100,50)-(400,300); now
      // each box is its own region.
      expect(regions[0]).toEqual({ page: 1, bbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } });
      expect(regions[1]).toEqual({ page: 1, bbox: { x: 0.15, y: 0.05, w: 0.25, h: 0.25 } });
    });

    it("groups across pages and skips boxes whose page dims are missing", () => {
      const regions = normalizeBoxes(
        [box(1, 0, 0, 100, 100), box(2, 0, 0, 100, 100)],
        [{ number: 1, width: 1000, height: 1000 }], // page 2 dims absent
      );
      expect(regions).toHaveLength(1);
      expect(regions[0].page).toBe(1);
    });

    it("returns [] for no boxes", () => {
      expect(normalizeBoxes([], [{ number: 1, width: 100, height: 100 }])).toEqual([]);
    });
  });

  describe("pageOf", () => {
    it("prefers boundingBoxes[0].pageNumber", () => {
      expect(pageOf({ boundingBoxes: [box(3, 0, 0, 1, 1)], pages: [{ number: 9, width: 1, height: 1 }] })).toBe(3);
    });
    it("falls back to pages[0].number, then 1", () => {
      expect(pageOf({ boundingBoxes: [], pages: [{ number: 5, width: 1, height: 1 }] })).toBe(5);
      expect(pageOf({ boundingBoxes: [], pages: [] })).toBe(1);
    });
  });

  describe("bboxForResult (per-box regions on the cited page)", () => {
    it("resolves per-box regions on the cited page from a result's boxes+pages", () => {
      const regions = bboxForResult(
        [box(2, 362, 593, 1601, 2031), box(1, 0, 0, 50, 50)],
        [{ number: 2, width: 1700, height: 2200 }, { number: 1, width: 1700, height: 2200 }],
      );
      // cited page = 2 (boundingBoxes[0].pageNumber); the page-1 box is off-page.
      expect(regions).toHaveLength(1);
      expect(regions[0].page).toBe(2);
      expect(regions[0].bbox.x).toBeCloseTo(0.213, 2);
    });
    it("returns [] when geometry is absent", () => {
      expect(bboxForResult([], [])).toEqual([]);
    });
  });

  describe("defensive parsers", () => {
    it("parseBoundingBoxes coerces a raw array, dropping malformed entries", () => {
      const parsed = parseBoundingBoxes([
        { pageNumber: 1, topLeftX: 1, topLeftY: 2, bottomRightX: 3, bottomRightY: 4 },
        { nope: true },
        "garbage",
      ]);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({ pageNumber: 1, topLeftX: 1, bottomRightY: 4 });
    });
    it("parsePages coerces a raw array, dropping malformed entries", () => {
      const parsed = parsePages([{ number: 2, width: 1700, height: 2200 }, { number: "x" }, 5]);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({ number: 2, width: 1700, height: 2200 });
    });
    it("non-array input → empty array", () => {
      expect(parseBoundingBoxes(undefined)).toEqual([]);
      expect(parsePages("nope")).toEqual([]);
    });
  });
});

describe("dedupeGeometryRegions (multi-region-citations — drop identical boxes)", () => {
  it("collapses regions with identical page+bbox to one (a chunk matched by several leaf values)", () => {
    const a = { page: 2, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 } };
    const b = { page: 2, bbox: { x: 0.5, y: 0.6, w: 0.1, h: 0.02 } };
    const out = dedupeGeometryRegions([a, { ...a }, b, { ...a }, { ...b }]);
    expect(out).toHaveLength(2);
    expect(out).toContainEqual(a);
    expect(out).toContainEqual(b);
  });

  it("keeps boxes that differ in page or any coordinate", () => {
    const out = dedupeGeometryRegions([
      { page: 1, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 } },
      { page: 2, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.04 } }, // different page
      { page: 1, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 } }, // different h
    ]);
    expect(out).toHaveLength(3);
  });

  it("preserves first-seen order", () => {
    const a = { page: 1, bbox: { x: 0.1, y: 0.1, w: 0.1, h: 0.1 } };
    const b = { page: 1, bbox: { x: 0.2, y: 0.2, w: 0.1, h: 0.1 } };
    expect(dedupeGeometryRegions([a, b, { ...a }])).toEqual([a, b]);
  });
});

describe("valueMatchesChunk (multi-region-citations R1 — value→chunk match)", () => {
  it("numbers: matches the whole numeric token through $, comma, trailing zero, stray space", () => {
    expect(valueMatchesChunk(7613.2, "Current Charges $7,613.20")).toBe(true);
    expect(valueMatchesChunk(7613.2, "Balance Due $ 7,613.20 today")).toBe(true);
    expect(valueMatchesChunk(60960, "Usage 60,960 kWh")).toBe(true);
  });
  it("numbers: rejects a near-miss value and a value embedded in a larger number", () => {
    expect(valueMatchesChunk(18.43, "Surcharge 18.44 applied")).toBe(false); // near-miss
    expect(valueMatchesChunk(18.43, "Meter reading 118.437 units")).toBe(false); // embedded
  });
  it("numbers: matches a NEGATIVE value to its signed on-page token (credit/adjustment)", () => {
    expect(valueMatchesChunk(-50, "Account Credit -50.00 applied")).toBe(true);
    expect(valueMatchesChunk(-2218.75, "Adjustment -2,218.75 this period")).toBe(true);
    // a positive value does NOT match a signed (negative) token, and vice-versa
    expect(valueMatchesChunk(50, "Account Credit -50.00 applied")).toBe(false);
  });
  it("numbers: a hyphen BETWEEN digits (a date/range) is not read as a sign", () => {
    // "2024-01-15": tokens are 2024, 1, 15 (positive) — the value -15 must NOT match.
    expect(valueMatchesChunk(-15, "Invoice dated 2024-01-15")).toBe(false);
  });
  it("numbers: an accounting-style parenthesized amount is read as negative", () => {
    expect(valueMatchesChunk(-50, "Account Credit (50.00) applied")).toBe(true);
    expect(valueMatchesChunk(-2218.75, "Adjustment (2,218.75) this period")).toBe(true);
    // a positive value is not the same as a parenthesized (negative) amount
    expect(valueMatchesChunk(50, "Account Credit (50.00) applied")).toBe(false);
    // even when the "(" abuts a digit with no separator
    expect(valueMatchesChunk(-50, "ref5(50.00)")).toBe(true);
  });
  it("numbers: distinctiveness floor rejects a single-digit value (would flood)", () => {
    expect(valueMatchesChunk(2, "2 of 2 pages — line 2")).toBe(false);
  });
  it("words: whole-token-SEQUENCE match, not a substring of a token", () => {
    expect(valueMatchesChunk("main street", "123 Main Street, Apt 4")).toBe(true);
    expect(valueMatchesChunk("cat", "category of service")).toBe(false);
  });
});

describe("resolveGeometryFromXray (WF-03 X-Ray fallback → multi-region)", () => {
  const xray: XrayDoc = {
    documentPages: [{ pageNumber: 2, width: 1700, height: 2200 }],
    chunks: [
      {
        text: "Industrial Electric Demand 125 kW 2,218.75",
        pageNumbers: [2],
        boundingBoxes: [{ pageNumber: 2, topLeftX: 362, topLeftY: 593, bottomRightX: 1601, bottomRightY: 2031 }],
      },
      {
        text: "Commercial Water Minimum Charge",
        pageNumbers: [1],
        boundingBoxes: [{ pageNumber: 1, topLeftX: 0, topLeftY: 0, bottomRightX: 10, bottomRightY: 10 }],
      },
    ],
  };

  it("matches a snippet to the best chunk and returns its per-box regions", () => {
    const regions = resolveGeometryFromXray("Demand 2,218.75", xray);
    expect(regions).toHaveLength(1);
    expect(regions[0].page).toBe(2);
    expect(regions[0].bbox.x).toBeCloseTo(0.213, 2);
    expect(regions[0].bbox.h).toBeCloseTo(0.654, 2);
  });

  it("returns [] when nothing clears the match threshold", () => {
    expect(resolveGeometryFromXray("totally unrelated zzzz qqqq", xray)).toEqual([]);
  });

  it("ignores chunks that carry no boundingBoxes", () => {
    const x: XrayDoc = {
      documentPages: [{ pageNumber: 1, width: 100, height: 100 }],
      chunks: [{ text: "match me exactly", boundingBoxes: [] }],
    };
    expect(resolveGeometryFromXray("match me exactly", x)).toEqual([]);
  });
});

describe("normalizeText", () => {
  it("lowercases, strips non-alphanumerics, collapses spaces", () => {
    expect(normalizeText("  Demand: $2,218.75!! ")).toBe("demand 2 218 75");
  });
});

describe("resolveFieldGeometry (WF-05 extract-field value → multi-region)", () => {
  const xray: XrayDoc = {
    documentPages: [
      { pageNumber: 1, width: 1700, height: 2200 },
      { pageNumber: 2, width: 1700, height: 2200 },
    ],
    chunks: [
      {
        text: "Current Charges $7,613.20",
        pageNumbers: [1],
        boundingBoxes: [{ pageNumber: 1, topLeftX: 100, topLeftY: 200, bottomRightX: 1600, bottomRightY: 400 }],
      },
      {
        text: "Commercial Water Minimum Charge 18.43",
        pageNumbers: [2],
        boundingBoxes: [{ pageNumber: 2, topLeftX: 50, topLeftY: 50, bottomRightX: 500, bottomRightY: 120 }],
      },
      {
        text: "State Water Surcharge 18.43 sewer",
        pageNumbers: [2],
        boundingBoxes: [{ pageNumber: 2, topLeftX: 600, topLeftY: 50, bottomRightX: 900, bottomRightY: 120 }],
      },
    ],
  };

  it("locates a number through currency/comma formatting → one region", () => {
    const regions = resolveFieldGeometry(7613.2, "balance_payable", xray);
    expect(regions).toHaveLength(1);
    expect(regions[0].page).toBe(1);
    expect(regions[0].bbox.x).toBeCloseTo(100 / 1700, 2);
  });

  it("shows EVERY occurrence — a value in two chunks yields two regions (no label narrowing)", () => {
    // 18.43 appears in chunk 2 AND chunk 3 — BOTH light up (the former label
    // tiebreaker is removed; D1 = show every occurrence).
    const regions = resolveFieldGeometry(18.43, "Commercial Water Minimum Charge", xray);
    expect(regions).toHaveLength(2);
    expect(regions.map((r) => r.page)).toEqual([2, 2]);
    const xs = regions.map((r) => r.bbox.x).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(50 / 1700, 3);
    expect(xs[1]).toBeCloseTo(600 / 1700, 3);
  });

  it("does NOT match a near-miss value (18.44 is not present)", () => {
    expect(resolveFieldGeometry(18.44, "x", xray)).toEqual([]);
  });

  it("does NOT match a value embedded in a larger number (18.43 ∉ 118.437)", () => {
    const x: XrayDoc = {
      documentPages: [{ pageNumber: 1, width: 1700, height: 2200 }],
      chunks: [
        {
          text: "Meter reading 118.437 units",
          pageNumbers: [1],
          boundingBoxes: [{ pageNumber: 1, topLeftX: 10, topLeftY: 10, bottomRightX: 200, bottomRightY: 40 }],
        },
      ],
    };
    expect(resolveFieldGeometry(18.43, "x", x)).toEqual([]);
  });

  it("returns [] for empty / nullish / boolean values", () => {
    expect(resolveFieldGeometry("", "x", xray)).toEqual([]);
    expect(resolveFieldGeometry(null, "x", xray)).toEqual([]);
    expect(resolveFieldGeometry(true, "x", xray)).toEqual([]);
  });

  it("dedupes identical boxes within a chunk (defends against redundant X-Ray boxes)", () => {
    const dupX: XrayDoc = {
      documentPages: [{ pageNumber: 1, width: 1000, height: 1000 }],
      chunks: [
        {
          text: "Total 42.50 due",
          pageNumbers: [1],
          boundingBoxes: [
            { pageNumber: 1, topLeftX: 10, topLeftY: 20, bottomRightX: 110, bottomRightY: 40 },
            { pageNumber: 1, topLeftX: 10, topLeftY: 20, bottomRightX: 110, bottomRightY: 40 }, // duplicate
          ],
        },
      ],
    };
    expect(resolveFieldGeometry(42.5, "x", dupX)).toHaveLength(1);
  });

  it("is SCHEMA-AGNOSTIC — locates a value in a non-utility payload, no field name baked in", () => {
    // A loan-shaped doc with NO `meters`/`meter_id` — the resolver keys off the
    // VALUE, never a sample-specific field name.
    const loan: XrayDoc = {
      documentPages: [{ pageNumber: 1, width: 1000, height: 1000 }],
      chunks: [
        {
          text: "Loan APR 6.25 percent fixed for 30 years",
          pageNumbers: [1],
          boundingBoxes: [{ pageNumber: 1, topLeftX: 0, topLeftY: 0, bottomRightX: 500, bottomRightY: 50 }],
        },
      ],
    };
    const regions = resolveFieldGeometry(6.25, "annual_percentage_rate", loan);
    expect(regions).toHaveLength(1);
    expect(regions[0].page).toBe(1);
  });
});

describe("resolveWordGeometry (WF-05b word-level -118-map atom resolver)", () => {
  const wordMap = wordMapFixture as unknown as WordMap;

  // The X-Ray chunk box for the "Amount Due" line is the broad envelope
  // (100,200)-(1600,400) on page 1 (see resolveFieldGeometry's chunk fixture
  // + UTILITY_AMOUNT_DUE region). The word-level box must be TIGHTER than that.
  const chunkBox = { x: 100 / 1700, y: 200 / 2200, w: 1500 / 1700, h: 200 / 2200 };

  it("resolves the Utility 'amount due' verbatim span to a tight word-level bbox", () => {
    const geo = resolveWordGeometry("$7,613.20", wordMap);
    expect(geo).not.toBeNull();
    expect(geo!.page).toBe(1);
    // atom a4 box: (450,250)-(760,320) on a 1700x2200 page.
    expect(geo!.bbox!.x).toBeCloseTo(450 / 1700, 3);
    expect(geo!.bbox!.y).toBeCloseTo(250 / 2200, 3);
    expect(geo!.bbox!.w).toBeCloseTo((760 - 450) / 1700, 3);
    expect(geo!.bbox!.h).toBeCloseTo((320 - 250) / 2200, 3);
    // The whole point of WF-05b: the word box is strictly tighter than the chunk box.
    expect(geo!.bbox!.w).toBeLessThan(chunkBox.w);
    expect(geo!.bbox!.h).toBeLessThanOrEqual(chunkBox.h);
  });

  it("unions consecutive atoms for a multi-word verbatim span", () => {
    // "Amount Due $7,613.20" spans atoms a2..a4 → envelope (140,250)-(760,320).
    const geo = resolveWordGeometry("Amount Due $7,613.20", wordMap);
    expect(geo).not.toBeNull();
    expect(geo!.page).toBe(1);
    expect(geo!.bbox!.x).toBeCloseTo(140 / 1700, 3);
    expect(geo!.bbox!.w).toBeCloseTo((760 - 140) / 1700, 3);
  });

  it("matches the consecutive atom run, not scattered tokens (ordered match)", () => {
    // page-2 span: "Demand 2,218.75" → atoms b2..b3, envelope (710,600)-(1120,670).
    const geo = resolveWordGeometry("Demand 2,218.75", wordMap);
    expect(geo).not.toBeNull();
    expect(geo!.page).toBe(2);
    expect(geo!.bbox!.x).toBeCloseTo(710 / 1700, 3);
    expect(geo!.bbox!.w).toBeCloseTo((1120 - 710) / 1700, 3);
  });

  it("returns null when the span is not present verbatim (no paraphrase guessing)", () => {
    expect(resolveWordGeometry("the amount owed is roughly seven thousand", wordMap)).toBeNull();
    expect(resolveWordGeometry("zzzz qqqq nonexistent", wordMap)).toBeNull();
  });

  it("returns null on empty span or empty map", () => {
    expect(resolveWordGeometry("", wordMap)).toBeNull();
    expect(resolveWordGeometry("$7,613.20", { pages: [] })).toBeNull();
    expect(resolveWordGeometry("$7,613.20", {} as WordMap)).toBeNull();
  });
});
