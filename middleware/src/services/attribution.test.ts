import { describe, expect, it, vi } from "vitest";

import { assignTier, confidenceFor, verifyQuote, type Embedder } from "./attribution.js";

const text = "Current Charges total $7,613.20 for the April billing period.";

describe("verifyQuote (WF-06 Bridge B verification gate)", () => {
  it("exact verbatim substring → verified/exact", async () => {
    expect(await verifyQuote("Current Charges total $7,613.20", text)).toEqual({
      verified: true,
      method: "exact",
      score: 1,
    });
  });

  it("normalized match strips case/whitespace/punctuation", async () => {
    // Verbatim words, but different case + collapsed spacing than the source.
    const v = await verifyQuote("current charges   total $7,613.20", text);
    expect(v.verified).toBe(true);
    expect(v.method).toBe("normalized");
  });

  it("embedding fallback when lexical fails (fixture embedder)", async () => {
    const embedder: Embedder = async (_q, sentences) =>
      sentences.some((s) => s.includes("Current Charges")) ? 0.9 : 0.1;
    const v = await verifyQuote("the total amount billed for the month", text, embedder);
    expect(v).toMatchObject({ verified: true, method: "embedding" });
    expect(v.score).toBeGreaterThanOrEqual(0.82);
  });

  it("embedder receives the quote and the chunk's sentences", async () => {
    const embedder = vi.fn<Embedder>(async () => 0.9);
    await verifyQuote("the total amount billed for the month", text, embedder);
    expect(embedder).toHaveBeenCalledOnce();
    const [quote, sentences] = embedder.mock.calls[0];
    expect(quote).toBe("the total amount billed for the month");
    expect(sentences).toEqual([text]);
  });

  it("gate order: embedder is NOT invoked when a lexical gate verifies", async () => {
    const embedder = vi.fn<Embedder>(async () => 0.99);
    await verifyQuote("Current Charges total $7,613.20", text, embedder); // exact
    await verifyQuote("current charges   total $7,613.20", text, embedder); // normalized
    expect(embedder).not.toHaveBeenCalled();
  });

  it("cosine below the default 0.82 threshold → unverified", async () => {
    const v = await verifyQuote("the total amount billed for the month", text, async () => 0.81);
    expect(v).toEqual({ verified: false, method: "none", score: 0 });
  });

  it("embedThreshold override is honored both ways", async () => {
    const embedder: Embedder = async () => 0.7;
    expect((await verifyQuote("the total amount billed for the month", text, embedder, 0.6)).method).toBe(
      "embedding",
    );
    expect((await verifyQuote("the total amount billed for the month", text, embedder, 0.75)).verified).toBe(
      false,
    );
  });

  it("a REJECTING embedder yields unverified, never a thrown rejection", async () => {
    const embedder: Embedder = async () => {
      throw new Error("provider exploded");
    };
    await expect(verifyQuote("the total amount billed for the month", text, embedder)).resolves.toEqual({
      verified: false,
      method: "none",
      score: 0,
    });
  });

  it("no lexical/semantic match → unverified", async () => {
    expect(await verifyQuote("completely unrelated content string", text)).toEqual({
      verified: false,
      method: "none",
      score: 0,
    });
  });

  it("too-short quote is not a valid anchor → unverified", async () => {
    expect((await verifyQuote("$7,613", text)).verified).toBe(false); // 6 chars < min anchor length
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
