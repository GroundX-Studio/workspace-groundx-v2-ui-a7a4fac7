import { afterEach, describe, expect, it, vi } from "vitest";

import { __clearEmbeddingCache, makeQuoteEmbedder } from "./quoteEmbedder.js";
import type { LlmClient } from "../types.js";

/**
 * wire-embedding-verification — the live `Embedder` over an OpenAI-compatible
 * `POST /embeddings` endpoint. Batched (one call per invocation), per-text
 * TTL+capped vector cache, resolve-0 best-effort failure handling (defense in
 * depth behind the verifyQuote seam catch).
 */

/** Deterministic fake vectors: a 3-dim unit-ish vector per known text. */
const VECTORS: Record<string, number[]> = {
  "quote text here": [1, 0, 0],
  "matching sentence.": [0.96, 0.28, 0], // cos vs quote = 0.96
  "unrelated sentence.": [0, 1, 0], // cos vs quote = 0
};

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Fake provider: answers each input with its VECTORS entry (or a default). */
function fakeClient(): { client: LlmClient; forward: ReturnType<typeof vi.fn> } {
  const forward = vi.fn(async (_path: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body)) as { model: string; input: string[] };
    return jsonOk({
      data: body.input.map((text) => ({ embedding: VECTORS[text] ?? [0, 0, 1] })),
    });
  });
  return { client: { forward }, forward };
}

afterEach(() => __clearEmbeddingCache());

describe("makeQuoteEmbedder", () => {
  it("sends ONE batched OpenAI-compatible request and returns the best cosine", async () => {
    const { client, forward } = fakeClient();
    const embed = makeQuoteEmbedder(client, "embed-model");

    const best = await embed("quote text here", ["matching sentence.", "unrelated sentence."]);

    expect(forward).toHaveBeenCalledOnce();
    const [path, init] = forward.mock.calls[0];
    expect(path).toBe("/embeddings");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.model).toBe("embed-model");
    expect(body.input).toEqual(["quote text here", "matching sentence.", "unrelated sentence."]);
    expect(best).toBeCloseTo(0.96, 2);
  });

  it("cache hit skips re-embedding already-seen texts", async () => {
    const { client, forward } = fakeClient();
    const embed = makeQuoteEmbedder(client, "embed-model");

    await embed("quote text here", ["matching sentence."]);
    await embed("quote text here", ["matching sentence.", "unrelated sentence."]);

    expect(forward).toHaveBeenCalledTimes(2);
    // Second call embeds ONLY the novel text.
    const secondBody = JSON.parse(String((forward.mock.calls[1][1] as RequestInit).body));
    expect(secondBody.input).toEqual(["unrelated sentence."]);
  });

  it("fully-cached invocation makes NO provider call", async () => {
    const { client, forward } = fakeClient();
    const embed = makeQuoteEmbedder(client, "embed-model");
    await embed("quote text here", ["matching sentence."]);
    const best = await embed("quote text here", ["matching sentence."]);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(best).toBeCloseTo(0.96, 2);
  });

  it("TTL expiry re-embeds", async () => {
    const { client, forward } = fakeClient();
    let t = 0;
    const embed = makeQuoteEmbedder(client, "embed-model", { now: () => t });
    await embed("quote text here", ["matching sentence."]);
    t = 6 * 60 * 1000; // past the 5-min TTL
    await embed("quote text here", ["matching sentence."]);
    expect(forward).toHaveBeenCalledTimes(2);
  });

  it("every failure mode resolves 0, never rejects", async () => {
    const failures: LlmClient[] = [
      { forward: async () => new Response("nope", { status: 500 }) }, // non-OK
      { forward: async () => jsonOk({ not: "the shape" }) }, // malformed
      { forward: async () => jsonOk({ data: [{ embedding: [1, 0] }] }) }, // wrong count
      {
        forward: async () => {
          throw new Error("timeout"); // thrown (incl. fetchWithTimeout abort)
        },
      },
    ];
    for (const client of failures) {
      __clearEmbeddingCache();
      const embed = makeQuoteEmbedder(client, "embed-model");
      await expect(embed("quote text here", ["matching sentence."])).resolves.toBe(0);
    }
  });

  it("dimension mismatch between quote and sentence vectors resolves 0", async () => {
    const client: LlmClient = {
      forward: async () => jsonOk({ data: [{ embedding: [1, 0, 0] }, { embedding: [1, 0] }] }),
    };
    const embed = makeQuoteEmbedder(client, "embed-model");
    await expect(embed("quote text here", ["matching sentence."])).resolves.toBe(0);
  });

  it("empty sentence list resolves 0 without a provider call", async () => {
    const { client, forward } = fakeClient();
    const embed = makeQuoteEmbedder(client, "embed-model");
    await expect(embed("quote text here", [])).resolves.toBe(0);
    expect(forward).not.toHaveBeenCalled();
  });

  it("caps sentences (48) and per-text chars (512)", async () => {
    const { client, forward } = fakeClient();
    const embed = makeQuoteEmbedder(client, "embed-model");
    const sentences = Array.from({ length: 60 }, (_, i) => `sentence number ${i}.`);
    const longQuote = "q".repeat(2_000);
    await embed(longQuote, sentences);
    const body = JSON.parse(String((forward.mock.calls[0][1] as RequestInit).body));
    expect(body.input).toHaveLength(1 + 48);
    for (const text of body.input as string[]) expect(text.length).toBeLessThanOrEqual(512);
  });

  it("entry cap evicts oldest insertions (cache cannot grow unbounded)", async () => {
    const { client, forward } = fakeClient();
    const embed = makeQuoteEmbedder(client, "embed-model", { maxCacheEntries: 3 });
    await embed("quote text here", ["matching sentence.", "unrelated sentence."]); // 3 entries
    await embed("another quote!!", ["matching sentence."]); // inserts 1 → evicts oldest
    forward.mockClear();
    await embed("quote text here", ["matching sentence."]); // oldest ("quote text here") was evicted
    const body = JSON.parse(String((forward.mock.calls[0][1] as RequestInit).body));
    expect(body.input).toContain("quote text here");
  });
});
