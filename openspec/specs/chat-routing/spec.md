# chat-routing Specification

## Purpose

Define the durable contract for how the middleware classifies inbound
chat turns (rag / structured / hybrid) and threads them to the right
handler — including bucket-group resolution for multi-bucket searches,
content-scope derivation from the active entity, and the structured-
output envelope contract (citations, suggestedIntent, proposedSchemaField).
## Requirements
### Requirement: Multi-bucket pivots SHALL resolve via a cached ensureBucketGroup helper

The middleware SHALL expose `ensureBucketGroup(bucketIds[]) → groupId`
that, on first call for a given sorted bucket-id list, creates a
GroundX Group via Partner API `POST /v1/groups` with a deterministic
name AND caches the resulting groupId for subsequent calls. The chat
path SHALL route multi-bucket scopes via the returned `{kind: "group",
groupId}`. This requirement is held pending an upstream caller that
actually emits multi-bucket scopes (UI-05 SteadyShell or a multi-
bucket project view); no user-visible test exists until then.

#### Scenario: First multi-bucket pivot creates and caches a Group

- **GIVEN** an entity carrying `bucketIds: [B1, B2]`
- **WHEN** the chat path receives a turn scoped to it for the first time
- **THEN** `ensureBucketGroup([B1, B2])` issues `POST /v1/groups`
- **AND** the returned `groupId` is cached against the sorted-id key
- **AND** a second turn with the same `[B1, B2]` retrieves the cached id without a second POST
- **AND** `chatHandler` routes the search via `{kind: "group", groupId}`

### Requirement: Compression SHALL run off the request hot path

The chat handler SHALL NOT block the user's POST on the compression
pass. Compression MUST run via either a job queue + background worker
returning 202/poll OR via a "pending" flag on the session with eventual
in-band resolution. Either pattern is acceptable; both keep P95 latency
of the chat POST flat regardless of compression workload.

#### Scenario: User POST near compression threshold returns promptly

- **GIVEN** a chat session at 95% of the compression threshold
- **WHEN** the user POSTs a new message
- **THEN** the POST returns 200 (or 202) promptly (P95 < 800ms)
- **AND** the compression pass completes asynchronously
- **AND** the next POST sees the new active summary

### Requirement: Chat SHALL support streaming responses

The chat surface SHALL render the assistant's reply token-by-token via
SSE or fetch-stream rather than waiting for the full response. The
streaming path MUST preserve all existing reply envelope fields
(citations, suggestedActions, proposedSchemaField) once streaming
completes.

#### Scenario: Long answer streams token-by-token

- **GIVEN** a chat turn that would return a long answer (>500 tokens)
- **WHEN** the user sends the turn
- **THEN** the answer SHALL render in the chat scroll token-by-token within ~30ms of each token arriving
- **AND** the full envelope (citations, suggestedActions, proposedSchemaField) lands on completion

### Requirement: DB pool SHALL be sized for batch reads under chat load

The MySQL pool size SHALL be ≥10 connections AND the chat handler SHALL
batch its 5–8 sequential per-post reads into a single round-trip where
the repository layer permits it. Load tests SHALL assert P99 < 1s with
50 concurrent posts under mocked LLM + GroundX backends.

#### Scenario: 50 concurrent chat POSTs stay under P99 1s

- **GIVEN** a load test driving 50 concurrent `/api/chat/messages` POSTs against a mocked LLM + GroundX
- **WHEN** the test runs to completion
- **THEN** P99 latency stays below 1000ms
- **AND** no pool-exhaustion errors are logged

### Requirement: Citations SHALL survive the chat reply transport intact

The `citations: Citation[]` array returned by `routeChat` SHALL pass
through the `/api/chat/messages` route, the `sendChatMessage` client
wrapper, and the `ChatReply.citations` consumer surface without
re-shaping or filtering. Each `Citation` SHALL carry at minimum
`documentId: string` + `page: number`, with `snippet: string | null`
and `bbox?: {x,y,w,h}` as optional enrichment. The chat router already
emits this payload on every RAG and hybrid reply; this requirement
formalizes the transport contract end-to-end.

#### Scenario: Citation round-trip end-to-end (Rule 9 closure)

- **GIVEN** the chat router returns a reply with `citations: [{documentId: "X", page: 7, snippet: "...", bbox: {...}}]`
- **WHEN** the client receives the `sendChatMessage` result
- **THEN** `result.reply.citations[0]` carries the same documentId, page, snippet, and bbox values byte-for-byte
- **AND** the `chat_messages.citations_json` row holds the same JSON shape

### Requirement: Chat replies SHALL carry intents and toolFailures when the LLM uses function-calling

The `ChatReply` envelope SHALL be extended with two new arrays:

- `intents: CanvasIntent[]` — auto-dispatched read-category tool results
- `toolFailures: { name: string; reason: string }[]` — validation or handler failures

Existing `suggestedActions[]` SHALL carry mutate-category tool proposals as chips (the user clicks to dispatch). Existing `proposedSchemaField` + `suggestedIntent` continue to ship in their current envelope shapes during the migration phase (Phase 8); after migration, they become derived from `intents[]` / `suggestedActions[]`.

#### Scenario: Read-tool chat reply carries an intent + no chip

- **GIVEN** the LLM emits a tool call for the `read`-category tool `open_document`
- **WHEN** the chat router returns the reply
- **THEN** `reply.intents[0]` is the resulting `CanvasIntent`
- **AND** `reply.suggestedActions` does NOT contain a chip for that tool

#### Scenario: Mutate-tool chat reply carries a chip + no auto-intent

- **GIVEN** the LLM emits a tool call for the `mutate`-category tool `save_schema_template`
- **WHEN** the chat router returns the reply
- **THEN** `reply.suggestedActions[]` contains an entry with the tool name and the would-be intent payload
- **AND** `reply.intents[]` does NOT contain that intent yet

#### Scenario: Failure surfaces in toolFailures, not as an intent

- **GIVEN** the LLM emits a tool call with arguments that fail Zod validation
- **WHEN** the chat router processes the response
- **THEN** `reply.toolFailures[]` contains a `{ name, reason }` entry
- **AND** `reply.intents[]` does NOT include that call's intent
- **AND** the answer text still flows (the LLM's natural-language response is not blocked by a tool failure)

### Requirement: The chat router SHALL pass a step-scoped tool catalog to the LLM provider

Per chat turn, the chat router SHALL:

1. Read the active `ViewerStep.kind` from the chat session's viewer slot
2. Build the LLM-facing tool catalog from middleware `SERVER_TOOL_CATALOG`,
   filtered by active step and caller role/mode
3. Pass the catalog to the LLM provider via the native `tools` parameter
   (OpenAI / Anthropic equivalent)
4. Set `tool_choice` to `"auto"` (let the model decide whether to use a tool)

The catalog SHALL NOT be duplicated into the system prompt narrative — the
provider's structured `tools` field is the canonical surface. The chat router
SHALL NOT call into an app-side `toolRegistry` or app-side tool `handler`.

#### Scenario: Tool catalog reflects the current viewer step

- **GIVEN** a chat session whose active ViewerStep is `extract-workbench` in
  onboarding mode
- **WHEN** the chat router builds the LLM request
- **THEN** the request's `tools` array contains the server tools admitted for
  `extract-workbench`
- **AND** the array excludes tools scoped to other steps
- **AND** the array excludes tools unavailable to the caller role/mode.

### Requirement: The fenced-JSON proposal paths SHALL be retired

After this change lands, the chat router SHALL emit
`proposedSchemaField` and `suggestedIntent` via native LLM
function-calling tools only. The fenced-JSON parser SHALL retain
only its `citations` branch — `citations` are metadata on the
answer, not a tool surface.

The chat router previously emitted `proposedSchemaField` and
`suggestedIntent` by parsing a fenced ```json block from the
grounded LLM's answer. After this change, both surfaces SHALL be
emitted via native function-calling instead. The fenced-JSON parser
SHALL retain only its `citations` branch.

`ChatReply.proposedSchemaField` SHALL become a derived back-compat
shim for one release window — its value is the first matching
`tool:propose_schema_field` entry on `reply.suggestedActions[]`.
After the shim window closes, the field SHALL be removed from the
`ChatReply` type.

`ChatReply.suggestedActions[]` SHALL include `tool:suggest_intent`
chips when the LLM emits a `suggest_intent` tool call. The
pre-existing `key === "suggested-intent"` chip key SHALL be
preserved for one release as a back-compat shim, then removed.

#### Scenario: Grounded LLM emits a `propose_schema_field` tool call

- **GIVEN** the user asks "add a field for total tax"
- **WHEN** the grounded LLM emits a `propose_schema_field`
  function-call with `{ name, type, description, categoryId }`
- **THEN** the middleware validates the args against the Zod
  schema, builds a `proposeSchemaField` intent, and routes it to
  `reply.suggestedActions[]` (key `tool:propose_schema_field`) per
  the mutate-category routing rule (`design.md` §C).
- **AND** the legacy `ChatReply.proposedSchemaField` field returns
  the same payload during the one-release shim window.
- **AND** the system prompt sent to the LLM no longer describes a
  fenced `proposedSchemaField` JSON envelope.

#### Scenario: Grounded LLM emits a `suggest_intent` tool call

- **GIVEN** the LLM reasons that the user should pivot to the
  extract view
- **WHEN** the LLM emits `suggest_intent({intent: "show-extract", reason: "compare line items", confidence: 0.92})`
- **THEN** the chip lands on `reply.suggestedActions[]` with key
  `tool:suggest_intent` and `detail.intent: "show-extract"`.
- **AND** clicking the chip dispatches a `switchFrame` intent to
  `f3` via the app-side `suggestedActionToIntent` mapper.

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

### Requirement: Chat citations SHALL resolve a word-level bbox from the document `-118-map` when a verbatim quote is verified

The chat router SHALL, for any citation whose supporting verbatim quote has already verified against
its cited chunk, attempt to tighten the citation's geometry to a word-level box by fetching the
document's `-118-map.json` word-map and calling the shipped `resolveWordGeometry(quote, map)`
resolver. When the resolver returns a box, the router SHALL replace the citation's `bbox` with that
tighter word-level box and SHALL assign the citation's tier via `assignTier(v, { hasAtomBox: true })`
so the `exact` tier lights. The word-map SHALL be fetched at most once per document (cached), and
the lookup SHALL fire ONLY for already-verified citations — an unverified citation pays no word-map
fetch. Resolution MUST be best-effort: a missing or unfetchable word-map, malformed JSON, or a quote
that is not present verbatim in the map MUST leave the citation at its X-Ray `paraphrase` chunk box
(or geometry-less), and MUST NOT fail the chat turn. The router SHALL NOT re-implement the
resolver — it consumes the shipped pure `resolveWordGeometry`.

#### Scenario: A verified verbatim quote resolves to the tighter word-level box and lights `exact`

- **GIVEN** a RAG reply with a structured citation whose `quote` verifies against its cited chunk
- **AND** the cited document has a fetchable `-118-map.json` in which the quote's tokens appear as a
  consecutive atom run
- **WHEN** the chat router assembles the reply
- **THEN** the citation's `bbox` is the word-level union box from the matched atoms (strictly tighter
  than the X-Ray chunk box for the same chunk)
- **AND** the citation's `tier` is `exact`.

#### Scenario: Word-map fetched at most once per document

- **GIVEN** a reply with two verified citations from the same document
- **WHEN** word-level geometry is resolved for both
- **THEN** the document's `-118-map.json` is fetched at most once (cached).

#### Scenario: Unverified citations pay no word-map fetch

- **GIVEN** a reply whose only citation is unverified (the verbatim quote did not verify)
- **WHEN** the chat router assembles the reply
- **THEN** no `-118-map.json` fetch is performed for that document
- **AND** the citation resolves at the `ambient` tier as before.

#### Scenario: Fallback chain degrades cleanly to the chunk box

- **GIVEN** a verified citation whose document has no fetchable word-map, OR whose quote is not
  present verbatim in the word-map
- **WHEN** the chat router assembles the reply
- **THEN** the citation keeps its X-Ray chunk-level `bbox`
- **AND** the citation's `tier` is `paraphrase`
- **AND** the chat turn still succeeds (no thrown error).

### Requirement: Per-entity RAG scope SHALL be persisted by a producer and read back, never read-only

An entity's RAG `ContentScope` (its target `documentIds` / `bucketId` / `groupId` / `projectIds`) SHALL
be persisted to `chat_session_entities` by a producer when the target content is known, and read back by
`deriveRagContentScope` to build the per-turn search scope. A scope column that is read SHALL have a
non-test writer; any column that cannot be produced SHALL be removed (column + read site), not left
read-only. When no per-entity scope is resolvable, the fallback SHALL be explicit, not the silent
side effect of perpetually-NULL columns.

#### Scenario: A scoped entity searches its own content, not the fallback bucket

- **GIVEN** an entity whose target is a known document set (or bucket / group / project filter)
- **WHEN** the entity is persisted and a chat turn runs
- **THEN** `deriveRagContentScope` resolves the `ContentScope` to that target
- **AND** the RAG search targets it (NOT the env-samples bucket fallback).

#### Scenario: No read-only scope columns survive

- **GIVEN** the `chat_session_entities` scope columns (`documentIdsJson`, `groupId`, `bucketId`, `projectIdsJson`)
- **WHEN** the round-trip is wired
- **THEN** each column read by `deriveRagContentScope` has at least one non-test writer
- **AND** any column with no producer is dropped (column + read site), per the no-dead-column rule.

### Requirement: A producer SHALL write a known customer entity's RAG scope onto its persisted row

The middleware SHALL persist a customer entity's known target content as `ContentScope` refs
(`bucketId` / `documentIds` / `groupId` / `projectIds`) onto its `chat_session_entities` row when that
target is known (steady-mode active workspace or a completed BYO upload), so that `deriveRagContentScope`
reads a real customer scope instead of the env-samples-bucket fallback. The producer SHALL write the same
shared `@groundx/shared` `ContentScope` refs the reader consumes, with no parallel scope shape.

#### Scenario: A steady-mode customer entity persists and resolves its own bucket

- **GIVEN** a steady-mode entity whose target is a known customer bucket (optionally a project filter)
- **WHEN** the producer runs at the entity-write / upload-complete seam
- **THEN** the entity's `chat_session_entities` row carries the produced scope refs
- **AND** on reload `deriveRagContentScope` resolves the `ContentScope` to that bucket (NOT the env-samples fallback).

#### Scenario: A completed BYO upload persists its document scope

- **GIVEN** a BYO entity whose target is the document(s) just uploaded and ingested
- **WHEN** the producer runs at upload-complete
- **THEN** the entity's row carries the produced `documentIds` (or bucket) refs
- **AND** on reload `deriveRagContentScope` targets those documents.

#### Scenario: Anon onboarding still falls through to the samples bucket

- **GIVEN** a fresh anon onboarding entity with no known customer target
- **WHEN** a chat turn runs
- **THEN** the producer writes no scope refs
- **AND** `deriveRagContentScope` resolves to the env-samples-bucket fallback (the documented onboarding behavior, unchanged).

### Requirement: Every read scope column SHALL have a producer or be dropped

Every `chat_session_entities` scope column read by `deriveRagContentScope` SHALL have at least one
non-test writer after the producer lands, and any column that still has no producer SHALL be dropped —
the column, its read site, and its `ChatSessionEntityRecord` field removed together — so no scope column
is left read-only.

#### Scenario: A column the producer fills is kept and round-trips

- **GIVEN** a scope column the producer now writes
- **WHEN** the no-dead-column drift guard runs
- **THEN** the column has a non-test writer and is retained
- **AND** a write → reload → `deriveRagContentScope` round-trip resolves the correct scope.

#### Scenario: A producerless column is dropped, not left read-only

- **GIVEN** a scope column that still has no producer after this change
- **WHEN** the §9 no-dead-column move runs
- **THEN** the column, its `deriveRagContentScope` read site, and its `ChatSessionEntityRecord` field are removed together
- **AND** the drift guard confirms no read-only scope column survives.

### Requirement: Citation geometry SHALL resolve to word-level atom boxes when available

The citation geometry pipeline SHALL resolve a cited verbatim span to a **word-level `bbox`** using
the document's `-118-map.json` word atoms, falling back to the X-Ray chunk box and then to none. The
resolved tight box SHALL populate `Citation.bbox`, so the WF-06b `exact` tier lights a word-level
highlight. Resolution SHALL be verbatim-only (no paraphrase inference).

#### Scenario: A verbatim citation gets a tight box

- **GIVEN** an answer citing a verbatim span present in the document
- **WHEN** citation geometry resolves
- **THEN** `Citation.bbox` is the word-level union from `-118-map` (tighter than the chunk box)
- **AND** when the word map is unavailable it falls back to the X-Ray chunk box, then to no box.

### Requirement: Chat wire types SHALL be single-sourced from @groundx/shared with a compile-time drift guard

The `/api/chat/*` request/response contract SHALL be declared exactly once,
as `@groundx/shared` Zod schemas (`z.infer`), and BOTH the app
(`api/chatSessions.ts` `ChatReply` / `ChatReplyDebug` / `ChatDispatchedIntent`
/ `ChatToolFailure` / `CreateChatSessionResult` / `scopeHint`) and the
middleware (`services/chatRouterTypes.ts` `ChatRouterResponse` /
`ChatRouterDebug` / `DispatchedIntent` / `ToolFailure`) SHALL consume that one
source via re-export, keeping their local names as aliases. Each folded twin
SHALL carry a compile-time `Eq<Local, Shared>` drift guard that is
load-bearing under `npm run build` (the build fails if either side re-forks
the shape), AND a runtime Zod `validate` at each parse boundary
(`/api/chat/messages` reply, `POST /api/chat-sessions` result). The reply
envelope SHALL NOT carry a `tools` array — executed/proposed tool calls
travel exclusively on `intents[]` / `suggestedActions[]` / `toolFailures[]`
(2026-06-11; the former always-empty `ChatReply.tools` field is retired).

#### Scenario: A re-forked wire shape fails the build

- **GIVEN** the chat reply envelope is single-sourced on `@groundx/shared` with an `Eq<ChatReply, SharedChatReply>` guard
- **WHEN** a developer edits the app `ChatReply` (or middleware `ChatRouterResponse`) so it diverges from the shared schema
- **THEN** `Eq<…>` evaluates `false`, the `Assert<false>` fails, and `npm run build` (tsc) errors
- **AND** reverting the divergence restores a green build.

#### Scenario: The chat reply validates at the transport boundary

- **GIVEN** the `/api/chat/messages` route returns a chat reply
- **WHEN** the reply crosses the parse boundary
- **THEN** it is validated against the shared `chatReplySchema`
- **AND** a well-formed reply (citations, suggestedActions, intents, toolFailures, proposedSchemaField, optional `_debug`) parses successfully
- **AND** a reply carrying no `tools` key parses successfully (the field is retired from the envelope).

### Requirement: The chat debug scope SHALL be the shared ContentScope, not a re-declared literal

The dev-only `_debug.scope` field SHALL be typed as the shared
`@groundx/shared` `ContentScope` on BOTH `ChatReplyDebug.scope` (app) and
`ChatRouterDebug.scope` (middleware), eliminating the duplicated
`{type, bucketId?, groupId?, documentIds?, filter?}` literal on each side. The
shared `chatReplyDebugSchema` SHALL embed `contentScopeSchema` for its `scope`
field, and both sides SHALL consume it via re-export under an `Eq<>` guard.

#### Scenario: Both debug-scope twins derive from one ContentScope

- **GIVEN** the app `ChatReplyDebug` and middleware `ChatRouterDebug` are both re-exports of the shared `chatReplyDebugSchema`
- **WHEN** the chat router writes `_debug.scope` and the dev-console logger reads `reply._debug.scope`
- **THEN** both sides type-check against the shared `ContentScope` discriminated union
- **AND** no `{type,bucketId,groupId,documentIds,filter}` literal is re-declared on either side
- **AND** an `Eq<ChatReplyDebug, SharedChatReplyDebug>` guard pins the twin under the build.

### Requirement: A single shared Source union SHALL back every event-source enum

The four-value source enum `["user", "agent", "tour", "system"]` SHALL be
single-sourced as one `@groundx/shared` `sourceSchema` (`z.enum`) with type
`Source`, replacing the 7× duplication (middleware `viewerEventSourceSchema`,
`intentLogSourceSchema`, two `app.ts` allow-sets; app `ChatStoreContext` event
source, `intentLog`, `viewerEvents`). The canvas-orchestrator `IntentSource`
(`"user" | "agent" | "tour"`) SHALL be derived as `Exclude<Source, "system">`
from the same union rather than re-declared. Each consuming side SHALL carry
an `Eq<>` guard so the source vocabulary cannot drift between halves.

#### Scenario: IntentSource derives from the shared Source union

- **GIVEN** the shared `sourceSchema` is `z.enum(["user","agent","tour","system"])`
- **WHEN** `IntentSource` is defined
- **THEN** `IntentSource = Exclude<Source, "system">` resolves to `"user" | "agent" | "tour"`
- **AND** an `Eq<IntentSource, Exclude<Source,"system">>` guard holds at build time
- **AND** the middleware fallback consts and `app.ts` allow-sets derive their member set from `sourceSchema.options`.

### Requirement: SchemaFieldExtractionResult SHALL be single-sourced from @groundx/shared

The `SchemaFieldExtractionResult` shape SHALL be defined once as a
`@groundx/shared` schema and consumed via re-export, with an `Eq<>` guard and
a runtime validate so any future middleware producer of the same shape shares
the one source. It is today declared only on the app in
`ChatStoreContext/types.ts` and consumed by `ChatStoreContext.tsx` +
`SchemaView.tsx`.

#### Scenario: The schema-field extraction result parses against the shared schema

- **GIVEN** the app `SchemaFieldExtractionResult` is a re-export of the shared `schemaFieldExtractionResultSchema`
- **WHEN** a field extraction result is set on the ChatStore
- **THEN** it validates against the shared schema
- **AND** an `Eq<SchemaFieldExtractionResult, SharedSchemaFieldExtractionResult>` guard pins the shape under the build.

### Requirement: The X-Ray response-shape and PageDim twins SHALL be deferred to wf05b

This change SHALL NOT fold the X-Ray response-shape twin nor the WF-03
`PageDim` shape; both are deferred to `2026-05-29-wf05b-word-level-geometry`.
The X-Ray twin (`documentPages[].number` vs `.page` vs `pageNumber`) and the
WF-03 `PageDim` (`{number, width, height}`) shape are declared in middleware
`services/citationGeometry.ts` and app `api/entities/groundxDocumentsEntity.ts`.
They are
shared ownership with `2026-05-29-wf05b-word-level-geometry`, whose `proposal.md`
and `tasks.md` both claim coordination of the X-Ray field-name drift. This
change SHALL leave the `citationGeometry.ts` page/X-Ray shapes untouched to
avoid a double-fix and a merge collision on that file.

#### Scenario: This change does not touch the citationGeometry page/X-Ray shapes

- **GIVEN** the X-Ray + `PageDim` twins are co-owned with wf05b
- **WHEN** this change's folds land
- **THEN** `services/citationGeometry.ts`'s `PageDim` and X-Ray `documentPages` shapes are unchanged
- **AND** the deferral is recorded as a cross-plan dependency, not an in-scope fold.

### Requirement: The composed RAG search filter SHALL be key-valid (one constraint per key)

The RAG search SHALL compose the server-side RBAC filter (the caller's authorized
project set, `{projectId:{$in:[…]}}`) with the request's scope filter
(`compileScopeFilter`) such that the resulting GroundX `filter` constrains each
field key AT MOST ONCE. For any key both sources constrain, the composition SHALL
INTERSECT their allowed value sets into a single clause — never emit two clauses
on the same key (GroundX rejects more than one data type per key with a 400). A
single resulting value SHALL be `{key: v}`, multiple SHALL be `{key:{$in:[…]}}`,
and a disjoint intersection SHALL be deny-all (`{key:{$in:[]}}`). Distinct keys
MAY still be combined with `$and`.

#### Scenario: RBAC + scope on the same project key intersect into one clause

- **GIVEN** an RBAC filter `{projectId:{$in:["p1","p2"]}}` and a scope filter `{projectId:"p1"}`
- **WHEN** the RAG search composes them
- **THEN** the GroundX `filter` constrains `projectId` exactly once (the intersection `{projectId:"p1"}`)
- **AND** GroundX accepts the filter (no "cannot query more than 1 data type per key" 400)
- **AND** the Interact chat returns a grounded, cited answer instead of a 502

#### Scenario: Disjoint RBAC vs scope denies all

- **GIVEN** an RBAC filter `{projectId:{$in:["p1"]}}` and a scope filter `{projectId:"p2"}` (no overlap)
- **WHEN** the RAG search composes them
- **THEN** the composed filter is deny-all (`{projectId:{$in:[]}}`), returning no results — never an invalid two-data-type filter

### Requirement: GroundX product knowledge SHALL come from the vendored skill pack via per-turn retrieval

The chat agent's GroundX product knowledge SHALL be the vendored markdown of the public
`groundx-agent-harness` skill pack (`middleware/assets/groundx-skills/`, synced at a PINNED commit
by `scripts/sync-groundx-skills.mjs`; non-knowledge files such as ROUTING.md and CHANGELOG.md are
excluded) — never a hard-coded product blurb and never a runtime GitHub fetch (on-prem/air-gap).
Retrieval SHALL be section-level (markdown heading chunks), capped (~4.5KB / top 3 sections), and
injected into the grounded system prompt as the `GROUNDX KNOWLEDGE` block only when the turn
plan calls for product knowledge.
When the turn plan affirms `productKnowledge`, retrieval runs with the retriever's
minDistinct/score ENTRY BAR bypassed (section ranking and caps still apply; nothing injects only
when the pack is missing or no section scores at all); the retriever's internal scoring gate
operates intact ONLY on the planner's deterministic-fallback path. GroundX product facts SHALL
have the vendored corpus as their single source of truth — no parallel hard-coded product
capsule. The production image SHALL ship `middleware/assets` alongside the built middleware.
**Recorded constraint:** the knowledge ships via prompt injection — NOT a lookup tool — because
the chat pipeline is one-shot (tool calls become intents/chips; there is no tool-result loop for
the model to continue from). A `lookup_groundx_docs` read tool is the named evolution if/when an
agentic tool-result loop exists.
*(Renamed from the `groundx-knowledge-prompt` change's "…via keyword routing…" requirement: the
mechanism changes from keyword-trigger gating to turn-plan gating; the vendored-corpus /
never-runtime-fetch invariants carry forward unchanged.)*

#### Scenario: Product question answered from the skill pack

- **GIVEN** the vendored pack is present
- **WHEN** the user asks "what do you know about groundx?"
- **THEN** the system prompt carries retrieved skill sections and the reply answers from them
- **AND** the reply carries zero citations (no documents were drawn on).

#### Scenario: Missing pack degrades to snippets-only

- **GIVEN** a checkout where the pack was never synced
- **WHEN** a chat turn runs
- **THEN** retrieval returns nothing and the turn succeeds without a knowledge block.

### Requirement: The grounded prompt SHALL include the primary document's full extraction output

The grounded call SHALL, when the turn plan calls for extraction context (`extractionContext`
not `false`; the fixed report and hybrid plans always do), fetch the primary document's full
workflow-extraction output (the same `/ingest/document/extract/{id}` payload the Extract
workbench renders) and include it in the prompt as an EXTRACTED FIELDS block, capped (~6KB,
truncation-marked). The primary document SHALL be the scope's explicit document, else the top
search snippet's. When the plan says `extractionContext: false`, the fetch SHALL NOT run at all
(no HTTP request) and the prompt is snippets-only on that axis. The fetch SHALL remain
best-effort: any failure or absence degrades to a snippets-only prompt and MUST NOT fail the
turn; the planner's deterministic fallback preserves the fetch-when-primary-doc-exists behavior.
Rationale: search retrieves only the top-K chunks, so structured questions (counts, identifiers)
miss when the matching chunk is not retrieved — but turns that need no document values should
not pay the fetch or the prompt bytes.

#### Scenario: Structured question answered from the extraction block

- **GIVEN** a document whose extraction lists two meters
- **AND** a plan affirming `extractionContext`
- **WHEN** the user asks "how many meters are there?"
- **THEN** the LLM request carries the full extraction values
- **AND** the reply states the count from them.

#### Scenario: Extraction fetch failure degrades gracefully

- **GIVEN** the extraction endpoint errors
- **WHEN** a turn whose plan affirms `extractionContext` runs
- **THEN** the prompt is snippets-only and the turn succeeds.

#### Scenario: Plan-skipped extraction makes no request

- **GIVEN** a plan with `extractionContext: false` and a primary document in scope
- **WHEN** the turn runs
- **THEN** no extraction request is made and the turn succeeds.

### Requirement: A light-LLM turn router SHALL plan each turn's retrieval with a deterministic fallback

The chat pipeline SHALL classify each user turn BEFORE retrieval using the light LLM (CF-16
`lightLlmClient`); the planner SHALL run ONLY when a light client is configured — it SHALL NOT
borrow the main chat client. The LLM SHALL emit an extensible decision record —
`{ documentSearch: boolean, productKnowledge: boolean, extractionContext: boolean,
appState: boolean }` (Zod-validated; `extractionContext` and `appState` schema-optional with an
omitted flag normalizing to its fallback value; unknown future flags tolerated). The CONSUMED
plan values are: `productKnowledge: boolean | "retriever-decides"` and
`appState: boolean | "classifier-decides"` — both sentinels internal-only (never emitted by the
model); `documentSearch` and `extractionContext` are plain booleans.

The plan SHALL gate the GroundX search, the skill-pack retrieval, AND the extraction-context
fetch, and SHALL drive mode routing: `routeChat` SHALL derive the chat mode from the plan —
`appState` true with `documentSearch` false → structured; `appState` true with `documentSearch`
true → hybrid; `appState` false → rag; the `"classifier-decides"` sentinel → the deterministic
keyword classifier (`classifyChatMode`), byte-for-byte the pre-flag routing. An explicit
UI intent hint SHALL decide the mode deterministically WITHOUT a planner call (intent hints are
authoritative; the planner never re-derives them). The keyword classifier SHALL NOT run when the
planner has answered (no parallel live classifiers) — it survives solely as the intent-hint fast
path plus the deterministic fallback. The planner SHALL run AT MOST ONCE per turn: a rag-routed
planned turn threads the router-computed plan into the grounded seam (`options.turnPlan`); the
seam SHALL NOT plan again. The seam-consumed plan SHALL NOT carry `appState` (the router strips
it before threading; fixed seam plan literals cannot include it; when the seam plans for
itself on an intent-hinted turn it likewise consumes only the seam-plan fields, never
`appState`) and the router-consumed plan type SHALL require it — no optional flags on either
consumed type. When a planner-routed turn
resolves to structured or hybrid but the session dependencies (`repository`/`chatSessionId`)
are absent, the turn SHALL degrade to the rag pipeline running the deterministic seam fallback
plan (search on) — NOT the planner's routed plan, whose `documentSearch: false` would ground
the answer in nothing — rather than throw; keyword/intent-routed turns keep the existing
throwing behavior. On planner-routed structured and hybrid turns the planner's
`productKnowledge` and `extractionContext` outputs are discarded — the fixed plans are
normative for those paths.

On a missing light client, timeout, or invalid output the router SHALL fall back
DETERMINISTICALLY to `{ documentSearch: true, productKnowledge: "retriever-decides",
extractionContext: true, appState: "classifier-decides" }` — every gate behaves byte-for-byte as
before the flags existed (search runs, the skill retriever's internal scoring gate decides,
extraction fetches when a primary document exists, the keyword classifier routes) — and the turn
MUST succeed. The seam's report caller (smart-report section generation) SHALL pass the fixed
plan `{ documentSearch: true, productKnowledge: false, extractionContext: true }` — report
sections never inject product knowledge and always carry extraction context; `appState` is a
routing-only flag and is NOT part of fixed seam plans. Adding a RETRIEVAL-PLANNING scenario
SHALL be a new flag on the record consumed at its gate — never a parallel retrieval classifier;
the keyword `classifyChat` mode router's former exemption is closed by the `appState` flag: it
remains ONLY as the intent-hint fast path and the deterministic fallback. The classifier prompt
SHALL live in the prompts module and SHALL state each flag's unsure-bias (`extractionContext`
true when unsure; `appState` false when unsure — mis-routing toward rag is the conservative
direction).

#### Scenario: Product question skips the document search

- **GIVEN** the planner returns `{ documentSearch: false, productKnowledge: true }`
- **AND** a question whose terms score at least one pack section but fail the minDistinct/score
  entry bar
- **WHEN** the turn runs
- **THEN** no GroundX search request is made, skill retrieval runs with its entry bar bypassed,
  the top-scoring skill block is injected, and the reply carries zero citations.

#### Scenario: Document question skips the skill pack

- **GIVEN** the planner returns `{ documentSearch: true, productKnowledge: false }`
- **WHEN** the user asks "what is the meter number?"
- **THEN** the LLM request contains no skill-pack content.

#### Scenario: Small talk skips the extraction fetch

- **GIVEN** the planner returns `extractionContext: false`
- **AND** a scope with an explicit primary document
- **WHEN** the user sends a greeting
- **THEN** no `/ingest/document/extract/*` request is made
- **AND** the grounded prompt carries no EXTRACTED FIELDS block
- **AND** the turn succeeds.

#### Scenario: Paraphrased app-state question routes structured without keywords

- **GIVEN** no UI intent hint and the planner returns `{ documentSearch: false, appState: true }`
- **WHEN** the user asks "how many pages do I have left on my plan?" (matching no keyword hint)
- **THEN** the turn routes to the structured handler
- **AND** the keyword classifier's heuristics are never consulted.

#### Scenario: Explicit intent hint routes without a planner call

- **GIVEN** a request carrying an intent hint that maps to a mode (e.g. `smart.report`)
- **WHEN** the turn routes
- **THEN** the mode comes from the hint deterministically
- **AND** zero planner calls are made for routing.

#### Scenario: The planner runs at most once per turn

- **GIVEN** no intent hint and a planner that returns `{ documentSearch: true, appState: false }`
- **WHEN** the rag turn runs end-to-end
- **THEN** exactly one planner call is made: the router's plan is threaded into the grounded
  seam, which does not plan again.

#### Scenario: Planner-routed structured turn degrades to rag when session deps are missing

- **GIVEN** no UI intent hint, a planner returning `{ appState: true, documentSearch: false }`,
  and a request whose deps lack `repository`/`chatSessionId`
- **WHEN** the turn routes
- **THEN** the turn runs the rag pipeline instead of throwing `ChatRouteNotImplementedError`
- **AND** rag runs with the deterministic seam fallback plan (the document search runs)
- **AND** keyword/intent-routed structured turns without those deps keep today's throwing
  behavior.

#### Scenario: Planner failure falls back deterministically

- **GIVEN** no UI intent hint, and the light LLM times out or returns garbage, or no light
  client is configured
- **WHEN** the turn runs
- **THEN** the mode comes from the deterministic keyword classifier, the search runs, the
  retriever's internal gate decides skill injection, the extraction context is fetched when a
  primary document exists, and the turn succeeds.

### Requirement: User-facing prompts SHALL ban internal vocabulary via a single-sourced voice fragment

Every user-facing model prompt SHALL include the shared VOICE fragment (single-sourced in the
prompts module). "User-facing" means a prompt whose output is rendered to the user as prose —
today the grounded prompt, including the hybrid-merged path; NOT the extractor or summarizer
prompts, whose outputs are internal values. The fragment forbids internal materials and
mechanics from appearing in answers — illustrative terms (the NORMATIVE list is the fragment
itself: the union of the two pre-merge copies' ban-lists, including "sections" and bare
"context"): "snippets", "extracted fields", "the docs/guidance I have", "skill pack", "structured
context", "system prompt", "tools". Answers SHALL refer to the user's content as "this document" /
"your documents" and to missing grounding as "I don't see that in this document". Knowledge and
state blocks SHALL be framed as private background the model speaks FROM, never cites.

#### Scenario: One fragment, every consumer

- **GIVEN** the prompts module
- **WHEN** any user-facing prompt is assembled
- **THEN** it contains the one VOICE fragment (no per-prompt copies to drift).

### Requirement: Hybrid answers SHALL be produced by the grounded seam with a workspace-state block

Hybrid mode SHALL call the same `groundedAnswerOverScope` seam as chat and report, passing its
structured app-state as a `structuredContext` block rendered into the grounded prompt as private
context — there SHALL NOT be a separate hybrid system prompt, and the router SHALL NOT run its
own hybrid search (the grounded seam's internal search is the only one). Hybrid replies keep
`mode: "hybrid"` and gain the full citation-verification contract. Hybrid SHALL pass a FIXED
turn plan `{ documentSearch: true, productKnowledge: false, extractionContext: true }` (the turn
was already routed — by intent hint, the planner's `appState` derivation, or the deterministic
fallback classifier) and `tools: undefined` (no tool advertising or tool-call routing on the
hybrid path); the merged reply SHALL keep the existing hybrid `suggestedActions` seeding plus
the citations-gated "Show all sources" chip. Degraded paths SHALL mirror today's split: a
missing groundx client or a failed search runs the grounded seam with EMPTY snippets (LLM prose
preserved); a missing LLM client/model id or a grounded-seam LLM failure returns the
deterministic structured fallback, now WITHOUT snippet preview or snippet citations (the
router-side hybrid search that fed those is deleted; accepted behavior change). No prompt is
involved on the deterministic path.

#### Scenario: Hybrid turn uses the grounded prompt

- **GIVEN** a question classified hybrid
- **WHEN** the turn runs
- **THEN** the LLM request uses the grounded system prompt with a WORKSPACE STATE block
- **AND** an uncited hybrid answer carries zero citations.

#### Scenario: Hybrid keeps extraction context

- **GIVEN** a hybrid-routed turn over a scope with a primary document
- **WHEN** the grounded seam runs with the fixed hybrid plan
- **THEN** the extraction fetch runs as before this change
- **AND** the seam itself makes no planner call (any planner call belongs to routing, upstream).

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

