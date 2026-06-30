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

describe("pii regex DoS guard (TS-08)", () => {
  /**
   * The credit-card pattern `\b(?:\d[ -]*?){13,19}\b` and the phone
   * pattern share the catastrophic-backtracking shape (nested
   * quantifier + non-greedy + ambiguous separator class). On
   * adversarial input — long runs of digits, repeated separators —
   * a vulnerable build of these patterns can take seconds to
   * complete.
   *
   * Closure rule: every pathological shape we exercise must scrub
   * in well under 100 ms. We pick an aggressive 50 ms ceiling so a
   * regression fails before a real customer hits the timeout.
   */
  const PATHOLOGICAL_BUDGET_MS = 50;

  function timed(fn: () => void): number {
    const t0 = performance.now();
    fn();
    return performance.now() - t0;
  }

  it("50k repeated digits does not catastrophically backtrack the credit-card regex", () => {
    const input = "1".repeat(50_000) + " ok";
    const elapsed = timed(() => scrubString(input));
    expect(elapsed).toBeLessThan(PATHOLOGICAL_BUDGET_MS);
  });

  it("alternating digit + separator runs do not blow up the credit-card regex", () => {
    // 10k iterations of "1 " interleaves spaces inside the quantifier
    // body, exercising the worst path of `\d[ -]*?`.
    const input = "1 ".repeat(10_000) + "end";
    const elapsed = timed(() => scrubString(input));
    expect(elapsed).toBeLessThan(PATHOLOGICAL_BUDGET_MS);
  });

  it("long phone-shaped runs without a real boundary do not stall the phone regex", () => {
    const input = "555.".repeat(2_000) + "5555";
    const elapsed = timed(() => scrubString(input));
    expect(elapsed).toBeLessThan(PATHOLOGICAL_BUDGET_MS);
  });

  it("an account-prefix followed by 100k digits does not stall the account regex", () => {
    const input = "account no. " + "1".repeat(100_000);
    const elapsed = timed(() => scrubString(input));
    expect(elapsed).toBeLessThan(PATHOLOGICAL_BUDGET_MS);
  });

  it("a deeply nested object full of pathological strings still completes promptly", () => {
    const input: Record<string, unknown> = {};
    let cursor: Record<string, unknown> = input;
    for (let i = 0; i < 100; i += 1) {
      cursor.next = { payload: "1".repeat(1_000) };
      cursor = cursor.next as Record<string, unknown>;
    }
    const elapsed = timed(() => scrubValue(input));
    expect(elapsed).toBeLessThan(PATHOLOGICAL_BUDGET_MS);
  });
});
