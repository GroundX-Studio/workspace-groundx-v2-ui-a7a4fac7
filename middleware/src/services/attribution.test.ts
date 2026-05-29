import { describe, expect, it } from "vitest";

import { assignTier, confidenceFor, verifyQuote } from "./attribution.js";

const text = "Current Charges total $7,613.20 for the April billing period.";

describe("verifyQuote (WF-06 Bridge B verification gate)", () => {
  it("exact verbatim substring → verified/exact", () => {
    expect(verifyQuote("Current Charges total $7,613.20", text)).toEqual({
      verified: true,
      method: "exact",
      score: 1,
    });
  });

  it("normalized match strips case/whitespace/punctuation", () => {
    // Verbatim words, but different case + collapsed spacing than the source.
    const v = verifyQuote("current charges   total $7,613.20", text);
    expect(v.verified).toBe(true);
    expect(v.method).toBe("normalized");
  });

  it("embedding fallback when lexical fails (mock embedder)", () => {
    const embedder = (_q: string, sentence: string) => (sentence.includes("Current Charges") ? 0.9 : 0.1);
    const v = verifyQuote("the total amount billed for the month", text, embedder);
    expect(v).toMatchObject({ verified: true, method: "embedding" });
    expect(v.score).toBeGreaterThanOrEqual(0.82);
  });

  it("no lexical/semantic match → unverified", () => {
    expect(verifyQuote("completely unrelated content string", text)).toEqual({
      verified: false,
      method: "none",
      score: 0,
    });
  });

  it("too-short quote is not a valid anchor → unverified", () => {
    expect(verifyQuote("$7,613", text).verified).toBe(false); // 6 chars < min anchor length
  });
});

describe("assignTier (WF-06 graduated precision)", () => {
  it("unverified → ambient", () => {
    expect(assignTier({ verified: false, method: "none", score: 0 }, { hasAtomBox: false })).toBe("ambient");
  });

  it("verified + verbatim + atom box → exact (word level)", () => {
    expect(assignTier({ verified: true, method: "exact", score: 1 }, { hasAtomBox: true })).toBe("exact");
  });

  it("verified but no atom box → paraphrase (exact tier dormant w/o WF-05 1b)", () => {
    expect(assignTier({ verified: true, method: "exact", score: 1 }, { hasAtomBox: false })).toBe("paraphrase");
  });

  it("verified via normalized/embedding → paraphrase (not verbatim raw)", () => {
    expect(assignTier({ verified: true, method: "normalized", score: 0.9 }, { hasAtomBox: true })).toBe("paraphrase");
    expect(assignTier({ verified: true, method: "embedding", score: 0.85 }, { hasAtomBox: true })).toBe("paraphrase");
  });
});

describe("confidenceFor", () => {
  it("maps verification method → confidence", () => {
    expect(confidenceFor({ verified: true, method: "exact", score: 1 })).toBe(1);
    expect(confidenceFor({ verified: true, method: "normalized", score: 0.9 })).toBe(0.9);
    expect(confidenceFor({ verified: true, method: "embedding", score: 0.85 })).toBe(0.85);
    expect(confidenceFor({ verified: false, method: "none", score: 0 })).toBe(0);
  });
});
