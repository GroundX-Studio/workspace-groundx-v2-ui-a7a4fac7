import { describe, expect, it } from "vitest";

import {
  bboxForResult,
  groupByPage,
  normalizeBox,
  normalizeText,
  pageOf,
  parseBoundingBoxes,
  parsePages,
  resolveGeometryFromXray,
  resolveFieldGeometry,
  resolveWordGeometry,
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

  describe("normalizeBox", () => {
    it("unions one page's boxes and divides by page dims → 0-1 {x,y,w,h}", () => {
      const bbox = normalizeBox([box(2, 362, 593, 1601, 2031)], { number: 2, width: 1700, height: 2200 });
      expect(bbox).not.toBeNull();
      expect(bbox!.x).toBeCloseTo(0.213, 2);
      expect(bbox!.y).toBeCloseTo(0.27, 2);
      expect(bbox!.w).toBeCloseTo(0.729, 2);
      expect(bbox!.h).toBeCloseTo(0.654, 2);
    });

    it("unions multiple boxes on the page into one envelope", () => {
      const bbox = normalizeBox(
        [box(1, 100, 100, 200, 200), box(1, 150, 50, 400, 300)],
        { number: 1, width: 1000, height: 1000 },
      );
      // envelope = (100,50)-(400,300)
      expect(bbox).toEqual({ x: 0.1, y: 0.05, w: 0.3, h: 0.25 });
    });

    it("returns null on empty boxes or zero page dims", () => {
      expect(normalizeBox([], { number: 1, width: 100, height: 100 })).toBeNull();
      expect(normalizeBox([box(1, 0, 0, 1, 1)], { number: 1, width: 0, height: 0 })).toBeNull();
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

  describe("bboxForResult", () => {
    it("resolves the cited page's normalized envelope from a result's boxes+pages", () => {
      const res = bboxForResult(
        [box(2, 362, 593, 1601, 2031), box(1, 0, 0, 50, 50)],
        [{ number: 2, width: 1700, height: 2200 }, { number: 1, width: 1700, height: 2200 }],
      );
      expect(res.page).toBe(2);
      expect(res.bbox!.x).toBeCloseTo(0.213, 2);
    });
    it("returns page with null bbox when geometry is absent", () => {
      expect(bboxForResult([], [])).toEqual({ page: 1, bbox: null });
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

describe("resolveGeometryFromXray (WF-03 X-Ray fallback)", () => {
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

  it("matches a snippet to the best chunk and returns its normalized geometry", () => {
    const geo = resolveGeometryFromXray("Demand 2,218.75", xray);
    expect(geo).not.toBeNull();
    expect(geo!.page).toBe(2);
    expect(geo!.bbox!.x).toBeCloseTo(0.213, 2);
    expect(geo!.bbox!.h).toBeCloseTo(0.654, 2);
  });

  it("returns null when nothing clears the match threshold", () => {
    expect(resolveGeometryFromXray("totally unrelated zzzz qqqq", xray)).toBeNull();
  });

  it("ignores chunks that carry no boundingBoxes", () => {
    const x: XrayDoc = {
      documentPages: [{ pageNumber: 1, width: 100, height: 100 }],
      chunks: [{ text: "match me exactly", boundingBoxes: [] }],
    };
    expect(resolveGeometryFromXray("match me exactly", x)).toBeNull();
  });
});

describe("normalizeText", () => {
  it("lowercases, strips non-alphanumerics, collapses spaces", () => {
    expect(normalizeText("  Demand: $2,218.75!! ")).toBe("demand 2 218 75");
  });
});

describe("resolveFieldGeometry (WF-05 extract-field value → geometry)", () => {
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

  it("matches a numeric value to a chunk despite currency/comma formatting", () => {
    // value 7613.2 must match the chunk printed as "$7,613.20".
    const geo = resolveFieldGeometry(7613.2, "balance_payable", xray);
    expect(geo).not.toBeNull();
    expect(geo!.page).toBe(1);
    expect(geo!.bbox!.x).toBeCloseTo(100 / 1700, 2);
  });

  it("returns null when no chunk contains the value", () => {
    expect(resolveFieldGeometry("nonexistent zzz value", "x", xray)).toBeNull();
  });

  it("uses the field label as a secondary signal when the value is ambiguous", () => {
    // "18.43" appears in TWO chunks; the label picks the matching one.
    const geo = resolveFieldGeometry(18.43, "Commercial Water Minimum Charge", xray);
    expect(geo).not.toBeNull();
    expect(geo!.page).toBe(2);
    expect(geo!.bbox!.x).toBeCloseTo(50 / 1700, 2); // chunk 2 (label match), not chunk 3 (600/1700)
  });

  it("returns null for empty / nullish values (no geometry to resolve)", () => {
    expect(resolveFieldGeometry("", "x", xray)).toBeNull();
    expect(resolveFieldGeometry(null, "x", xray)).toBeNull();
    expect(resolveFieldGeometry(true, "x", xray)).toBeNull();
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
