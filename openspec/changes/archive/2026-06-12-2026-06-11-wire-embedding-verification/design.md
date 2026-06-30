# Design — wire-embedding-verification

## Context

`verifyQuote(quote, chunkText, embedder?)` already implements the three-gate
order (exact → normalized → embedding-vs-each-sentence ≥ 0.82) and
`assignTier`/`confidenceFor` already map an `"embedding"` verification to
`paraphrase` / cosine-confidence. The gap is purely operational: there is no
async-capable embedder implementation, no provider config, and no threading
from the composition root to `verifiedCitations`.

## Alternatives considered

1. **Keep `verifyQuote` sync; add a separate async semantic-fallback step in
   `verifiedCitations`.** Rejected: duplicates the sentence-split + threshold
   logic in a second home, and splits the gate order across two files — two
   sources of truth for one verification policy.
2. **Pre-embed outside and pass a sync cosine closure.** Rejected: the caller
   would need to re-implement `verifyQuote`'s sentence splitting to know what
   to embed — same duplication, leakier.
3. **Reuse `LLM_LIGHT_*` for embeddings.** Rejected: chat/light providers may
   be Anthropic (no embeddings endpoint); an embeddings model id is a distinct
   deployment concern. Explicit `EMBEDDINGS_*` block instead.
4. **Defer entirely.** Rejected in proposal.md ("Decision: build now").
5. **Opt-in feature flag.** Rejected (user decision 2026-06-11): always-on is
   the only mode; `EMBEDDINGS_*` is production-required. Lexical-only exists
   only as runtime degradation, never as a configuration.
6. **Non-blocking verification (reply first, upgrade tier later).** Rejected
   (user-approved blocking instead, 2026-06-11):
   citations must be final at reply time — the app auto-highlights
   `citations[0]` on arrival, and a post-hoc tier upgrade would visibly
   re-render the highlight; also requires a server-push channel that doesn't
   exist. Blocking with a tight per-call timeout budget instead.

## Chosen design

### Seam change (attribution.ts)

```ts
/** Best semantic similarity (cosine in [0,1]) of quote vs the given sentences.
 *  Best-effort: resolves 0 on any provider failure. */
export type Embedder = (quote: string, sentences: string[]) => Promise<number>;

export async function verifyQuote(
  quote: string, chunkText: string, embedder?: Embedder,
): Promise<QuoteVerification>
```

Gate order unchanged. The lexical gates remain synchronous logic inside;
only the embedding gate awaits. Sentence split stays where it is (one home).
The threshold is `embedThreshold?: number` (default 0.82) — a fourth optional
positional arg on `verifyQuote` (matching the threading-section call site),
threaded from env so tuning needs no code change.

**The never-fail invariant is enforced IN `verifyQuote`, not by embedder
politeness**: the embedding gate is wrapped in try/catch — a rejecting
embedder (an injected test double, a future second implementation) yields
`{verified:false, method:"none"}` with a logged warning, never a thrown
rejection into `verifiedCitations`' `Promise.all`. The live `quoteEmbedder`
additionally resolves 0 on its own failures (defense in depth), but the seam
holds the spec's "MUST NOT fail the chat turn" on its own.

Callers to update: `verifiedCitations` (already async — adds one `await`) and
`attribution.test.ts` (tests `await` and fake embedders become
`async (q, sentences) => …`).

### Live embedder (quoteEmbedder.ts — new)

```ts
export function makeQuoteEmbedder(
  client: LlmClient,            // FetchLlmClient(env, "embeddings")
  modelId: string,
  opts?: { now?: () => number } // test seam
): Embedder
```

- One `POST /embeddings` per invocation with `input: [quote, ...sentences]`
  minus cache hits; OpenAI-compatible body `{ model, input }`, response
  `{ data: [{ embedding: number[] }, …] }`.
- **Caps**: sentences capped at 48 (longest-first is unnecessary — keep document
  order, log when truncating); each text capped at 512 chars before embedding.
- **Cache**: module-level `Map<string, {vector, expiresAt}>` keyed by the
  normalized text, TTL 5 min, `__clearEmbeddingCache()` test seam — mirrors
  `wordMapCache.ts` BUT with a hard entry cap (4096; on overflow evict the
  oldest insertion). The word-map cache is one entry per document; this one
  is one entry per sentence string, so the precedent's no-cap posture does
  not transfer. Chunk sentences repeat across turns over the same document;
  the quote is the only usually-novel text.
- **Failure**: non-OK / thrown / malformed / dimension-mismatch / timeout →
  resolve `0`, `logger.warn` once per call.
- **Timeout plumbing** (NOT a `Promise.race` — that resolves early but leaves
  the HTTP request running un-aborted): `FetchLlmClient.forward` currently
  hardcodes `UPSTREAM_TIMEOUT_MS` into `fetchWithTimeout`, which already
  accepts a per-call `timeoutMs`. `FetchLlmClient` gains a per-profile
  timeout — the `"embeddings"` profile passes `EMBEDDINGS_TIMEOUT_MS`
  (default 2000) so the fetch is genuinely aborted at the budget; `"chat"`
  and `"light"` keep `UPSTREAM_TIMEOUT_MS`. The reply blocks on verification,
  so a dead provider must cost ~2s, not 30s.
- Cosine computed locally; vectors are not persisted (in-memory only — no DB
  bytes, so no round-trip obligation beyond the cache's own read path).

### Provider client (llmClient.ts)

`LlmProfile` gains `"embeddings"`; `FetchLlmClient` reads
`EMBEDDINGS_BASE_URL/API_KEY` with auth header/scheme falling back to
chat-side equivalents — same shape as the `"light"` profile, with two
deliberate deviations: (1) the embeddings profile 503s only when the BASE URL
is missing — a missing API key is valid (keyless self-hosted providers); the
auth header is attached only when a key is set; (2) the profile carries its
own timeout — `EMBEDDINGS_TIMEOUT_MS` is passed as `fetchWithTimeout`'s
per-call `timeoutMs` so the request aborts at the budget (chat/light keep
`UPSTREAM_TIMEOUT_MS`). `isEmbeddingsConfigured(env)` mirrors
`isLightLlmConfigured` but checks only base_url + model_id.

### Env (config/env.ts)

| Var | Type | Default | Notes |
|---|---|---|---|
| `EMBEDDINGS_BASE_URL` | url, **required in production** | — | self-hostable seam (TEI/Ollama/vLLM) |
| `EMBEDDINGS_API_KEY` | string, optional | — | optional EVERYWHERE — keyless self-hosted providers are first-class; auth header is set only when a key is present |
| `EMBEDDINGS_MODEL_ID` | string, **required in production** | — | |
| `EMBEDDINGS_AUTH_HEADER_NAME` | string, optional | falls back to `LLM_AUTH_HEADER_NAME` | |
| `EMBEDDINGS_AUTH_SCHEME` | string, optional | falls back to `LLM_AUTH_SCHEME` | |
| `EMBEDDINGS_VERIFY_THRESHOLD` | number 0.5–0.99 | 0.82 | read site: verifyQuote `embedThreshold` arg |
| `EMBEDDINGS_TIMEOUT_MS` | int 200–10000 | 2000 | per-profile timeout in `FetchLlmClient` → `fetchWithTimeout(timeoutMs)`; aborts the request |

Production requires `EMBEDDINGS_BASE_URL` + `EMBEDDINGS_MODEL_ID` via
`superRefine` (fail fast at boot). `EMBEDDINGS_API_KEY` is deliberately NOT
required: the embeddings profile in `FetchLlmClient` must not 503 on a
missing key (unlike chat/light) — it requires only the base URL, and attaches
the auth header only when a key is set. Dev/test boot without provider vars:
the composition root (`app.ts`) logs a prominent warning and the verify path
degrades at runtime, so local work and CI don't demand a live embeddings
provider. There is no feature flag — always-on is the only mode (user
decision 2026-06-11).

### Threading (groundedAnswer.ts + app.ts)

- `GroundedAnswerDeps.quoteEmbedder?: Embedder` with a doc comment mirroring
  `wordMapFetch` ("defaults to none — lexical-only; the composition root
  passes the live embedder when `EMBEDDINGS_*` is configured; tests inject a
  fixture").
- `verifiedCitations`: `const v = await verifyQuote(c.quote, text,
  deps.quoteEmbedder, deps.embedThreshold)`. The threshold travels as its own
  optional dep `GroundedAnswerDeps.embedThreshold?: number` (default 0.82 in
  `verifyQuote`) — two flat optional deps, no wrapper object.
- `app.ts`: `isEmbeddingsConfigured(env)` → build once
  (`makeQuoteEmbedder(new FetchLlmClient(env, "embeddings"), env.EMBEDDINGS_MODEL_ID)`)
  → include in the deps object handed to chat, report, and hybrid callers.
  One wiring point; all three grounded routes inherit.

### UX of the blocking check

Citations must be FINAL at reply time: they ship in the reply envelope and the
app auto-highlights `citations[0]` on arrival (a later tier upgrade would
visibly re-render the highlight mid-read). So verification blocks the reply,
bounded by: lexical-miss-only triggering (most turns add 0 ms), one batched
call per missed citation — parallel ACROSS citations via the existing
per-citation `Promise.all`; within a single citation the chain is sequential
(verifyQuote with the embedding gate first, then the verified-only word-map
fetch), so a citation's worst case is the embed budget + a cached word-map
fetch in series — and the 2s per-call budget, which aborts the request.
Worst case (dead provider + a missed citation): the turn arrives ~2s later
with that citation at `ambient`. No spinner/UI change needed — this is within
normal grounded-completion variance (5–15s P95).

### Latency / cost envelope

- Triggered only on a lexical miss of an emitted citation — typically 0–2 per
  turn, never for verbatim answers.
- One batched HTTP call per missed citation, ≤49 short inputs, against a small
  embedding model — tens of ms self-hosted, ~100–300 ms hosted. Parallel
  across citations (the existing per-citation `Promise.all`); within one
  citation it precedes the verified-only word-map fetch, adding one sequential
  step to that citation's chain, hard-bounded by `EMBEDDINGS_TIMEOUT_MS`.
- Vector cache (TTL + entry cap) bounds repeat cost across turns on the same
  document.

### Failure semantics (restating the spec'd invariant)

Embedder absent, misconfigured, erroring, REJECTING, or below threshold ⇒
`{verified:false, method:"none"}` ⇒ tier `ambient` ⇒ turn succeeds. The
rejection case is caught in `verifyQuote` itself (the seam enforces the
invariant); the live embedder's resolve-0 behavior is defense in depth.

### Testing

- `attribution.test.ts`: async migration; embedding gate hit/miss around the
  threshold; threshold override honored; embedder only invoked after both
  lexical gates miss (spy); a REJECTING embedder yields
  `{verified:false, method:"none"}` without throwing.
- `quoteEmbedder.test.ts` (new): batched request shape; auth header present
  only when a key is configured; cosine correctness on fixture vectors; cache
  hit skips re-embed (fetch spy count); TTL expiry; entry cap evicts; timeout
  resolves 0 within budget; every failure mode resolves 0; caps applied.
- `groundedAnswer.test.ts`: user-visible — paraphrase-by-meaning quote +
  injected fixture embedder ⇒ citation `tier:"paraphrase"`, chunk bbox,
  `confidence` = cosine; rejecting embedder ⇒ `ambient` and turn succeeds;
  embedder resolving 0 ⇒ `ambient` and turn succeeds; no embedder dep ⇒
  today's behavior byte-identical.
- env tests: threshold + timeout bounds; production fail-fast on missing
  base_url/model_id; production boots with key unset;
  `isEmbeddingsConfigured` truth table.
