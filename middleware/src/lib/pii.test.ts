import { describe, expect, it } from "vitest";

import { scrubString, scrubValue } from "./pii.js";

describe("pii.scrubString", () => {
  it("redacts emails", () => {
    expect(scrubString("write to me at user@example.com please")).toBe("write to me at [REDACTED] please");
  });

  it("redacts US phone formats", () => {
    expect(scrubString("call 415-555-0123")).toBe("call [REDACTED]");
    expect(scrubString("call (415) 555-0123")).toBe("call [REDACTED]");
    expect(scrubString("call +1 415.555.0123")).toBe("call [REDACTED]");
  });

  it("redacts SSN 3-2-4", () => {
    expect(scrubString("ssn 123-45-6789 here")).toBe("ssn [REDACTED] here");
  });

  it("redacts credit-card-shaped digit runs", () => {
    expect(scrubString("card 4111 1111 1111 1111 yes")).toBe("card [REDACTED] yes");
  });

  it("redacts account-number patterns", () => {
    expect(scrubString("account no. 1234567890 active")).toBe("[REDACTED] active");
  });

  it("with categorize: true tags by category", () => {
    expect(scrubString("hello user@example.com", { categorize: true })).toBe("hello [REDACTED:email]");
  });

  it("idempotent on already-scrubbed input", () => {
    expect(scrubString("[REDACTED] hi [REDACTED]")).toBe("[REDACTED] hi [REDACTED]");
  });
});

describe("pii.scrubValue", () => {
  it("walks nested objects", () => {
    const input = {
      user: { email: "user@example.com", name: "Pat" },
      logs: ["call 415-555-0123", "no pii here"],
    };
    const scrubbed = scrubValue(input);
    expect(scrubbed.user.email).toBe("[REDACTED]");
    expect(scrubbed.user.name).toBe("Pat");
    expect(scrubbed.logs[0]).toBe("call [REDACTED]");
    expect(scrubbed.logs[1]).toBe("no pii here");
  });

  it("passes through non-string primitives", () => {
    expect(scrubValue({ n: 5, b: true, x: null })).toEqual({ n: 5, b: true, x: null });
  });

  it("handles cycles without exploding", () => {
    const obj: Record<string, unknown> = { email: "user@example.com" };
    obj.self = obj;
    const scrubbed = scrubValue(obj) as Record<string, unknown>;
    expect(scrubbed.email).toBe("[REDACTED]");
    expect(scrubbed.self).toBe("[CYCLE]");
  });
});
