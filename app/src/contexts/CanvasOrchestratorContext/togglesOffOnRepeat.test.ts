import { describe, expect, it } from "vitest";

import { togglesOffOnRepeat } from "./togglesOffOnRepeat";

const step = { documentId: "doc-1" };

describe("togglesOffOnRepeat", () => {
  it("toggles off on a user re-dispatch of the identical value", () => {
    expect(
      togglesOffOnRepeat({
        source: "user",
        activeDocViewer: step,
        documentId: "doc-1",
        current: { page: 2, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } },
        incoming: { page: 2, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.4 } },
      }),
    ).toBe(true);
  });

  it("never toggles for agent-sourced dispatches", () => {
    expect(
      togglesOffOnRepeat({
        source: "agent",
        activeDocViewer: step,
        documentId: "doc-1",
        current: { page: 2 },
        incoming: { page: 2 },
      }),
    ).toBe(false);
  });

  it("does not toggle when the value differs", () => {
    expect(
      togglesOffOnRepeat({
        source: "user",
        activeDocViewer: step,
        documentId: "doc-1",
        current: [{ page: 1 }],
        incoming: [{ page: 1 }, { page: 2 }],
      }),
    ).toBe(false);
  });

  it("does not toggle without an active doc-viewer / on another document / with no current value", () => {
    const base = { source: "user", documentId: "doc-1", current: { page: 1 }, incoming: { page: 1 } };
    expect(togglesOffOnRepeat({ ...base, activeDocViewer: null })).toBe(false);
    expect(togglesOffOnRepeat({ ...base, activeDocViewer: { documentId: "doc-2" } })).toBe(false);
    expect(togglesOffOnRepeat({ ...base, activeDocViewer: step, current: null })).toBe(false);
  });

  it("treats an empty regions array as no current value via the caller's null-mapping", () => {
    // Callers map `litRegions.length === 0` to null before calling — pinned
    // here so the mapping contract is visible.
    const litRegions: Array<{ page: number }> = [];
    expect(
      togglesOffOnRepeat({
        source: "user",
        activeDocViewer: step,
        documentId: "doc-1",
        current: litRegions.length > 0 ? litRegions : null,
        incoming: [],
      }),
    ).toBe(false);
  });
});
