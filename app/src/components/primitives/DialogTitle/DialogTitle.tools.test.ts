/**
 * 2026-05-31-tool-system-completion (wf04 §4) — DialogTitle tools.
 *
 * `close_dialog` is a mutate-category metadata declaration mirrored by the
 * middleware `SERVER_TOOL_CATALOG`, where the executable intent builder lives.
 * Lives in the primitive glob-home (`components/primitives/**`) opened by this
 * change.
 */
import { describe, expect, it } from "vitest";

import { tools } from "./DialogTitle.tools";

describe("DialogTitle tools", () => {
  it("declares close_dialog (mutate)", () => {
    expect(tools.map((t) => t.name)).toEqual(["close_dialog"]);
    expect(tools[0].category).toBe("mutate");
  });

  it("close_dialog takes no arguments", () => {
    expect(tools[0].input.parse({})).toEqual({});
  });

  it("description meets the Phase 5b quality bar", () => {
    expect(/use when|triggers when/i.test(tools[0].description)).toBe(true);
    expect(tools[0].description.length).toBeGreaterThanOrEqual(40);
  });
});
