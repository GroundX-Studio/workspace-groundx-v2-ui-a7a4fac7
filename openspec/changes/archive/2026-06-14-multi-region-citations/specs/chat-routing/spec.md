# Spec Delta — chat-routing

## ADDED Requirements

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

## MODIFIED Requirements

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
