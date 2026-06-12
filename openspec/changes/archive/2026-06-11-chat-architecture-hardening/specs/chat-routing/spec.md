# Spec Delta — chat-routing

PREREQUISITE: archive the completed `groundx-knowledge-prompt` change BEFORE this one — its
ADDED skill-knowledge requirement merges into the durable spec and is then renamed + modified
here (same capability, superseding mechanism).

## RENAMED Requirements

- FROM: `### Requirement: GroundX product knowledge SHALL be injected from a vendored corpus via keyword routing, never fetched at runtime`
- TO: `### Requirement: GroundX product knowledge SHALL come from the vendored skill pack via per-turn retrieval`

## MODIFIED Requirements

### Requirement: RAG citations SHALL be claim-level, quote-verified, and tiered by attribution confidence

The chat router SHALL produce claim-level citations whose precision is earned through
verification, rather than highlighting whole chunks unconditionally. The router SHALL prompt the
RAG model for quote-anchored structured output and SHALL treat the ABSENCE of an emitted
citations block as the model's signal that the answer did not draw on the documents: an uncited
answer SHALL carry **zero** citations (no-invented-citations, 2026-06-11 — the former
"all-snippets fallback" that fabricated ambient citations from search hits is RETIRED).
Each emitted `supportingQuote` SHALL be verified against its chunk — exact substring, then
normalized match (case/whitespace/punctuation/currency stripped), then (optionally) embedding
similarity via `verifyQuote`'s optional `embedder` parameter (no production wiring today — the
named evolution) — and the resulting citation
SHALL carry a `tier` of `exact`, `paraphrase`, or `ambient` plus a `confidence`. A verified quote
SHALL resolve at `paraphrase` with the chunk-level `bbox` (WF-03); when the word-level atom
resolver is present, a verbatim raw-`text` quote MAY upgrade to `exact` with a word-level `bbox`.
An `ambient` citation is an EMITTED-but-unverified quote — the model cited, verification failed —
never an invented one. Verification + any geometry fetches MUST be best-effort and cached per
`documentId`; any failure SHALL drop the claim one tier and MUST NOT fail the chat turn.

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

## ADDED Requirements

### Requirement: The grounded prompt SHALL include the primary document's full extraction output

The grounded call SHALL fetch the primary document's full workflow-extraction output (the same
`/ingest/document/extract/{id}` payload the Extract workbench renders) and include it in the
prompt as an EXTRACTED FIELDS block, capped (~6KB, truncation-marked). The primary document SHALL
be the scope's explicit document, else the top search snippet's. The fetch SHALL be best-effort:
any failure or absence degrades to a snippets-only prompt and MUST NOT fail the turn. Rationale:
search retrieves only the top-K chunks, so structured questions (counts, identifiers) miss when
the matching chunk is not retrieved.

#### Scenario: Structured question answered from the extraction block

- **GIVEN** a document whose extraction lists two meters
- **WHEN** the user asks "how many meters are there?"
- **THEN** the LLM request carries the full extraction values
- **AND** the reply states the count from them.

#### Scenario: Extraction fetch failure degrades gracefully

- **GIVEN** the extraction endpoint errors
- **WHEN** a chat turn runs
- **THEN** the prompt is snippets-only and the turn succeeds.

### Requirement: A light-LLM turn router SHALL plan each turn's retrieval with a deterministic fallback

The chat pipeline SHALL classify each user turn BEFORE retrieval using the light LLM (CF-16
`lightLlmClient`); the planner SHALL run ONLY when a light client is configured — it SHALL NOT
borrow the main chat client. The LLM SHALL emit an extensible decision record — initially
`{ documentSearch: boolean, productKnowledge: boolean }` (Zod-validated, unknown future flags
tolerated); the CONSUMED plan value for `productKnowledge` is
`boolean | "retriever-decides"`, where the sentinel is internal-only (never emitted by the
model). The plan SHALL gate BOTH the GroundX search and the skill-pack retrieval. On a
missing light client, timeout, or invalid output the router SHALL fall back DETERMINISTICALLY to
`{ documentSearch: true, productKnowledge: "retriever-decides" }` — the skill retriever runs with
its internal scoring gate intact, exactly the pre-router behavior; the router SHALL NOT replicate
the retriever's scoring — and the turn MUST succeed. The seam's report caller (smart-report
section generation) SHALL pass the fixed plan `{ documentSearch: true, productKnowledge: false }`
— report sections never inject product knowledge (an intentional change: today's default lets
them). Adding a RETRIEVAL-PLANNING scenario SHALL be a new flag on the record consumed at its
gate — never a parallel retrieval classifier; the existing keyword `classifyChat` mode router is
outside this ban and is the named subsumption target for a future `appState` flag. The classifier
prompt SHALL live in the prompts module.

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

#### Scenario: Planner failure falls back deterministically

- **GIVEN** the light LLM times out or returns garbage, or no light client is configured
- **WHEN** the turn runs
- **THEN** the search runs, the retriever's internal gate decides skill injection, and the turn succeeds.

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
turn plan `{ documentSearch: true, productKnowledge: false }` (the mode classifier already routed
the turn) and `tools: undefined` (no tool advertising or tool-call routing on the hybrid path);
the merged reply SHALL keep the existing hybrid `suggestedActions` seeding plus the
citations-gated "Show all sources" chip. Degraded paths SHALL mirror today's split: a missing
groundx client or a failed search runs the grounded seam with EMPTY snippets (LLM prose
preserved); a missing LLM client/model id or a grounded-seam LLM failure returns the
deterministic structured fallback, now WITHOUT snippet preview or snippet citations (the
router-side hybrid search that fed those is deleted; accepted behavior change). No prompt is
involved on the deterministic path.

#### Scenario: Hybrid turn uses the grounded prompt

- **GIVEN** a question classified hybrid
- **WHEN** the turn runs
- **THEN** the LLM request uses the grounded system prompt with a WORKSPACE STATE block
- **AND** an uncited hybrid answer carries zero citations.
