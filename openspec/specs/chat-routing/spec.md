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

### Requirement: routeChat SHALL invoke tool calls when the LLM emits them

The chat router SHALL execute tool calls emitted by the LLM and surface
the resulting tool-call records on the `ChatRouterResponse.tools` array.
The tool registry sources from `AgentToolBus` (see `agent-tools`
capability) and includes the named tools `search_groundx`,
`show_understand`, `show_extraction`, `show_field_citation`,
`pin_to_report`, `propose_schema_field`, `propose_report_section`.

#### Scenario: Show-extraction tool call surfaces in the reply

- **GIVEN** a chat turn whose answer triggers `show_extraction`
- **WHEN** routeChat finishes
- **THEN** `reply.tools` contains a `{name: "show_extraction", arguments: {…}}` entry
- **AND** the canvas advances to F3/Extract with the supplied arguments

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
2. Build the LLM-facing tool catalog via `toolRegistry.forStep(kind)` filtered also by the session's mode (`onboarding` / `steady`)
3. Pass the catalog to the LLM provider via the native `tools` parameter (OpenAI / Anthropic equivalent)
4. Set `tool_choice` to `"auto"` (let the model decide whether to use a tool)

The catalog SHALL NOT be duplicated into the system prompt narrative — the provider's structured `tools` field is the canonical surface.

#### Scenario: Tool catalog reflects the current viewer step

- **GIVEN** a chat session whose active ViewerStep is `extract-workbench` in onboarding mode
- **WHEN** the chat router builds the LLM request
- **THEN** the request's `tools` array contains `propose_field`, `accept_field`, `dismiss_field`, etc. (tools scoped to `extract-workbench`)
- **AND** the array excludes tools scoped to other steps
- **AND** the array excludes tools whose `availableIn` is `["steady"]` only

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

The chat router SHALL populate each `reply.citations[*]` with the correct `page` and a normalized
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

### Requirement: RAG citations SHALL be claim-level, quote-verified, and tiered by attribution confidence

The chat router SHALL produce claim-level citations whose precision is earned through
verification, rather than highlighting whole chunks unconditionally. The router SHALL prompt the
RAG model for quote-anchored structured output (`{ answerSpan, sourceIndices, supportingQuote }`)
and SHALL fall back to the legacy freeform `[n]` markers when no structured claims are emitted.
Each `supportingQuote` SHALL be verified against its chunk — exact substring, then normalized
match (case/whitespace/punctuation/currency stripped), then (optionally) embedding similarity to a
`suggestedText` sentence — and the resulting citation SHALL carry a `tier` of `exact`,
`paraphrase`, or `ambient` plus a `confidence`. A verified quote SHALL resolve at `paraphrase`
with the chunk-level `bbox` (WF-03); when the `-118-map` atom resolver is present, a verbatim
raw-`text` quote MAY upgrade to `exact` with a word-level `bbox` (Bridge A) — that resolver is
optional, so the `exact` tier MAY be dormant. An `ambient` citation (unverified, marker-only, or
the all-snippets fallback) carries no claim-level inline span. Verification + any geometry fetches
MUST be best-effort and cached per `documentId`; any failure SHALL drop the claim one tier and
MUST NOT fail the chat turn.

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

#### Scenario: Unverified or marker-only answer degrades to ambient

- **GIVEN** an answer with only freeform `[n]` markers, or a quote that clears no verification threshold
- **WHEN** the chat router assembles citations
- **THEN** the affected citations have `tier: "ambient"` and no `bbox`
- **AND** the chat turn still succeeds (no thrown error).

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

