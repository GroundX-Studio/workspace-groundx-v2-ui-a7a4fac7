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

The chat surface SHALL render the assistant's reply token-by-token rather than waiting
for the full response, over the EXISTING `POST /api/chat/messages` endpoint via content
negotiation: a request with `Accept: text/event-stream` receives an SSE-framed stream;
any other request receives the existing single JSON envelope UNCHANGED (back-compat).

The streaming path SHALL emit SSE frames each carrying a monotonic `id` (sequence
number): a `meta` frame (`turnId`, `messageId`) first; `activity` frames (one per
server-executed tool); `token` frames (answer-text deltas); a terminal `envelope`
frame carrying the full existing `ChatReply` (citations, suggestedActions,
proposedSchemaField, intents, toolFailures, toolActivity); or a terminal `error` frame.
The streaming path MUST preserve ALL existing reply envelope fields once streaming
completes — the `envelope` frame is the existing `ChatReply` shape, unchanged.

Generation SHALL be DECOUPLED from the connection: a per-turn runner generates and
persists the message to the repository independently, so a client disconnect does NOT
abort or lose the turn. A SUPERSEDING new turn for the same session SHALL cooperatively
cancel the prior runner.

The streaming response SHALL set headers that defeat proxy buffering and idle timeouts
(`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`)
and SHALL emit a periodic heartbeat so intermediaries do not close an idle stream.
The server SHALL apply backpressure (a bounded per-turn event buffer; generation is
never blocked by a slow or absent reader).

The turn SHALL be identified by a CLIENT-supplied idempotency key on the initiating
request (not a server-minted id), so the client can always reconnect — even if the
`meta` frame never arrived — and so a re-request NEVER creates a duplicate turn or a
duplicate persisted message. The runner is keyed by `(session, turnKey)`; a re-request
with a known key attaches to the existing runner rather than starting a new generation.

Reconnect/resume SHALL be supported: a client re-request carrying the same turn key and
`Last-Event-ID` replays buffered events after that sequence from the in-memory per-turn
buffer when the runner is still on the serving instance; otherwise the server SHALL
deliver the persisted final message as a single `envelope` frame. Correctness (the final
answer) is guaranteed by persistence; token-level live resume is best-effort.

Resume SHALL be authorized: the server SHALL serve a turn's stream only to the SAME
authenticated session that owns the turn. A request for a turn key owned by a different
session SHALL be refused (no cross-session resume).

Backpressure SHALL NOT block generation: the runner appends events to a bounded buffer
(drop-oldest `token` on overflow); a SEPARATE per-connection pump drains the buffer to
the socket honoring write backpressure. A slow or absent reader never stalls generation.

#### Scenario: Long answer streams token-by-token

- **GIVEN** a chat turn that would return a long answer (>500 tokens)
- **WHEN** the user sends the turn with `Accept: text/event-stream`
- **THEN** the answer SHALL render in the chat scroll token-by-token within ~30ms of each token arriving
- **AND** the full envelope (citations, suggestedActions, proposedSchemaField) lands as the terminal `envelope` frame on completion

#### Scenario: Non-streaming request still gets the JSON envelope

- **GIVEN** a chat POST WITHOUT `Accept: text/event-stream`
- **WHEN** the chat router handles it
- **THEN** the response is the existing single JSON `ChatReply` envelope, unchanged
- **AND** no SSE framing is applied (every existing consumer/test keeps working)

#### Scenario: Client disconnect does not lose the turn

- **GIVEN** a streaming turn whose client connection drops mid-generation
- **WHEN** the runner continues
- **THEN** the turn completes and the assistant message is persisted to the repository
- **AND** a subsequent fetch of the session messages returns the completed answer

#### Scenario: Reconnect replays missed events, else delivers the final message

- **GIVEN** a streaming turn the client was consuming up to sequence N
- **WHEN** the client re-requests with `Last-Event-ID: N` and the runner+buffer are still on the serving instance
- **THEN** only events after N are sent, continuing the stream
- **GIVEN** instead the runner is no longer on the serving instance (different replica or expired buffer)
- **WHEN** the client re-requests with `Last-Event-ID: N`
- **THEN** the server delivers the persisted final message as a single `envelope` frame and closes

#### Scenario: A reconnect with the same turn key does not duplicate the turn

- **GIVEN** a streaming turn initiated with client turn key K whose connection dropped
- **WHEN** the client re-requests with the SAME turn key K
- **THEN** the server attaches to the existing runner (or its persisted result) for K
- **AND** no second generation runs and no duplicate assistant message is persisted

#### Scenario: A turn key owned by another session is refused

- **GIVEN** a turn keyed to session A
- **WHEN** a request from a DIFFERENT authenticated session presents that turn key
- **THEN** the server refuses (no stream, no replay) — turns resume only within their owning session

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
`documentId: string` plus a `regions: { page: number; bbox: {x,y,w,h};
tier }[]` array — each region carrying its own page, normalized bbox, and
tier — with `snippet: string | null` as optional enrichment. The legacy
top-level `page` / `bbox?` / `tier?` fields SHALL be retained as a derived
FIRST-REGION alias for the migration window, so every current reader keeps
working while new readers consume `regions`. A `Citation` MAY carry zero
regions ONLY in the single permitted pageless case — a validated extraction
value whose on-page location is genuinely unknown (see the claim-level
citations requirement); every other citation carries at least one region.
The chat router already emits this payload on every RAG and hybrid reply;
this requirement formalizes the transport contract end-to-end.

#### Scenario: Citation round-trip end-to-end (Rule 9 closure)

- **GIVEN** the chat router returns a reply with `citations: [{documentId: "X", regions: [{page: 7, bbox: {...}, tier: "paraphrase"}], snippet: "..."}]`
- **WHEN** the client receives the `sendChatMessage` result
- **THEN** `result.reply.citations[0]` carries the same documentId, regions (page/bbox/tier), and snippet values byte-for-byte
- **AND** the derived legacy `page`/`bbox`/`tier` fields equal the first region's values
- **AND** the `chat_messages.citations_json` row holds the same JSON shape.

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

The chat router SHALL populate each SNIPPET-SOURCED `reply.citations[*]` with one or more `regions`,
each carrying the correct `page` and a normalized `bbox` (0-1 page-relative `{x,y,w,h}`). When the
search result already carries geometry (`boundingBoxes` + `pages`), the router SHALL read it directly:
page from `boundingBoxes[0].pageNumber` (falling back to `pages[0].number`), and a SEPARATE region per
pixel `boundingBox` **on the cited page** (grouped by `pageNumber`, never unioned across pages AND never
unioned into a single enclosing envelope), each normalized by that page's `width`/`height`. When the
result carries no `boundingBoxes`, the router SHALL resolve geometry from the document's X-Ray by
matching the citation snippet against `chunks[].text`, taking the page from the matched chunk's
`pageNumbers[0]` and emitting a region per the chunk's cited-page `boundingBoxes`; the X-Ray SHALL be
fetched at most once per document (cached). The router SHALL NOT read a top-level `pageNumber` field —
the deployed API does not return one, so doing so silently defaults every citation to page 1. When a
snippet matches no chunk (an emitted-but-unverified quote), the citation SHALL ship a single `ambient`
region covering the CLAIMED PAGE (a whole-page marker) — never geometry-less, never dropped. Resolution
MUST be best-effort: a resolver error MUST NOT fail the chat turn.

EXTRACTION-SOURCED citations (which carry no quote and no snippet geometry) SHALL resolve geometry via
the shared field resolver over the same cached document X-Ray, locating the cited VALUE by the
value-exact match rule (numeric for numbers, normalized whole-token for words — see the multi-region
requirement) and emitting a region for EVERY chunk in which it appears (never unioned to one envelope,
never narrowed by the field label). On a miss — a reformatted/derived/too-common value that matches no
chunk — the router SHALL fall back: (1) a last-resort locate by the generic field label, on a hit
attaching that chunk region at `tier: "ambient"`; (2) failing that, keep a REGIONLESS `ambient` citation
(validated against the payload, location unknown). The entry SHALL NOT be dropped (this REPLACES the
former drop-on-geometry-miss / "no pageless citation form" rule, per the 2026-06-14 user decision). The
X-Ray cache SHALL be shared with the snippet path (still at most one fetch per document per turn).

#### Scenario: Geometry read directly off a result that carries it

- **GIVEN** a RAG reply whose search result carries `boundingBoxes`
  `(362,593)-(1601,2031)` with `pageNumber: 2` and a `pages` entry `{number:2, width:1700, height:2200}`
- **WHEN** the chat router assembles the reply
- **THEN** the citation carries a region with `page: 2`
- **AND** that region's `bbox` is approximately `{x:0.213, y:0.270, w:0.729, h:0.654}` (px ÷ page dims)
- **AND** no X-Ray fetch is needed for that citation.

#### Scenario: A result lacking geometry resolves via X-Ray, once per document

- **GIVEN** a reply with two citations from one document whose search results carry no `boundingBoxes`
- **WHEN** geometry is resolved for both
- **THEN** the document's X-Ray is fetched at most once (cached)
- **AND** each citation whose snippet matches an X-Ray chunk carries that chunk's normalized per-box region(s).

#### Scenario: An unmatched snippet ships a whole-page ambient region without failing

- **GIVEN** a citation whose result has no `boundingBoxes` and matches no X-Ray chunk
- **WHEN** the chat router assembles the reply
- **THEN** the citation carries a single `ambient` region covering the claimed page (not geometry-less, not dropped)
- **AND** the chat turn still succeeds (no thrown error).

#### Scenario: An extraction citation resolves a region per occurrence via the field resolver

- **GIVEN** a validated extraction-sourced citation whose `value` appears in X-Ray chunks on page 2 (one or more places)
- **WHEN** the chat router assembles the reply
- **THEN** the citation carries a region per chunk where the value appears, each `page: 2` with the chunk's normalized `bbox`
- **AND** each such region's `tier` is `"paraphrase"` (or `"exact"` after a word-level upgrade)
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
SHALL carry one or more `regions`, EACH with its own `tier` of `exact`, `paraphrase`, or `ambient`,
plus a citation-level `confidence`. A verified quote SHALL resolve at `paraphrase` with the chunk's
per-line region(s) (WF-03, no union envelope); an embedding-verified quote
SHALL NOT exceed `paraphrase` and SHALL carry its cosine score as `confidence`; when the
word-level atom resolver is present, a verbatim raw-`text` quote MAY upgrade a region to `exact` with a
word-level `bbox`.
An EMITTED-but-unverified quote — the model cited, all three checks (exact, normalized, embedding)
failed — SHALL NOT be invented and SHALL NOT be dropped: it SHALL be kept as a single `ambient` region
covering the claimed PAGE (a whole-page marker rendered "unconfirmed"), never a guessed chunk/word box.

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
of these payload checks SHALL be DROPPED entirely (a failed check means the citation has no real
referent — Bucket A). When the `field` path resolves to a CONTAINER (object/array — the former
`branchNode` drop), the router SHALL descend the path to its scalar leaf values (a generic tree walk)
and locate EACH leaf, rather than dropping; it SHALL NOT anchor on a chosen identifier field. A
validated extraction citation SHALL carry the verified-level `confidence` and SHALL
resolve geometry per the multi-region citation-geometry rule: a region for every chunk where the value
appears, at `tier: "paraphrase"` (chunk) or `exact` (word-level upgrade). A validated value that
matches no chunk (reformatted/derived/too-common) SHALL NOT be dropped — it SHALL fall back to a
label-located `ambient` region, else a regionless `ambient` citation (validated, location unknown); this
is the ONE pageless citation form, permitted only for a validated-but-unlocatable extraction value (the
former drop-on-geometry-miss rule and "no pageless citation form" clause are superseded, 2026-06-14).
After a region resolves at chunk level, the router SHALL attempt the word-level upgrade
(2026-06-11): the validated `value` is verbatim by
construction, so it SHALL be resolved through the document's `-118-map` word map via the atom
resolver, the same upgrade path the snippet-quote form uses. When a consecutive atom run resolves,
the region SHALL ship that run's tight word-level `bbox` (+ its page), and its tier follows the
attribution tiering rule: `exact` when the cited `value` matched the payload exactly; a
normalized-only value match keeps `tier: "paraphrase"` (with the tighter box). A
word-map miss — unfetchable map, no verbatim atom run, or any resolver failure — SHALL keep the
chunk geometry at `tier: "paraphrase"` and MUST NOT drop the citation or fail the turn.

Verification + any geometry fetches MUST be best-effort and cached per
`documentId`; any failure — including any embeddings-provider error, timeout, or
misconfiguration — SHALL drop the claim one tier (or, for an extraction entry whose payload
validation cannot run, drop that entry as a Bucket-A failure) and MUST NOT fail the chat turn.

#### Scenario: A container-level extraction citation descends to its leaves instead of dropping

- **GIVEN** an extraction citation whose `field` path resolves to a container (object/array) holding scalar leaf values that appear in the document
- **WHEN** the router validates and resolves geometry
- **THEN** the citation descends to the container's scalar leaves and carries a region for every place each leaf value appears
- **AND** it is NOT dropped as a `branchNode`.

#### Scenario: An unverified quote is kept as a whole-page ambient region

- **GIVEN** an emitted snippet quote that fails the exact, normalized, AND embedding checks
- **WHEN** the router assembles citations
- **THEN** the citation is kept with a single `ambient` region covering the claimed page (rendered "unconfirmed")
- **AND** it is neither invented nor dropped.

#### Scenario: A validated extraction value that is not printed findably is kept, not dropped

- **GIVEN** a validated extraction citation whose value matches no X-Ray chunk (a reformatted or derived value)
- **WHEN** geometry is resolved
- **THEN** the router attaches a label-located `ambient` region if the field label matches a chunk, else keeps a regionless `ambient` citation (location unknown)
- **AND** the entry is NOT dropped and NOT treated as a Bucket-A fabrication.

#### Scenario: A fabricated extraction citation is still dropped

- **GIVEN** an extraction citation whose documentId is not the extraction's document, or whose field path does not resolve, or whose value does not match the payload
- **WHEN** the router validates the entry
- **THEN** it is dropped (Bucket A — no real referent)
- **AND** its drop is counted in the citation funnel.

### Requirement: Chat citations SHALL resolve a word-level bbox from the document `-118-map` when a verbatim quote is verified

The chat router SHALL, for any citation whose supporting verbatim quote has already verified against
its cited chunk, attempt to tighten the corresponding REGION's geometry to a word-level box by fetching
the document's `-118-map.json` word-map and calling the shipped `resolveWordGeometry(quote, map)`
resolver. When the resolver returns a box, the router SHALL replace that region's `bbox` with the
tighter word-level box and SHALL set that region's tier via `assignTier(v, { hasAtomBox: true })` so the
`exact` tier lights. The word-map SHALL be fetched at most once per document (cached), and
the lookup SHALL fire ONLY for already-verified citations — an unverified citation pays no word-map
fetch. Resolution MUST be best-effort: a missing or unfetchable word-map, malformed JSON, or a quote
that is not present verbatim in the map MUST leave the region at its X-Ray `paraphrase` chunk box
(never collapsing a real grounding to no geometry), and MUST NOT fail the chat turn. The router SHALL
NOT re-implement the resolver — it consumes the shipped pure `resolveWordGeometry`.

#### Scenario: A verified verbatim quote resolves to the tighter word-level box and lights `exact`

- **GIVEN** a RAG reply with a structured citation whose `quote` verifies against its cited chunk
- **AND** the cited document has a fetchable `-118-map.json` in which the quote's tokens appear as a
  consecutive atom run
- **WHEN** the chat router assembles the reply
- **THEN** the citation's matched region carries the word-level union box from the matched atoms (strictly tighter
  than the X-Ray chunk box for the same chunk)
- **AND** that region's `tier` is `exact`.

#### Scenario: Word-map fetched at most once per document

- **GIVEN** a reply with two verified citations from the same document
- **WHEN** word-level geometry is resolved for both
- **THEN** the document's `-118-map.json` is fetched at most once (cached).

#### Scenario: Unverified citations pay no word-map fetch

- **GIVEN** a reply whose only citation is unverified (the verbatim quote did not verify)
- **WHEN** the chat router assembles the reply
- **THEN** no `-118-map.json` fetch is performed for that document
- **AND** the citation resolves at the `ambient` tier with its whole-page region (not geometry-less).

#### Scenario: Fallback chain degrades cleanly to the chunk region

- **GIVEN** a verified citation whose document has no fetchable word-map, OR whose quote is not
  present verbatim in the word-map
- **WHEN** the chat router assembles the reply
- **THEN** the citation keeps its X-Ray chunk-level region(s)
- **AND** that region's `tier` is `paraphrase`
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
the document's `-118-map.json` word atoms, falling back to the X-Ray chunk region(s) and then — for a
real grounding — to the never-drop floor (a snippet's claimed-page `ambient` region, or an extraction
value's label-located / regionless `ambient` citation), NEVER to nothing. The resolved tight box SHALL
populate the corresponding REGION's `bbox`, so the WF-06b `exact` tier lights a word-level
highlight. Resolution SHALL be verbatim-only (no paraphrase inference).

#### Scenario: A verbatim citation gets a tight box

- **GIVEN** an answer citing a verbatim span present in the document
- **WHEN** citation geometry resolves
- **THEN** the region's `bbox` is the word-level union from `-118-map` (tighter than the chunk box)
- **AND** when the word map is unavailable it falls back to the X-Ray chunk region, then to the never-drop floor (not to no box for a real grounding).

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
Per-turn injection SHALL remain the FAST PATH; the `lookup_groundx_docs` server-executed read
tool (the formerly named evolution, now shipped via the grounded tool-result loop) is the
ESCALATION path for mid-answer knowledge needs the planner did not anticipate. Both paths SHALL
consume the SAME retriever over the SAME vendored pack — no second knowledge source. The tool's
declared prompt guidance SHALL steer the model away from calling it when the injected knowledge
block already covers the question.
*(Modified from the chat-architecture-hardening wording: the "prompt injection — NOT a lookup
tool" recorded constraint is RETIRED because the one-shot pipeline limitation it documented no
longer holds; the vendored-corpus / never-runtime-fetch / injection-gating invariants carry
forward unchanged.)*

#### Scenario: Product question answered from the skill pack

- **GIVEN** the vendored pack is present
- **WHEN** the user asks "what do you know about groundx?"
- **THEN** the system prompt carries retrieved skill sections and the reply answers from them
- **AND** the reply carries zero citations (no documents were drawn on).

#### Scenario: Missing pack degrades to snippets-only

- **GIVEN** a checkout where the pack was never synced
- **WHEN** a chat turn runs
- **THEN** retrieval returns nothing and the turn succeeds without a knowledge block.

#### Scenario: Mid-answer knowledge need escalates via the lookup tool

- **GIVEN** a turn the planner classified as document-only (no knowledge block injected)
- **WHEN** the (scripted) model calls `lookup_groundx_docs` with a product query
- **THEN** the tool result carries the retriever's top sections for that query
- **AND** the final answer draws on them with zero document citations for the product portion.

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

### Requirement: The grounded chat path SHALL run a bounded server-side tool-result loop

The grounded chat path SHALL support a bounded agentic loop on the shared
`groundedAnswerOverScope` seam, enabled by an explicit per-caller option
(chat passes `toolLoop: { maxRounds: 4 }`; report and hybrid pass no loop
option and SHALL remain single-shot, byte-identical to pre-loop behavior).
Within the loop, a tool call whose catalog entry declares a server executor
(`ServerTool.serverExecute`) SHALL be executed by the middleware, its string
result appended to the running transcript as a provider `tool` message
(paired to the assistant `tool_calls` message by id), and the LLM re-called
so the model continues its answer from the result. Only `read`-category
tools MAY declare a server executor; mutate tools SHALL always remain
user-confirmed chips. Tool calls WITHOUT a server executor emitted in any
round SHALL accumulate and route exactly as today (read → `reply.intents[]`,
mutate → `suggestedActions[]` chips) after the loop ends; accumulation SHALL
NOT dedupe by provider call id (synthesized ids collide across rounds). The loop SHALL end
when a round emits no server-executed call or the round cap is reached; the
final round's prose is the answer and flows through the unchanged
citation-verification contract (quotes verify against the SNIPPET set only —
server-executed tool results are private background, never citable). A
server-executed tool's validation or executor failure SHALL append a terse
error `tool` message AND a `toolFailures[]` entry, and MUST NOT fail the
turn; LLM transport failures keep their existing throwing behavior.

#### Scenario: Model continues its answer from a server-executed tool result

- **GIVEN** the chat LLM (scripted) emits a `lookup_groundx_docs` call in round 1
- **WHEN** the chat turn runs with the loop enabled
- **THEN** the middleware executes the tool and the round-2 LLM request carries
  the assistant `tool_calls` message plus a `role: "tool"` result message
- **AND** `reply.answer` is the round-2 prose
- **AND** no `intents[]` entry or chip carries the lookup call.

#### Scenario: Round cap bounds the loop

- **GIVEN** a scripted LLM that emits a server-executed tool call every round
- **WHEN** the turn runs with `maxRounds: 4`
- **THEN** the loop makes at most `maxRounds + 1` (5) grounded completions, plus
  at most one additional tool-only prose-repair completion when the capped
  round produced no prose (≤6 total)
- **AND** the turn succeeds with a final answer (bounded, never unbounded).

#### Scenario: Non-executable tools emitted mid-loop still route as intents/chips

- **GIVEN** round 1 emits both `lookup_groundx_docs` and `open_document`
- **WHEN** the loop completes
- **THEN** `open_document` appears exactly once on `reply.intents[]`
- **AND** `lookup_groundx_docs` appears on neither `intents[]` nor `suggestedActions[]`.

#### Scenario: Report and hybrid paths stay single-shot

- **GIVEN** a smart-report section generation (no `toolLoop` option)
- **WHEN** the section generates
- **THEN** exactly one LLM completion is made
- **AND** the request shape is byte-identical to the pre-loop seam.

#### Scenario: Executor failure degrades, never fails the turn

- **GIVEN** a server-executed call whose args fail Zod validation (or whose executor throws)
- **WHEN** the loop processes it
- **THEN** the model receives a terse error `tool` message and continues
- **AND** `reply.toolFailures[]` names the tool
- **AND** the turn succeeds.

### Requirement: Chat replies SHALL surface server-executed tool activity to the user

The chat reply envelope SHALL carry an OPTIONAL `toolActivity?: { name,
label }[]` — one entry per SUCCESSFULLY server-executed tool call in the turn
(failed executions appear on `toolFailures[]`, never here), with the
user-facing `label` taken from the tool's declared `activityLabel`. The field
SHALL be OPTIONAL (`z.array(...).optional()`), mirroring the existing
`_debug?` annotation: the rag producer sets it; the 17 structured/hybrid
reply producers — which can never run a server tool — omit it rather than
each writing `[]` (a required array would fail `tsc` at all 17 typed return
sites for no safety gain). It SHALL be single-sourced as a `@groundx/shared`
Zod field; because `app ChatReply` and middleware `ChatRouterResponse` are
direct aliases of the shared type, the existing `Eq<>` drift guards carry the
field with no manual per-side edit, and the runtime parse-boundary validate
(`chatReplySchema.safeParse`) continues to hold. The app SHALL read
`reply.toolActivity ?? []` and render any entries as a muted annotation on
the assistant message (e.g. "Checked GroundX docs"). A non-looped rag turn
SHALL carry `[]`; structured/hybrid turns MAY omit the field. A LIVE
in-progress indicator is deferred to the streaming requirement, where
`toolActivity` entries become stream events.

#### Scenario: A looped turn shows what was consulted

- **GIVEN** a turn in which `lookup_groundx_docs` executed successfully
- **WHEN** the reply renders
- **THEN** `reply.toolActivity` contains `{ name: "lookup_groundx_docs", label: "Checked GroundX docs" }`
- **AND** the assistant message shows the muted annotation.

#### Scenario: Non-looped and failed turns stay clean

- **GIVEN** a turn with no server-executed call (or one whose only call failed validation)
- **WHEN** the reply renders
- **THEN** `reply.toolActivity` is empty or absent (the app reads `?? []`)
- **AND** the failed call appears on `toolFailures[]` only.

### Requirement: Citations SHALL preserve all real proof as multiple page regions, never dropping a validated grounding

A citation SHALL carry ALL of the on-page locations that support its claim — not
a single box — and SHALL NEVER be discarded when the underlying grounding is
real. The `Citation` shape SHALL carry `regions: { page, bbox, tier }[]` — each
region carrying its OWN tier (the legacy single `page`/`bbox`/`tier` retained as a
derived first-region alias during migration).

This requirement applies to EVERY citation the system produces — chat answers,
report sections, extracted-field values, AND the Extract value grid (the
`/api/documents/:id/field-geometry` path) — through the ONE shared `Citation`
shape and the ONE shared geometry resolver; there SHALL be no per-surface
exception. There SHALL be NO cap on the number of regions: a value appearing on
many rows lights every one, and a container fans out to all its values' places;
persistence, transport, and rendering SHALL handle arbitrary region counts
without truncation. EXACT-duplicate regions (identical page + box, e.g. one chunk
matched by several of a container's leaf values) MAY be collapsed — they are one
occurrence, not many — but DISTINCT occurrences SHALL NOT be dropped. For DISPLAY
only, a renderer MAY combine OVERLAPPING / adjacent same-tier regions into their
bounding box so a many-region citation reads cleanly, provided distinct (non-
adjacent) occurrences stay separate and the citation's underlying region data is
unchanged. The cross-citation "show all sources" overview MAY mark one region per
citation (color-keyed by citation), while a single citation's click lights all of
its regions — both are valid renderings of the same region data.
Geometry resolution SHALL emit individual per-line / per-chunk boxes and SHALL
NOT union them into a single enclosing envelope. A cited chunk ALWAYS has bounding
boxes — from the retrieved search chunk (RAG), or, when the search result is bare,
fetched from the document X-Ray (which always carries chunk boxes); there is NO
bare-chunk path that drops a citation for lack of geometry. The router SHALL
highlight EVERY chunk/span where the cited value or quote appears (RAG: the
retrieved chunks; extraction: every chunk whose NORMALIZED text contains the
NORMALIZED value), so a value present in several places lights each. A word-level box
(`-118-map`) SHALL tighten a region when available; its absence keeps the
chunk-level region — never an empty citation.

Geometry resolution SHALL be SCHEMA-AGNOSTIC: it SHALL key off the cited/resolved
VALUES (a generic tree walk + the value-exact match rule below — numeric for
numbers, normalized whole-token for words), and SHALL NOT hardcode any
attribute or field name — the same logic SHALL serve any document or extraction
schema, not one sample's fields. Any label used SHALL be the generic last segment
of the cited path, never a baked-in name.

A VALIDATED grounding SHALL NEVER be dropped for want of a precise box:
- When a cited extraction `field` resolves to a container (object/array — the
  former `branchNode` drop), the router SHALL descend to the container's scalar
  leaf values (a generic tree walk) and locate EACH value's text in the X-Ray,
  highlighting every place each appears; it SHALL NOT drop the citation and SHALL
  NOT anchor on a chosen identifier field.
- A validated value that is PRINTED in the document SHALL resolve to at least its
  X-Ray chunk region(s) (the former `geometry` drop of a printed validated value
  does not occur); a word-level box tightens it when available.
- A validated value that matches NO chunk (a REFORMATTED value — e.g. an ISO date
  printed long-form — or a DERIVED value never printed) SHALL NOT be dropped. The
  router SHALL: (1) attempt a last-resort locate by the generic field LABEL and, on
  a hit, attach that chunk region at `tier: "ambient"`; (2) failing that, keep the
  citation with NO region at `tier: "ambient"` (validated against the payload,
  location unknown) — a source chip, NOT a drop and NOT a Bucket-A fabrication. This
  pageless form is permitted ONLY for a validated-but-unlocatable extraction value
  (a quote citation always carries its claimed page). The label-locator here is a
  last resort when there are ZERO value matches and SHALL NOT be used to narrow
  AMONG several value matches.

The value-LOCATION match (finding a value in the X-Ray for geometry) SHALL be
value-exact and whole-token, NOT semantic similarity, NOT a loose token-overlap,
and NOT a raw substring:
- **Numbers** SHALL be compared NUMERICALLY: parse the cited value AND each numeric
  token in the chunk to actual numbers and compare as numbers, matching a value as
  a WHOLE numeric token. This connects the extraction's plain-stored number to the
  document's formatted rendering (`7613.2` SHALL match `7,613.20` and `$7,613.20`)
  by principle rather than by the current resolver's brittle candidate-string +
  raw-substring workaround, and it SHALL match a value only as a whole numeric token
  (so it does NOT false-match a value inside a longer number, which the current
  substring test does).
- **Words / strings** SHALL be matched by NORMALIZED whole-token-sequence (strip
  whitespace / punctuation / currency, collapse spaces; require the value's tokens
  to appear as a whole sequence, not a substring).

It SHALL tolerate formatting noise (an extra space, `$`/comma/trailing-zero
differences) but SHALL NOT match a DIFFERENT value (`18.43` SHALL NOT match
`18.44`) NOR a value embedded inside a larger token (`18.43` SHALL NOT match within
`118.437`). It SHALL NOT use the field LABEL to narrow to a single chunk when a
value appears in several (the current resolver's label tiebreaker is removed — D1
requires every occurrence, and the label is schema-specific). A too-short or
too-common value (the existing minimum-distinctiveness guard) SHALL be treated as
NOT distinctly locatable and routed to the unlocatable-value fallback (below)
rather than flooding the page with matches of a common token; this is a
locatability precondition, NOT a cap on legitimate repeats. Embedding similarity
SHALL NOT be used for location — it would match near-miss numbers. (Embedding
similarity remains ONLY on the snippet/quote VERIFICATION arm, where a quote may
legitimately be a paraphrase; an extracted value is a datum, verified by
exact/normalized equality.)

This SHALL NOT relax the rejection of FABRICATED citations: an entry whose
`documentId` was not retrieved, whose `field` path does not resolve, or whose
cited `value` does not match the payload (exact/normalized equality), and a
malformed citations block (`parse`), SHALL still be rejected — there is no real
proof to preserve. The rate of these fabricated-claim drops
SHALL be treated as a PROMPT signal: when material, the citations-contract prompt
SHALL be tightened to steer the model toward leaf field paths and retrieved
document ids, with dropping retained only as the safety net.

`tier` SHALL be a property of EACH region, not the citation, set by a verification
ladder (strictest first): `exact` = the quote's words are in the chunk verbatim
(tight word box); `paraphrase` = same words ignoring formatting OR same meaning by
the embedding check (the matched chunk's region — embeddings confirm a reworded
quote HERE, a real region at lower confidence); `ambient` = all three failed (not
in the chunk by words or meaning) — the quote SHALL still be kept as a region for
the CLAIMED PAGE (a whole-page marker on the cited document's page), tagged
`ambient` and rendered as **"unconfirmed"** (an emitted-but-unverified quote is not
dropped — it shows what the model leaned on so a wrong pick is visible). The region
SHALL be page-level, NOT a guessed chunk/word box: every more-precise check failed,
so there is no verified basis to claim chunk-level precision; the page is the
finest location the system can stand behind. For a QUOTE, `ambient` is therefore a
region tier (the unconfirmed claimed PAGE), not a no-region state — every quote
citation has at least one region. A very short quote MAY skip the embedding step
(meaning-match of a tiny fragment is unreliable) and go straight to a page-level
`ambient` region. An extracted VALUE does not reach `ambient` through the
quote-verification ladder (it is validated against the payload, never
embedding-matched); it reaches `ambient` ONLY through the unlocatable-value
fallback above (a label-located region, or — uniquely — a regionless source chip
when its on-page location is genuinely unknown). A single citation MAY carry
regions of differing tiers and each SHALL render at its own precision.

#### Scenario: A "list everything" answer keeps its citations as multiple regions

- **GIVEN** a grounded answer that lists many values from one chunk and cites them at the container level (the former `branchNode` all-drop)
- **WHEN** the router assembles citations
- **THEN** the citation descends to the container's scalar leaf values and carries a region for every place each value appears, rather than being dropped
- **AND** the answer ships with citations rather than zero.

#### Scenario: A validated value with no word-level box still carries its chunk region

- **GIVEN** a validated extraction citation whose value cannot be pinned to a word-level box
- **WHEN** geometry is resolved
- **THEN** the citation carries the value's X-Ray chunk region(s) at `tier: "paraphrase"`
- **AND** it is NOT dropped.

#### Scenario: A validated value that is not printed verbatim is kept, never dropped

- **GIVEN** a validated extraction value that matches no chunk by numeric or text comparison (a reformatted date printed long-form, or a derived value never printed verbatim)
- **WHEN** geometry is resolved
- **THEN** the router attempts a last-resort locate by the generic field label and, on a hit, attaches that chunk region at `tier: "ambient"`
- **AND** if even the label does not locate, the citation is kept with NO region at `tier: "ambient"` (validated, location unknown) — a source chip
- **AND** it is NOT dropped and NOT counted as a fabricated-claim (Bucket-A) drop.

#### Scenario: A number is located by numeric comparison through formatting, but not when it differs or is embedded

- **GIVEN** an extracted number stored plain as `7613.2` whose document text renders it as `$7,613.20` (currency, comma, trailing zero)
- **WHEN** the value is located in the X-Ray
- **THEN** the numeric comparison parses both sides to the same number and highlights that chunk
- **AND** the same number with a stray space after the currency mark (`$ 7,613.20`) is also matched (the digit run is tokenized independent of surrounding `$`/spaces)
- **AND** a near-miss number (`18.43` against a document's `18.44`) does NOT match
- **AND** a number embedded in a larger token (`18.43` within `118.437`) does NOT match — it is not a whole numeric token (the current raw-substring matcher DOES false-match here; this scenario pins the fix).

#### Scenario: An unverified quote is kept as an unconfirmed page-level region, not dropped

- **GIVEN** an emitted quote that matches its chunk neither verbatim, nor under normalization, nor by embedding meaning
- **WHEN** the router assembles citations
- **THEN** the citation keeps a PAGE-LEVEL region (a whole-page marker on the cited document's claimed page) tagged `tier: "ambient"`
- **AND** that region is NOT a guessed chunk or word box (every more-precise check failed, so no sub-page precision is claimed)
- **AND** it is rendered as "unconfirmed", not dropped
- **AND** the `ambient` decision is reached only after the exact and near and embedding checks all fail.

#### Scenario: A citation's regions render at their own tiers

- **GIVEN** a citation whose answer draws on two values — one resolved to a tight word-level box, one only to its chunk
- **WHEN** the citation is assembled
- **THEN** the first region carries `tier: "exact"` and the second `tier: "paraphrase"`
- **AND** each is rendered at its own precision (no single citation-level tier flattens them).

#### Scenario: A value repeated across the document highlights every chunk it appears in

- **GIVEN** a cited extraction value that appears in several X-Ray chunks (e.g. the same charge on multiple meters)
- **WHEN** geometry is resolved
- **THEN** the citation carries one region per chunk where the value appears
- **AND** no occurrence is collapsed into a single union box.

#### Scenario: A fabricated citation is still rejected

- **GIVEN** an emitted citation whose documentId was not retrieved, or whose field path or value does not match the payload
- **WHEN** the router validates citations
- **THEN** the entry is dropped (no real proof to preserve)
- **AND** its drop is counted as a prompt-quality signal.

#### Scenario: Geometry resolution hardcodes no attribute names

- **GIVEN** an extraction payload with a non-utility shape (no `meters` / `meter_id` — e.g. a loan packet or a BYO upload's fields)
- **WHEN** a value or a container from it is cited
- **THEN** the resolver locates the value(s) by text and highlights them
- **AND** it references no sample-specific field name (the same code serves any schema).

### Requirement: The chat stream SHALL surface in-progress server-tool activity

The chat stream SHALL emit a live `activity` frame as each server-executed tool (e.g. `lookup_groundx_docs`, `search_documents`, `fetch_document_fields`) runs mid-turn, derived from the SAME per-call records that ship as `reply.toolActivity[]` in the non-streaming envelope — there SHALL NOT be a second activity source. The completed reply's `envelope` frame SHALL still carry the equivalent `toolActivity[]` entries.

#### Scenario: Live indicator during a mid-answer tool call

- **GIVEN** a streaming chat turn in which the model calls a server-executed tool
- **WHEN** the tool executes
- **THEN** the stream emits the tool's `activity` frame (e.g. "Checked GroundX docs") BEFORE the subsequent answer tokens
- **AND** the completed reply's `envelope` carries the same entry in `toolActivity[]`

