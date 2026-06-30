import { describe, expect, it } from "vitest";

import {
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  clampZoom,
  stepZoom,
  clampPan,
  zoomAtPoint,
} from "./zoomPan";

describe("clampZoom", () => {
  it("clamps to [ZOOM_MIN, ZOOM_MAX] and passes through interior values", () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(1.5)).toBe(1.5);
  });
});

describe("stepZoom", () => {
  it("steps by ZOOM_STEP and clamps at the bounds", () => {
    expect(stepZoom(1, "in")).toBe(1 + ZOOM_STEP);
    expect(stepZoom(1, "out")).toBe(ZOOM_MIN); // already at floor
    expect(stepZoom(1.25, "out")).toBe(1);
    // 2.9 + 0.25 = 3.15 → clamps to 3
    expect(stepZoom(2.9, "in")).toBe(ZOOM_MAX);
  });
});

describe("clampPan", () => {
  const pane = { w: 800, h: 600 };
  // A square content box (e.g. a doc fit into the pane) of 600×600 centered.
  const content = { offsetX: 100, offsetY: 0, width: 600, height: 600 };

  it("forces pan to {0,0} at zoom 1 (nothing to pan)", () => {
    expect(clampPan({ x: 999, y: -999 }, 1, pane, content)).toEqual({ x: 0, y: 0 });
  });

  it("allows panning up to the half-overflow at higher zoom, clamping overshoot", () => {
    // zoom 2 → content 1200×1200. maxX = (1200-800)/2 = 200; maxY = (1200-600)/2 = 300.
    expect(clampPan({ x: 999, y: -999 }, 2, pane, content)).toEqual({ x: 200, y: -300 });
    expect(clampPan({ x: 50, y: 100 }, 2, pane, content)).toEqual({ x: 50, y: 100 });
  });

  it("returns {0,0} when the content has not been measured", () => {
    expect(clampPan({ x: 10, y: 10 }, 2, pane, null)).toEqual({ x: 0, y: 0 });
  });
});

describe("zoomAtPoint", () => {
  const pane = { w: 800, h: 600 }; // center = (400, 300)

  it("keeps the content point under the cursor fixed", () => {
    const pointer = { x: 600, y: 450 };
    const result = zoomAtPoint(1, 2, pointer, { x: 0, y: 0 }, pane);
    expect(result.zoom).toBe(2);

    // Map a content point to its on-screen position:
    //   screen = center + (point - center) * zoom + pan
    const center = { x: pane.w / 2, y: pane.h / 2 };
    // The content point that was under the cursor before the zoom:
    const q = {
      x: center.x + (pointer.x - center.x - 0) / 1,
      y: center.y + (pointer.y - center.y - 0) / 1,
    };
    const screenAfter = {
      x: center.x + (q.x - center.x) * result.zoom + result.pan.x,
      y: center.y + (q.y - center.y) * result.zoom + result.pan.y,
    };
    expect(screenAfter.x).toBeCloseTo(pointer.x, 5);
    expect(screenAfter.y).toBeCloseTo(pointer.y, 5);
  });

  it("clamps the target zoom to the bounds", () => {
    const r = zoomAtPoint(2.9, 3.5, { x: 400, y: 300 }, { x: 0, y: 0 }, pane);
    expect(r.zoom).toBe(ZOOM_MAX);
  });
});
