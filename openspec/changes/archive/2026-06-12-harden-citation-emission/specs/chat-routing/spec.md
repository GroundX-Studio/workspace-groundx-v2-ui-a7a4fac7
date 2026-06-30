# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: The grounded prompt SHALL require citations for content claims via a single merged contract

The grounded system prompt's citations contract SHALL state that an answer
drawing ANY fact from the snippets or the EXTRACTED FIELDS block MUST end
with the citations block (one entry per claim), and that the block is
omitted ONLY for turns drawing on neither (greetings, small talk, product
questions). The contract SHALL present exactly ONE example ```json block;
when the EXTRACTED FIELDS block is present the example SHALL show the
snippet-form (`page` + `quote`) and extraction-form (`field` + `value`)
entries side by side in the same `citations` array. The contract SHALL
describe verification outcomes as confidence tiers, not as entries being
"dropped".

#### Scenario: Content claims are MUST-cite

- **GIVEN** the grounded system prompt is built with an extraction block
- **THEN** it contains a sentence requiring the citations block for answers stating facts from the snippets or extracted fields
- **AND** exactly one example ```json fence, containing both a `quote`-form and a `field`-form entry.

#### Scenario: Non-content skip license is scoped

- **GIVEN** the grounded system prompt
- **THEN** the only omission license names non-content turns (greetings/small-talk/product questions)
- **AND** no contract text says the model "may" skip citing a content claim.

### Requirement: The grounded answer parser SHALL recover the citations block across fence variations

`parseGroundedAnswer` SHALL scan ALL fenced code blocks — tolerating an
optional `json` language tag in any case, CRLF line endings, and one-line
fences — plus a trailing un-fenced `{"citations": …}` object, merging the
citation entries of every block that parses to an object carrying a
`citations` key (or, during the one-release A.5 shim window, the deprecated
`suggestedIntent` / `proposedSchemaField` keys), in emission order, with
identical entries deduplicated. ONLY such blocks SHALL be stripped from the
cleaned answer; any other fenced block (tagged or untagged) SHALL remain in
the user-visible body. A `page` given as a numeric string SHALL be coerced to a number.
Parse-level losses (fence present but unparseable / wrong shape / zero
valid entries) SHALL be counted on the parse result.

#### Scenario: One-line and CRLF fences parse

- **GIVEN** a completion ending in ` ```json {"citations":[…]} ``` ` on one line, or using `\r\n` line endings
- **WHEN** parsed
- **THEN** the citations are recovered.

#### Scenario: Duplicate entries across merged blocks collapse

- **GIVEN** a completion with two ```json blocks each carrying the same `(documentId, page, quote)` entry
- **WHEN** parsed
- **THEN** `structuredCitations` contains that entry exactly once.

#### Scenario: Untagged content fence stays in the body

- **GIVEN** a completion containing a bare ``` fence with non-metadata JSON the user asked for, plus a ```json citations block
- **WHEN** parsed
- **THEN** the citations are recovered and the content fence remains in `cleanedAnswer`.

### Requirement: The grounded LLM call SHALL bound output and surface length truncation

`callGroundedLlm` SHALL set an explicit output-token ceiling on the grounded
request, using the parameter the live provider accepts (`max_tokens` or
`max_completion_tokens`); a temperature pin MAY be set where the provider
supports it. When the provider reports `finish_reason: "length"` the
middleware SHALL log a warning and mark the response truncated; the turn
SHALL NOT fail.

#### Scenario: Length-cut completion is visible

- **GIVEN** a provider response with `finish_reason: "length"`
- **WHEN** the grounded call returns
- **THEN** a warning is logged and the response carries a truncation flag
- **AND** the turn completes with the available prose.

### Requirement: The EXTRACTED FIELDS prompt block SHALL always be valid JSON

`fetchDocumentExtraction` SHALL fit the extraction payload to the prompt
budget by dropping whole trailing array items (then trailing fields), never
by character slicing; the resulting block SHALL always parse as JSON and
SHALL carry a machine-readable `_truncated` marker when reduced. Truncation
SHALL log payload and prompt sizes. Citation validation SHALL continue to
use the FULL fetched payload regardless of prompt truncation.

#### Scenario: Oversized extraction stays valid JSON

- **GIVEN** an extraction payload exceeding the prompt budget
- **WHEN** the prompt block is built
- **THEN** the block parses as JSON and contains the `_truncated` marker
- **AND** a warning with `{payloadChars, promptChars}` is logged.

#### Scenario: Validation sees the full payload

- **GIVEN** an emitted extraction citation whose `field` was dropped from the truncated prompt block
- **WHEN** the citation validates against the payload
- **THEN** validation resolves the path against the full payload (the citation is not rejected for the truncation).

### Requirement: Each grounded turn SHALL emit a citation funnel

Every grounded turn SHALL produce a citation funnel —
`{emitted, validSnippetForm, validExtractionForm, shipped, dropReasons}` with
a reason count for every discard point (parse, docId, page, path, value,
branchNode, geometry) — logged prod-safe and attached to the dev-only
`_debug.citations` branch. A turn where the model omitted the block
(`emitted: 0`) SHALL be distinguishable from a turn where all emitted entries
were dropped (`emitted > 0, shipped: 0`).

#### Scenario: All-dropped is distinguishable from omitted

- **GIVEN** one turn whose completion has no citations block and another whose 6 emitted entries all fail value validation
- **WHEN** both funnels are inspected
- **THEN** the first reports `emitted: 0` and the second `emitted: 6, shipped: 0, dropReasons: {value: 6}`.

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
SHALL offer this form only on such turns (the extraction-form citation guidance SHALL live in the
prompts module and SHALL be rendered by the unified citations-contract builder iff the extraction
block is present — a no-extraction prompt carries no extraction-form guidance; the former
byte-identical-prompt and standalone-fragment clauses are superseded by the merged single-example
contract of the harden-citation-emission change). `field` is a path into the extraction JSON and `value`
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
MUST NOT fail the chat turn. After
the field resolver ships chunk geometry, the router SHALL attempt the word-level upgrade
(2026-06-11 — the formerly named evolution, now wired): the validated `value` is verbatim by
construction, so it SHALL be resolved through the document's `-118-map` word map via the atom
resolver, the same upgrade path the snippet-quote form uses. When a consecutive atom run resolves,
the citation SHALL ship that run's tight word-level `bbox` (+ its page), and its tier follows the
attribution tiering rule: `exact` when the cited `value` matched the payload exactly; a
normalized-only value match keeps `tier: "paraphrase"` (with the tighter box). A
word-map miss — unfetchable map, no verbatim atom run, or any resolver failure — SHALL keep the
chunk geometry at `tier: "paraphrase"` and MUST NOT drop the citation or fail the turn: the
drop-on-miss rule applies ONLY to the chunk-level field resolver; the word-level pass is a
best-effort upgrade on top of an already-shippable citation.

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

#### Scenario: A validated extraction citation upgrades to the word-level exact tier

- **GIVEN** a validated extraction-sourced citation whose `value` matched the payload exactly and
  whose chunk geometry resolved via the field resolver
- **AND** the document's `-118-map` word map carries a consecutive atom run spelling out the
  cited `value`
- **WHEN** the chat router assembles the reply
- **THEN** the citation has `tier: "exact"`
- **AND** its `bbox` is the atom-run union (tighter than the chunk envelope) with the word map's
  page.

#### Scenario: A word-map miss keeps the chunk-level paraphrase citation

- **GIVEN** a validated extraction-sourced citation whose chunk geometry resolved
- **AND** the `-118-map` is unfetchable, the fetch throws, or no atom run spells out the value
- **WHEN** the chat router assembles the reply
- **THEN** the citation ships with `tier: "paraphrase"` and the chunk-envelope `bbox`
- **AND** the citation is NOT dropped
- **AND** the chat turn still succeeds.

#### Scenario: Geometry miss drops the extraction citation without failing the turn

- **GIVEN** a validated extraction-sourced citation whose `value` matches no X-Ray chunk (or the
  X-Ray is unfetchable)
- **WHEN** the chat router assembles the reply
- **THEN** that entry is absent from `reply.citations`
- **AND** other citations on the reply are unaffected
- **AND** the chat turn still succeeds.
