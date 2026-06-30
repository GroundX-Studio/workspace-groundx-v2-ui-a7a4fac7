# Spec Delta — chat-routing

## MODIFIED Requirements

### Requirement: RAG citations SHALL be claim-level, quote-verified, and tiered by attribution confidence

The chat router SHALL produce claim-level citations whose precision is earned through
verification, rather than highlighting whole chunks unconditionally. The router SHALL prompt the
RAG model for quote-anchored structured output and SHALL treat the ABSENCE of an emitted
citations block as the model's signal that the answer did not draw on the documents: an uncited
answer SHALL carry **zero** citations (no-invented-citations, 2026-06-11 — the former
"all-snippets fallback" that fabricated ambient citations from search hits is RETIRED).
Each emitted `supportingQuote` SHALL be verified against its chunk — exact substring, then
normalized match (case/whitespace/punctuation/currency stripped), then embedding similarity via
`verifyQuote`'s async `embedder` seam. The embedding gate is ALWAYS-ON (no feature flag): the
provider env (`EMBEDDINGS_BASE_URL` + `EMBEDDINGS_MODEL_ID`, an OpenAI-compatible `/embeddings`
endpoint with a configurable base URL so on-prem/air-gapped deployments can self-host) SHALL be
required in production (boot fails fast when unset, the same posture as `LLM_MODEL_ID`), while
`EMBEDDINGS_API_KEY` SHALL be optional everywhere — keyless self-hosted providers are valid, and
the auth header is attached only when a key is set. In dev/test an unset provider SHALL log a
warning and degrade to lexical-only at runtime. Verification SHALL block the reply — citations
are final at reply time (the client auto-highlights on arrival; tiers are never upgraded after
delivery) — and the embedding call SHALL be bounded by its own tight per-call budget
(`EMBEDDINGS_TIMEOUT_MS`, default 2000 ms) that ABORTS the request, not the generic upstream
timeout. The never-fail invariant SHALL be enforced at the `verifyQuote` seam itself: a throwing
or rejecting embedder implementation yields an unverified result, never a failed turn. The
embedding gate SHALL run
only after both lexical gates miss, SHALL compare the quote against the chunk's sentences in one
batched provider call with per-text vectors cached under a TTL, and SHALL verify at or above the
configured threshold (`EMBEDDINGS_VERIFY_THRESHOLD`, default 0.82). The resulting citation
SHALL carry a `tier` of `exact`, `paraphrase`, or `ambient` plus a `confidence`. A verified quote
SHALL resolve at `paraphrase` with the chunk-level `bbox` (WF-03); an embedding-verified quote
SHALL NOT exceed `paraphrase` and SHALL carry its cosine score as `confidence`; when the
word-level atom resolver is present, a verbatim raw-`text` quote MAY upgrade to `exact` with a
word-level `bbox`.
An `ambient` citation is an EMITTED-but-unverified quote — the model cited, verification failed —
never an invented one. Verification + any geometry fetches MUST be best-effort and cached per
`documentId`; any failure — including any embeddings-provider error, timeout, or misconfiguration
— SHALL drop the claim one tier and MUST NOT fail the chat turn.

#### Scenario: Verbatim claim upgrades to a word-level exact tier when the atom resolver is wired

- **GIVEN** the `-118-map` atom resolver is available
- **AND** an answer claim whose `supportingQuote` is a verbatim substring of chunk[2]'s raw `text`
- **WHEN** the chat router assembles citations
- **THEN** the claim's citation has `tier: "exact"`
- **AND** its `bbox` is the union of the matched atoms' boxes (tighter than the chunk box).

#### Scenario: Paraphrased claim degrades to chunk-level

- **GIVEN** a claim whose `supportingQuote` matches chunk[2]'s `suggestedText` but no raw-text span
- **WHEN** the chat router assembles citations
- **THEN** the citation has `tier: "paraphrase"`
- **AND** its `bbox` is the chunk-level `boundingBoxes` envelope.

#### Scenario: Meaning-level paraphrase verifies via embeddings at the paraphrase tier

- **GIVEN** a claim whose `supportingQuote` matches no exact or normalized span but whose best
  sentence cosine clears the configured threshold
- **WHEN** the chat router assembles citations
- **THEN** the citation has `tier: "paraphrase"` with the chunk-level `bbox`
- **AND** its `confidence` equals the cosine score
- **AND** the embedding gate was not invoked for any claim a lexical gate already verified.

#### Scenario: Embeddings provider failure degrades to ambient without failing the turn

- **GIVEN** the embeddings provider errors, returns malformed data, exceeds `EMBEDDINGS_TIMEOUT_MS`, or the embedder implementation rejects
- **AND** a claim whose `supportingQuote` clears no lexical gate
- **WHEN** the chat router assembles citations
- **THEN** that citation has `tier: "ambient"`
- **AND** the reply is delayed by at most the embeddings timeout budget
- **AND** the chat turn still succeeds (no thrown error).

#### Scenario: Production boot requires the embeddings provider

- **GIVEN** `NODE_ENV=production` and either `EMBEDDINGS_BASE_URL` or `EMBEDDINGS_MODEL_ID` unset
- **WHEN** the middleware loads its env
- **THEN** boot fails fast with a validation error naming the missing variable.

#### Scenario: A keyless self-hosted embeddings provider is valid

- **GIVEN** `EMBEDDINGS_BASE_URL` + `EMBEDDINGS_MODEL_ID` set and `EMBEDDINGS_API_KEY` unset
- **WHEN** the middleware boots and the embedding gate fires
- **THEN** production boot succeeds
- **AND** the embeddings request is sent with no auth header.

#### Scenario: Emitted-but-unverified quote degrades to ambient

- **GIVEN** an answer whose emitted citation quote clears no verification threshold
- **WHEN** the chat router assembles citations
- **THEN** that citation has `tier: "ambient"`
- **AND** the chat turn still succeeds (no thrown error).

#### Scenario: An uncited answer carries zero citations

- **GIVEN** an answer with NO emitted citations block (small talk, a joke, a product question)
- **WHEN** the chat router assembles the reply
- **THEN** `reply.citations` is empty
- **AND** no "Show all sources" suggested action is seeded.
