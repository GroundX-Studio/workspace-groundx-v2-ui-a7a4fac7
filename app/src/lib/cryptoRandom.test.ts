import { describe, expect, it, vi } from "vitest";

import { cryptoRandom } from "@/lib/cryptoRandom";

describe("cryptoRandom", () => {
  it("returns a non-empty string", () => {
    const v = cryptoRandom();
    expect(typeof v).toBe("string");
    expect(v.length).toBeGreaterThan(0);
  });

  it("returns distinct values across calls", () => {
    expect(cryptoRandom()).not.toBe(cryptoRandom());
  });

  it("falls back to a Math.random id when crypto.randomUUID is unavailable", () => {
    // The whole point of the helper: a non-secure context / old jsdom lacks
    // crypto.randomUUID, where a bare call would throw. The fallback must still id.
    vi.stubGlobal("crypto", undefined);
    try {
      const v = cryptoRandom();
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
      expect(cryptoRandom()).not.toBe(v);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
