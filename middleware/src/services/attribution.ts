/**
 * WF-06 — response→source attribution: verification gate + tier assignment.
 *
 * Bridge B (answer → suggestedText) is quote-grounded structured generation:
 * the LLM emits a verbatim `quote` per claim. This module VERIFIES that quote
 * against the chunk the LLM cited, then assigns a graduated-precision tier:
 *
 *   - exact      quote is verbatim in the raw text AND atoms resolve → word box
 *                (WF-05's `-118-map` word-level resolver, fetched live in the
 *                chat router via `wordMapCache.ts`)
 *   - paraphrase quote matches the chunk text (exact/normalized/embedding)    → chunk box (WF-03)
 *   - ambient    quote unverified / no structured claim                       → source chip only
 *
 * Forcing a verbatim quote (a) suppresses hallucinated citations and (b) gives
 * a string that exists in the source to localize. Never fabricate precision
 * from a weak match — a quote that doesn't verify drops to `ambient`.
 */
import { normalizeText } from "./citationGeometry.js";

export type VerifyMethod = "exact" | "normalized" | "embedding" | "none";

export interface QuoteVerification {
  verified: boolean;
  method: VerifyMethod;
  /** [0,1] — 1 for exact, 0.9 normalized, embedding cosine for embedding, 0 none. */
  score: number;
}

/** Optional semantic similarity (cosine in [0,1]). Lexical-only when absent. */
export type Embedder = (a: string, b: string) => number;

/** Quotes shorter than this are too generic to anchor — treated as unverified. */
const MIN_QUOTE_LEN = 8;
const EMBED_THRESHOLD = 0.82;
const NORMALIZED_SCORE = 0.9;

/**
 * Verify a claim's supporting quote against the cited chunk's text.
 * Gate order: exact substring → normalized substring (case/whitespace/
 * punctuation/currency stripped) → embedding similarity vs each sentence
 * (only if an embedder is supplied). Below threshold → unverified.
 */
export function verifyQuote(quote: string, chunkText: string, embedder?: Embedder): QuoteVerification {
  const q = (quote ?? "").trim();
  const text = chunkText ?? "";
  if (q.length < MIN_QUOTE_LEN || !text) return { verified: false, method: "none", score: 0 };

  if (text.includes(q)) return { verified: true, method: "exact", score: 1 };

  const nq = normalizeText(q);
  const nt = normalizeText(text);
  if (nq && nt.includes(nq)) return { verified: true, method: "normalized", score: NORMALIZED_SCORE };

  if (embedder) {
    const sentences = text.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
    let best = 0;
    for (const s of sentences) best = Math.max(best, embedder(q, s));
    if (best >= EMBED_THRESHOLD) return { verified: true, method: "embedding", score: best };
  }

  return { verified: false, method: "none", score: 0 };
}

// The attribution tier IS the shared `CitationTier` (`@groundx/shared`) — used
// directly (no `AttributionTier` alias).
import type { CitationTier } from "@groundx/shared";

/**
 * Map a verification result to the highlight tier. The `exact` (word-level)
 * tier requires a resolved atom box from WF-05's `-118-map` (`hasAtomBox`);
 * when the word-map can't be fetched or the span isn't verbatim, a verified
 * claim degrades cleanly to `paraphrase` (chunk-level). The caller (chat
 * router) supplies `hasAtomBox` from the live word-map resolve.
 */
export function assignTier(v: QuoteVerification, opts: { hasAtomBox: boolean }): CitationTier {
  if (!v.verified) return "ambient";
  if (opts.hasAtomBox && v.method === "exact") return "exact";
  return "paraphrase";
}

/** Citation confidence for a verification result, [0,1]. */
export function confidenceFor(v: QuoteVerification): number {
  if (!v.verified) return 0;
  if (v.method === "exact") return 1;
  if (v.method === "normalized") return NORMALIZED_SCORE;
  if (v.method === "embedding") return v.score;
  return 0;
}
