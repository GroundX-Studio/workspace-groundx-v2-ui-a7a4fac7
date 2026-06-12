# Spec Delta — chat-routing

## MODIFIED Requirements

### Requirement: RAG citations SHALL be claim-level, quote-verified, and tiered by attribution confidence

The chat router SHALL produce claim-level citations whose precision is earned through
verification, rather than highlighting whole chunks unconditionally. The router SHALL prompt the
RAG model for structured citation output in TWO forms and SHALL treat the ABSENCE of an emitted
citations block as the model's signal that the answer did not draw on the documents: an uncited
answer SHALL carry **zero** citations (no-invented-citations, 2026-06-11 — the former
"all-snippets fallback" that fabricated ambient citations from search hits is RETIRED).

**Snippet-sourced form** (`documentId`, `page`, `quote`, `answerSpan`): each emitted
`supportingQuote` SHALL be verified against its chunk — exact substring, then
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
never an invented one.

**Extraction-sourced form** (`documentId`, `field`, `value`, `answerSpan` — no `page`, no
`quote`): permitted ONLY when the grounded prompt carries an EXTRACTED FIELDS block; the prompt
SHALL offer this form only on such turns (the extraction citations fragment SHALL live in the
prompts module and SHALL be appended iff the extraction block is present — a no-extraction prompt
is byte-identical to before this change). `field` is a path into the extraction JSON and `value`
is the value at that path copied verbatim from the block. The router SHALL validate every
extraction-sourced entry against the PARSED extraction payload it fetched — never against model
output: the `documentId` SHALL equal the extraction's document, the `field` path SHALL resolve in
the payload, and the cited `value` SHALL match the payload value at that path under the field
normalization rules (string coercion; case/whitespace/currency tolerance). An entry failing ANY
check SHALL be DROPPED entirely (not degraded to `ambient` — a failed check means the citation
has no real referent; `ambient` remains reserved for emitted-but-unverified quotes against real
snippets). A validated extraction citation SHALL carry the verified-level `confidence` and SHALL
resolve geometry per the citation-geometry requirement: a field-resolver hit ships `page` + chunk
`bbox` at `tier: "paraphrase"`; on a geometry miss (or an unfetchable X-Ray) the entry SHALL be
DROPPED — a citation ships only when it can point at a page (user decision 2026-06-11; no
pageless/document-level citation form, the shared `Citation` shape is unchanged) — and the drop
MUST NOT fail the chat turn. A
validated extraction citation MAY in a future evolution upgrade to `exact` via the word-level
atom resolver (named evolution, not wired).

Verification + any geometry fetches MUST be best-effort and cached per
`documentId`; any failure — including any embeddings-provider error, timeout, or
misconfiguration — SHALL drop the claim one tier (or drop an extraction entry whose
payload validation cannot run) and MUST NOT fail the chat turn.

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

#### Scenario: An extraction-grounded answer carries citations

- **GIVEN** a turn whose prompt carries the EXTRACTED FIELDS block listing
  `meters[0].meter_number = "49099992"`
- **AND** the model answers from the extraction only and emits
  `{"documentId": "<the extraction's doc>", "field": "meters[0].meter_number", "value": "49099992", "answerSpan": "meter 49099992"}`
- **WHEN** the chat router assembles the reply
- **THEN** `reply.citations` carries the validated citation
- **AND** the "Show all sources" suggested action is seeded.

#### Scenario: A fabricated extraction field path is dropped

- **GIVEN** an extraction-sourced entry whose `field` path does not resolve in the fetched
  extraction payload, or whose `value` does not match the payload value at that path
- **WHEN** the chat router assembles citations
- **THEN** that entry is dropped entirely (no `ambient` downgrade)
- **AND** the chat turn still succeeds.

#### Scenario: Extraction form is unavailable without an extraction block

- **GIVEN** a turn whose prompt carries NO EXTRACTED FIELDS block (no primary document, fetch
  failure, or a turn plan that skipped the extraction fetch)
- **WHEN** the grounded prompt is built and the reply is assembled
- **THEN** the prompt contains no extraction-citations contract copy
- **AND** any extraction-sourced entry the model emits anyway is dropped (no payload to validate
  against).

#### Scenario: Geometry miss drops the extraction citation without failing the turn

- **GIVEN** a validated extraction-sourced citation whose `value` matches no X-Ray chunk (or the
  X-Ray is unfetchable)
- **WHEN** the chat router assembles the reply
- **THEN** that entry is absent from `reply.citations`
- **AND** other citations on the reply are unaffected
- **AND** the chat turn still succeeds.

### Requirement: Chat citations SHALL carry page + normalized bbox resolved from X-Ray or the search result

The chat router SHALL populate each SNIPPET-SOURCED `reply.citations[*]` with the correct `page`
and a normalized
`bbox` (0-1 page-relative `{x,y,w,h}`). When the search result already carries geometry
(`boundingBoxes` + `pages`), the router SHALL read it directly: page from
`boundingBoxes[0].pageNumber` (falling back to `pages[0].number`), and bbox from the union of the
result's pixel `boundingBoxes` **on the cited page** (grouped by `pageNumber`, never unioned across
pages) normalized by that page's `width`/`height`. When the result carries no `boundingBoxes`, the
router SHALL resolve geometry from the document's X-Ray by matching the citation snippet against
`chunks[].text`, taking the page from the
matched chunk's `pageNumbers[0]` and normalizing the chunk's cited-page `boundingBoxes`; the X-Ray
SHALL be fetched at most once per document (cached). The router SHALL NOT read a top-level
`pageNumber` field — the deployed API does not return one, so doing so silently defaults every
citation to page 1. On no match the citation SHALL ship geometry-less. Resolution MUST be
best-effort: a resolver error MUST NOT fail the chat turn.

EXTRACTION-SOURCED citations (which carry no quote and no snippet geometry) SHALL resolve
geometry via the WF-05 field resolver instead: `resolveFieldGeometry(value, label, xray)` over
the same cached document X-Ray, with `label` = the field path's last segment — the same
mechanism the Extract widget's `/api/documents/:documentId/field-geometry` route uses. A
resolver hit SHALL set the citation's `page` + chunk-envelope `bbox`; on a miss the entry SHALL
be dropped (per the claim-level citations requirement — no pageless citation form). The X-Ray
cache SHALL be shared with the snippet path (still at most one fetch per document per turn).

#### Scenario: Geometry read directly off a result that carries it

- **GIVEN** a RAG reply whose search result carries `boundingBoxes`
  `(362,593)-(1601,2031)` with `pageNumber: 2` and a `pages` entry `{number:2, width:1700, height:2200}`
- **WHEN** the chat router assembles the reply
- **THEN** the citation carries `page: 2`
- **AND** `bbox` is approximately `{x:0.213, y:0.270, w:0.729, h:0.654}` (px ÷ page dims)
- **AND** no X-Ray fetch is needed for that citation.

#### Scenario: A result lacking geometry resolves via X-Ray, once per document

- **GIVEN** a reply with two citations from one document whose search results carry no `boundingBoxes`
- **WHEN** geometry is resolved for both
- **THEN** the document's X-Ray is fetched at most once (cached)
- **AND** each citation whose snippet matches an X-Ray chunk carries the chunk's normalized geometry.

#### Scenario: Unresolvable citation ships geometry-less without failing

- **GIVEN** a citation whose result has no `boundingBoxes` and matches no X-Ray chunk
- **WHEN** the chat router assembles the reply
- **THEN** the citation is returned with no `bbox`
- **AND** the chat turn still succeeds (no thrown error).

#### Scenario: An extraction citation resolves page and bbox via the field resolver

- **GIVEN** a validated extraction-sourced citation whose `value` appears in an X-Ray chunk with
  bounding boxes on page 2
- **WHEN** the chat router assembles the reply
- **THEN** the citation carries `page: 2` and the chunk-envelope normalized `bbox`
- **AND** `tier` is `"paraphrase"`
- **AND** the same turn's snippet citations for that document reuse the one cached X-Ray fetch.
