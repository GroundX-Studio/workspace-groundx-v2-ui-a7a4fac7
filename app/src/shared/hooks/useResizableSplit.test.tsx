import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { clampToLiveBand, snapZoneFor, useResizableSplit } from "./useResizableSplit";

describe("snapZoneFor (W5 thresholds)", () => {
  it("returns workspace-focus when width < 200", () => {
    expect(snapZoneFor(0)).toBe("workspace-focus");
    expect(snapZoneFor(199)).toBe("workspace-focus");
  });

  it("returns split-live in the 280–720 live band", () => {
    expect(snapZoneFor(280)).toBe("split-live");
    expect(snapZoneFor(400)).toBe("split-live");
    expect(snapZoneFor(720)).toBe("split-live");
  });

  it("returns chat-focus when width > 720", () => {
    expect(snapZoneFor(721)).toBe("chat-focus");
    expect(snapZoneFor(1100)).toBe("chat-focus");
  });

  it("transitional 200–280 band still reports split-live for animation continuity", () => {
    expect(snapZoneFor(220)).toBe("split-live");
    expect(snapZoneFor(279)).toBe("split-live");
  });
});

describe("clampToLiveBand", () => {
  it("clamps to default 280–640", () => {
    expect(clampToLiveBand(100)).toBe(280);
    expect(clampToLiveBand(500)).toBe(500);
    expect(clampToLiveBand(900)).toBe(640);
  });

  it("clamps to ultrawide 280–720 when ultrawide=true", () => {
    expect(clampToLiveBand(900, true)).toBe(720);
    expect(clampToLiveBand(700, true)).toBe(700);
  });
});

describe("useResizableSplit", () => {
  it("uses provided initial width and reports live zone", () => {
    const { result } = renderHook(() => useResizableSplit({ initial: 360 }));
    expect(result.current.width).toBe(360);
    expect(result.current.zone).toBe("split-live");
  });

  it("setWidth clamps to [min, max]", () => {
    const { result } = renderHook(() => useResizableSplit({ initial: 400, min: 200, max: 800 }));
    act(() => result.current.setWidth(100));
    expect(result.current.width).toBe(200);
    act(() => result.current.setWidth(1000));
    expect(result.current.width).toBe(800);
  });

  it("setWidth past 720 reports chat-focus zone", () => {
    const { result } = renderHook(() => useResizableSplit({ initial: 400, max: 1000 }));
    act(() => result.current.setWidth(800));
    expect(result.current.zone).toBe("chat-focus");
  });

  it("setWidth below 200 reports workspace-focus zone", () => {
    const { result } = renderHook(() => useResizableSplit({ initial: 400, min: 0 }));
    act(() => result.current.setWidth(120));
    expect(result.current.zone).toBe("workspace-focus");
  });

  it("bump increments width and clamps", () => {
    const { result } = renderHook(() => useResizableSplit({ initial: 400, min: 200, max: 800 }));
    let next!: number;
    act(() => {
      next = result.current.bump(50);
    });
    expect(next).toBe(450);
    expect(result.current.width).toBe(450);
    act(() => {
      next = result.current.bump(500);
    });
    expect(next).toBe(800);
  });
});
