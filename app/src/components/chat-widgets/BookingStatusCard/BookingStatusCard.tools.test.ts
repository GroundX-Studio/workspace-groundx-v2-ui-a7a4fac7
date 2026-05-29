/**
 * widget-llm-integration follow-up B.3 — BookingStatusCard tools.
 */
import { describe, expect, it } from "vitest";

import { tools } from "./BookingStatusCard.tools";

describe("BookingStatusCard tools", () => {
  it("declares book_call (mutate)", () => {
    expect(tools.map((t) => t.name)).toEqual(["book_call"]);
    expect(tools[0].category).toBe("mutate");
  });

  it("book_call takes no arguments and produces openBookCall intent", () => {
    expect(tools[0].handler(tools[0].input.parse({}))).toEqual({
      kind: "openBookCall",
    });
  });

  it("description meets Phase 5b quality bar", () => {
    expect(/use when|triggers when/i.test(tools[0].description)).toBe(true);
    expect(tools[0].description.length).toBeGreaterThanOrEqual(40);
  });
});
