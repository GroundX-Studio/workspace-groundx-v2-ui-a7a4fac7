# Wire the embedding-similarity citation-verification tier

## Why

`verifyQuote` (middleware/src/services/attribution.ts) verifies each
LLM-emitted `supportingQuote` by exact substring, then normalized match. The
third gate — embedding similarity — exists as an optional `embedder` parameter
but nothing wires it: `verifiedCitations` (groundedAnswer.ts) calls
`verifyQuote` two-arg. The durable chat-routing spec records this as "no
production wiring today — the named evolution". The consequence is user-visible:
a quote that paraphrases the source by meaning (reworded, reordered, unit-
converted) fails both lexical gates and demotes to the `ambient` tier — a soft
source-region instead of the chunk-level highlight it earned. Pre-launch
posture (do it the right way) says close this gap with the correct,
self-hostable design rather than leave the tier permanently lexical-only.

## Decision: build now, always-on (user decision 2026-06-11)

Defer was weighed and rejected; an opt-in flag was also rejected. The
embedding tier is **the default and only mode**: the embeddings provider
(`EMBEDDINGS_BASE_URL` + `EMBEDDINGS_MODEL_ID`) is REQUIRED in production
(same posture as `LLM_MODEL_ID` — fail fast at boot, no half-configured
deployments; the API key alone stays optional for keyless self-hosted
providers, see item 3), and the
verification pipeline always attempts all three gates. There is no feature
flag. Lexical-only is not a supported production posture; it survives only as
the runtime *degradation* when the provider errors or times out (a turn must
never break on verification — see UX section).

- The expensive parts already shipped: gate order, tier mapping
  (`assignTier` — embedding never reaches `exact`), confidence mapping,
  best-effort failure semantics are all spec'd and tested. What remains is a
  thin provider seam + composition-root threading.
- Earn-the-axis check: we add **no new abstraction**. The `Embedder` seam
  already exists in code and spec; the env/client work is a third **value**
  (`"embeddings"`) on the existing `FetchLlmClient` profile axis
  (`"chat" | "light"`), and the deps threading mirrors the established
  `wordMapFetch` / `skillsRetrieve` injectable-seam pattern (2+ precedents).
  We deliberately do NOT build a generic `EmbeddingsService` — the verify path
  is its only caller today; future candidates (semantic intent matching,
  snippet dedupe) are noted, not built.

## What changes

1. **`Embedder` becomes async + batched-friendly** (attribution.ts): the seam
   changes from sync `(a, b) => number` to
   `(quote: string, sentences: string[]) => Promise<number>` returning the best
   cosine in [0,1]. `verifyQuote` becomes async (its one production caller,
   `verifiedCitations`, is already async). A sync pairwise embedder cannot be
   backed by a real HTTP embeddings API; handing the embedder the whole
   sentence list enables one batched call instead of N.
2. **Live embedder** (`middleware/src/services/quoteEmbedder.ts`): builds an
   `Embedder` over an OpenAI-compatible `POST /embeddings` endpoint via
   `FetchLlmClient` profile `"embeddings"`. Batches `[quote, ...sentences]`
   into one request, computes cosine, caches vectors per normalized text with
   a TTL + hard entry cap (the `wordMapCache.ts` pattern, capped because this
   cache is per-sentence, not per-document; `__clear*` test seam). Best-effort: any
   error / timeout / malformed response resolves `0` (below threshold) and
   logs a warning — never throws into the turn.
3. **Env block** (`config/env.ts`): `EMBEDDINGS_BASE_URL` and
   `EMBEDDINGS_MODEL_ID` — **required in production** (superRefine, same
   posture as `LLM_MODEL_ID`; dev/test boot without them with a logged
   warning and runtime degradation, so local work doesn't demand a provider).
   `EMBEDDINGS_API_KEY` is **optional everywhere**: the headline self-host
   targets (TEI, vLLM, air-gapped Ollama) commonly run with no auth, so the
   embeddings profile authenticates only when a key is set — requiring a
   dummy key on keyless deployments would contradict the on-prem posture.
   Optional `EMBEDDINGS_AUTH_HEADER_NAME` / `EMBEDDINGS_AUTH_SCHEME` (fall
   back to chat-side equivalents), `EMBEDDINGS_VERIFY_THRESHOLD` (0.5–0.99,
   default 0.82), and `EMBEDDINGS_TIMEOUT_MS` (default 2000 — a tight
   per-call budget passed through `FetchLlmClient` into `fetchWithTimeout`'s
   per-call `timeoutMs` so the request is genuinely ABORTED at the budget,
   deliberately NOT the generic 30s `UPSTREAM_TIMEOUT_MS`, because the reply
   blocks on verification). A configurable base URL keeps the
   on-prem/air-gap posture. We do NOT reuse `LLM_*` credentials implicitly —
   the chat provider may be Anthropic, which has no embeddings endpoint;
   silent fallback would mean silent breakage.
4. **Threading**: `GroundedAnswerDeps.quoteEmbedder?: Embedder` (injectable
   seam, mirrors `wordMapFetch`/`skillsRetrieve`); `verifiedCitations` passes
   it to `verifyQuote`. `app.ts` (composition root) builds the live embedder
   from env when configured and passes it to all three grounded callers
   (chat RAG, smart-report render, hybrid) — one wiring point, three routes.

## What does NOT change (decision record)

- Tier semantics: an embedding match earns `paraphrase` (chunk-level bbox),
  never `exact` — `assignTier` already enforces this; quote-grounded but not
  verbatim. `confidence` = the cosine score (already in `confidenceFor`).
- Gate order: embedding runs ONLY after both lexical gates miss — zero added
  latency/cost for the common verbatim/normalized case.
- Failure semantics: already spec'd — verification is best-effort; an
  embeddings failure drops the claim one tier (to `ambient`), never fails the
  turn.
- No re-rank of search results, no semantic search — this is verification only.

## UX of the async check (decision record, user-approved 2026-06-11)

Citations ship WITH the reply, and the app auto-highlights `citations[0]` the
moment the answer arrives — citations must therefore be FINAL at reply time.
So verification is **blocking** (the reply waits for verification — explicitly
approved by the user, not a default), with the cost bounded three ways: the
embedding gate runs only when both lexical gates miss (most turns pay zero);
it is one batched call per missed citation, parallel ACROSS citations via the
existing per-citation `Promise.all` (within one citation it runs before the
verified-only word-map fetch, so a citation's worst-case chain is embed budget
+ cached word-map fetch in series); and it has its own tight
`EMBEDDINGS_TIMEOUT_MS` budget (default 2s) that aborts the request — on
expiry the citation ships at `ambient` and the turn proceeds. The alternative — reply immediately,
upgrade the citation tier afterward — was rejected: the highlight would
visibly jump from soft region to chunk box after the user is reading, and it
requires a server-push patch channel that doesn't exist. Worst case today:
a turn with a lexically-missed citation and a dead embeddings provider adds
~2s and degrades that citation's tier; nothing else changes.

## Conformance to core architectural decisions

- **Composable, not forked (principle 1)**: a new value (`"embeddings"`) on the
  existing `FetchLlmClient` profile axis; a new optional dep on the existing
  `GroundedAnswerDeps` seam pattern; a new value (`"embedding"`) already exists
  on the `VerifyMethod` axis. No new component class, no generic service with
  one caller.
- **Done = user-visible + round-trip (principle 5)**: done when a chat turn
  whose emitted quote paraphrases the chunk by meaning renders a `paraphrase`-
  tier chunk highlight instead of today's `ambient` soft region, proven by
  tests through `groundedAnswerOverScope`; a provider failure/timeout on an
  identical turn yields `ambient` with the turn succeeding (every env var has
  a read site and a behavioral test).
- **One source of truth (principle 6)**: threshold lives in one place (env with
  one default const); the spec delta replaces the "no production wiring"
  sentence rather than adding a rival requirement; `CitationTier` stays the
  single shared tier vocabulary.
