/**
 * wire-embedding-verification — the live `Embedder` implementation behind
 * `verifyQuote`'s third gate (embedding similarity).
 *
 * Wraps an OpenAI-compatible `POST /embeddings` endpoint reached through
 * `FetchLlmClient(env, "embeddings")` (which carries the tight
 * `EMBEDDINGS_TIMEOUT_MS` abort budget — citation verification blocks the
 * chat reply, so a dead provider costs ~2s, never the generic 30s upstream
 * timeout). One batched request per invocation: `[quote, ...sentences]`
 * minus cache hits.
 *
 * Best-effort by contract: every failure mode (non-OK, thrown/aborted,
 * malformed payload, vector-count or dimension mismatch) resolves `0` —
 * below any legal threshold — with one warn log. The `verifyQuote` seam
 * additionally catches rejections (defense in depth lives on BOTH sides).
 *
 * Cache: module-level per-text vector cache, TTL + hard entry cap. The
 * `wordMapCache.ts` pattern, but CAPPED — that cache is one entry per
 * document; this one is one entry per sentence string, so unbounded growth
 * is a real risk under sustained traffic. Chunk sentences repeat across
 * turns over the same document; the quote is the only usually-novel text.
 */

import type { LlmClient } from "../types.js";
import type { Embedder } from "./attribution.js";
import { logger } from "../lib/logger.js";

const TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 4096;
const MAX_SENTENCES = 48;
const MAX_TEXT_CHARS = 512;

interface CacheEntry {
  vector: number[];
  expiresAt: number;
}

// Map preserves insertion order — oldest-insertion eviction is a plain
// first-key delete.
const cache = new Map<string, CacheEntry>();

/** Test seam — clears the module cache between tests. */
export function __clearEmbeddingCache(): void {
  cache.clear();
}

function cosine(a: number[], b: number[]): number | null {
  if (a.length === 0 || a.length !== b.length) return null;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return null;
  // Clamp to [0,1]: negative cosine means "opposite meaning", which for a
  // verification threshold is just "no match".
  return Math.max(0, Math.min(1, dot / (Math.sqrt(na) * Math.sqrt(nb))));
}

function isVectorPayload(value: unknown): value is { data: Array<{ embedding: number[] }> } {
  if (value == null || typeof value !== "object") return false;
  const data = (value as { data?: unknown }).data;
  return (
    Array.isArray(data) &&
    data.every(
      (d) =>
        d != null &&
        typeof d === "object" &&
        Array.isArray((d as { embedding?: unknown }).embedding) &&
        ((d as { embedding: unknown[] }).embedding as unknown[]).every((n) => typeof n === "number"),
    )
  );
}

interface Options {
  /** Clock seam for TTL tests. */
  now?: () => number;
  /** Entry-cap seam for eviction tests (default 4096). */
  maxCacheEntries?: number;
}

/**
 * Build the live `Embedder`. `client` is expected to be
 * `new FetchLlmClient(env, "embeddings")`; `modelId` is
 * `env.EMBEDDINGS_MODEL_ID`.
 */
export function makeQuoteEmbedder(client: LlmClient, modelId: string, options: Options = {}): Embedder {
  const now = options.now ?? (() => Date.now());
  const maxEntries = options.maxCacheEntries ?? MAX_CACHE_ENTRIES;

  return async (quote, sentences) => {
    const cappedSentences = sentences.slice(0, MAX_SENTENCES).map((s) => s.slice(0, MAX_TEXT_CHARS));
    if (sentences.length > MAX_SENTENCES) {
      logger.warn(
        { dropped: sentences.length - MAX_SENTENCES },
        "quoteEmbedder: sentence cap applied; tail sentences not compared",
      );
    }
    const texts = [quote.slice(0, MAX_TEXT_CHARS), ...cappedSentences];
    if (cappedSentences.length === 0) return 0;

    try {
      const t = now();
      const fresh = (key: string): number[] | undefined => {
        const entry = cache.get(key);
        return entry && entry.expiresAt > t ? entry.vector : undefined;
      };
      const missing = [...new Set(texts.filter((text) => fresh(text) === undefined))];

      if (missing.length > 0) {
        const response = await client.forward("/embeddings", {
          method: "POST",
          body: JSON.stringify({ model: modelId, input: missing }),
        });
        if (!response.ok) {
          logger.warn({ status: response.status }, "quoteEmbedder: provider returned non-OK; quote unverified");
          return 0;
        }
        const payload = (await response.json()) as unknown;
        if (!isVectorPayload(payload) || payload.data.length !== missing.length) {
          logger.warn("quoteEmbedder: malformed embeddings payload; quote unverified");
          return 0;
        }
        missing.forEach((text, i) => {
          cache.set(text, { vector: payload.data[i].embedding, expiresAt: t + TTL_MS });
          while (cache.size > maxEntries) {
            const oldest = cache.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            cache.delete(oldest);
          }
        });
      }

      const [quoteVector, ...sentenceVectors] = texts.map((text) => fresh(text));
      if (!quoteVector) return 0;
      let best = 0;
      for (const vector of sentenceVectors) {
        if (!vector) continue;
        const score = cosine(quoteVector, vector);
        if (score === null) {
          logger.warn("quoteEmbedder: vector dimension mismatch; quote unverified");
          return 0;
        }
        best = Math.max(best, score);
      }
      return best;
    } catch (err) {
      logger.warn({ err }, "quoteEmbedder: embeddings call failed; quote unverified");
      return 0;
    }
  };
}
