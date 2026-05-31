/**
 * 2026-05-31-tool-system-completion (wf04 §4) — DialogTitle tools.
 *
 * `close_dialog` is a mutate-category tool whose handler dispatches a
 * `closeDialog` CanvasIntent. The DialogTitle primitive registers a matching
 * adapter that calls its `onClose` (the SAME action the close IconButton
 * invokes). Lives in the primitive glob-home (`components/primitives/**`)
 * opened by this change.
 */
import { describe, expect, it } from "vitest";

import { tools } from "./DialogTitle.tools";

describe("DialogTitle tools", () => {
  it("declares close_dialog (mutate)", () => {
    expect(tools.map((t) => t.name)).toEqual(["close_dialog"]);
    expect(tools[0].category).toBe("mutate");
  });

  it("close_dialog produces a closeDialog intent", () => {
    expect(tools[0].handler(tools[0].input.parse({}))).toEqual({ kind: "closeDialog" });
  });

  it("description meets the Phase 5b quality bar", () => {
    expect(/use when|triggers when/i.test(tools[0].description)).toBe(true);
    expect(tools[0].description.length).toBeGreaterThanOrEqual(40);
  });
});
