import { describe, expect, it } from "vitest";

import { formatMessageTime } from "./formatMessageTime";

/**
 * Pure, deterministic (both `ts` and `now` injected — no `Date.now()` inside):
 * clock time for a message sent today, prefixed with the date once it isn't.
 */
describe("formatMessageTime", () => {
  it("shows clock time only for a message sent today", () => {
    const ts = new Date(2026, 6, 2, 11, 33).getTime(); // Jul 2 2026, 11:33 local
    const now = new Date(2026, 6, 2, 15, 0).getTime(); // same day, later
    expect(formatMessageTime(ts, now)).toBe("11:33 AM");
  });

  it("prefixes the date for a message from a prior day", () => {
    const ts = new Date(2026, 6, 1, 11, 33).getTime(); // Jul 1
    const now = new Date(2026, 6, 2, 9, 0).getTime(); // Jul 2
    expect(formatMessageTime(ts, now)).toBe("Jul 1, 11:33 AM");
  });

  it("treats a just-before-midnight message as a prior day (boundary)", () => {
    const ts = new Date(2026, 6, 1, 23, 59).getTime(); // Jul 1, 11:59 PM
    const now = new Date(2026, 6, 2, 0, 1).getTime(); // Jul 2, 12:01 AM
    expect(formatMessageTime(ts, now)).toBe("Jul 1, 11:59 PM");
  });

  it("same clock time on different days still gets the date", () => {
    const ts = new Date(2026, 5, 15, 8, 5).getTime(); // Jun 15, 8:05 AM
    const now = new Date(2026, 6, 2, 8, 5).getTime();
    expect(formatMessageTime(ts, now)).toBe("Jun 15, 8:05 AM");
  });
});
