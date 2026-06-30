import { describe, expect, it } from "vitest";

import { containContentRect, overlayPxRect } from "./overlayGeometry";

describe("containContentRect", () => {
  it("returns null until the box (or page) has been measured", () => {
    expect(containContentRect(0, 0, 1700, 2200)).toBeNull();
    expect(containContentRect(800, 600, 0, 0)).toBeNull();
  });

  it("pillarboxes a portrait page inside a wider box (fit by height)", () => {
    // Page 1700×2200 (portrait) in a 838×763 box → limited by height.
    const c = containContentRect(838, 763, 1700, 2200);
    expect(c).not.toBeNull();
    // scale = 763/2200 = 0.3468 → width 589.6, height 763, centered horizontally.
    expect(c!.height).toBeCloseTo(763, 0);
    expect(c!.width).toBeCloseTo(589.6, 0);
    expect(c!.offsetY).toBeCloseTo(0, 0);
    expect(c!.offsetX).toBeCloseTo(124.2, 0);
  });

  it("letterboxes a landscape page inside a taller box (fit by width)", () => {
    const c = containContentRect(600, 800, 1000, 500);
    // scale = 600/1000 = 0.6 → width 600, height 300, centered vertically.
    expect(c!.width).toBeCloseTo(600, 0);
    expect(c!.height).toBeCloseTo(300, 0);
    expect(c!.offsetX).toBeCloseTo(0, 0);
    expect(c!.offsetY).toBeCloseTo(250, 0);
  });
});

describe("overlayPxRect — the citation-misplacement regression", () => {
  it("places the bbox over the cited region, accounting for the contain letterbox", () => {
    // The exact live case: 'Amount Due $7,613.20' at y:0.6936 on a 1700×2200
    // page rendered in an 838×763 pane. The OLD code put it at ~473px (top:
    // 69.36% of a mismatched 682px wrapper). Correct is ~529px down + offset.
    const content = containContentRect(838, 763, 1700, 2200)!;
    const bbox = { x: 0.2347, y: 0.6936, w: 0.2571, h: 0.0095 };
    const r = overlayPxRect(bbox, content);
    // top = 0.6936 * 763 ≈ 529 (NOT the old, wrong 473).
    expect(r.top).toBeCloseTo(529.2, 0);
    expect(r.top).toBeGreaterThan(500); // guards against the wrapper-height regression
    // left = offsetX(124.2) + 0.2347 * 589.6 ≈ 262.6.
    expect(r.left).toBeCloseTo(262.6, 0);
    expect(r.width).toBeCloseTo(151.6, 0);
    expect(r.height).toBeCloseTo(6.9, 0);
  });
});
