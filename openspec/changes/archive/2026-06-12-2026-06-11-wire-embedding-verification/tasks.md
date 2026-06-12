# Tasks — wire-embedding-verification

## 1. Failing user-visible test first (SEQUENTIAL — principle 2)

- [x] 1.1 `groundedAnswer.test.ts` — failing: a grounded turn whose emitted
      quote matches the chunk by meaning only (no exact/normalized hit), with
      a fixture `quoteEmbedder` injected via deps, yields a citation with
      `tier: "paraphrase"`, the chunk-level bbox, and `confidence` equal to
      the fixture cosine. Sibling assertions (green-from-start guards): same
      turn with NO `quoteEmbedder` dep (the dev-degrade path) ⇒
      `tier: "ambient"`; fixture embedder resolving 0 (provider
      failure/timeout) ⇒ `tier: "ambient"` and the turn succeeds; fixture
      embedder that REJECTS ⇒ `tier: "ambient"` and the turn succeeds (the
      seam, not the implementation, holds the never-fail invariant).
- [x] 1.2 `attribution.test.ts` — failing: async `verifyQuote` with an async
      `Embedder(quote, sentences)`; gate order (embedder NOT invoked when a
      lexical gate hits — spy); threshold boundary (0.82 default, override
      honored); a rejecting embedder yields `{verified:false, method:"none"}`
      without throwing; existing sync tests migrated to `await`.
      **Adversarial gate:** tests assert through the public seam, not
      internals; confirm no test was retargeted to pass vacuously.

## 2. Implement (SEQUENTIAL)

- [x] 2.1 `attribution.ts` — `Embedder` → async `(quote, sentences) =>
      Promise<number>`; `verifyQuote` async with optional `embedThreshold`
      (default 0.82); the embedding gate wrapped in try/catch so a rejecting
      embedder yields unverified, never a thrown rejection (the seam enforces
      the never-fail invariant); update the module header comment.
- [x] 2.2 `config/env.ts` — `EMBEDDINGS_BASE_URL` + `EMBEDDINGS_MODEL_ID`
      **required in production** (superRefine, like `LLM_MODEL_ID`);
      `EMBEDDINGS_API_KEY` OPTIONAL everywhere (keyless self-hosted providers
      are first-class); optional `EMBEDDINGS_AUTH_HEADER_NAME/_SCHEME`;
      `EMBEDDINGS_VERIFY_THRESHOLD` (0.5–0.99 default 0.82);
      `EMBEDDINGS_TIMEOUT_MS` (200–10000 default 2000). `llmClient.ts` —
      `LlmProfile` gains `"embeddings"` with two profile deviations: 503 only
      on missing base_url (auth header attached only when a key is set), and
      a per-profile timeout passing `EMBEDDINGS_TIMEOUT_MS` into
      `fetchWithTimeout`'s `timeoutMs` (genuine abort — no `Promise.race`
      that leaves the request running). `isEmbeddingsConfigured(env)` checks
      base_url + model_id. Env tests: production fail-fast truth table;
      production boots with key unset.
- [x] 2.3 `quoteEmbedder.ts` (new) — `makeQuoteEmbedder(client, modelId)`:
      batched OpenAI-compatible `POST /embeddings`, per-text TTL vector cache
      WITH entry cap (4096, oldest-insertion eviction — sentence-level
      cardinality, unlike per-doc wordMapCache) + `__clearEmbeddingCache`
      seam, sentence/char caps, cosine, resolve-0 best-effort failure
      handling (defense in depth behind the 2.1 seam catch). Failing unit
      tests first (`quoteEmbedder.test.ts`): request shape, auth header only
      when key set, cache-hit fetch count, TTL, entry-cap eviction, timeout
      resolves 0 within budget, every failure mode resolves 0, caps.
- [x] 2.4 `groundedAnswer.ts` — `GroundedAnswerDeps.quoteEmbedder?` +
      `embedThreshold?`; `verifiedCitations` awaits
      `verifyQuote(c.quote, text, deps.quoteEmbedder, deps.embedThreshold)`.
      `app.ts` — composition root builds the live embedder when
      `isEmbeddingsConfigured` and threads it (with the env threshold) into
      the deps for chat, report, and hybrid; logs a prominent dev-degrade
      warning at boot when the provider is unconfigured (test here, not in
      env tests — `env.ts` doesn't log).
      **Adversarial gate (per task 2.x):** every new export has a caller;
      every env var has a read site AND a behavioral test; no dormant
      plumbing; grep for stray sync `Embedder` usages.

## 3. Docs + deploy seams (SEQUENTIAL)

- [x] 3.1 `docs/agents/data-model.md` — note the `quoteEmbedder` deps seam +
      env block (same-change rule). Deploy: add the `EMBEDDINGS_*` vars to the
      Helm `values.yaml` env passthrough — base_url + model_id REQUIRED for
      production deploys (boot fails fast without them), api_key optional;
      on-prem points `EMBEDDINGS_BASE_URL` at a self-hosted TEI/Ollama/vLLM
      service, keyless is supported.
- [x] 3.2 `.env.example` (if present) / middleware README env table updated.

## 4. Verification + gates (SEQUENTIAL)

- [x] 4.1 Middleware vitest green (file-serial config); app suite untouched.
- [x] 4.2 `npm run build` (shared + middleware) green; drift guards green.
- [x] 4.3 `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all
      --strict` passes; durable-spec delta has no divergence from shipped
      behavior.
- [x] 4.4 Adversarial review gate (principle 3): falsify every proposal claim
      against the code; confirm a dead provider costs ≤ the timeout budget,
      never the 30s upstream timeout; confirm no citation field changes after
      the reply is assembled (final-at-reply-time); confirm the embedding
      gate cannot mint `exact`; confirm no secret-bearing value is logged
      (request bodies / API key never logged).

## Deferred (tracked, not dormant)

- D.1 Second caller for embeddings (semantic intent matching or snippet
  dedupe) — would justify promoting `quoteEmbedder`'s internals to a shared
  embeddings service. Do NOT pre-build; revisit when the caller is named.
- D.2 (pre-existing, noted in review) `verifiedCitations` fetches the
  word-map for ANY verified citation, though only `method:"exact"` can use
  it — normalized/embedding-verified citations pay a cached-but-wasted fetch.
  Optional nicety: gate the fetch on `v.method === "exact"`. Not introduced
  by this change; do it here only if free.
- D.3 Threshold calibration pass against a labeled paraphrase corpus (the
  0.82 default is inherited from the seam's authoring, not measured). Run
  once a real embeddings deployment exists; tune via
  `EMBEDDINGS_VERIFY_THRESHOLD` without code change.
