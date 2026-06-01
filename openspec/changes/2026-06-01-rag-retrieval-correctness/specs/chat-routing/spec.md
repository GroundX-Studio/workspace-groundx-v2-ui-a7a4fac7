# chat-routing — spec delta (2026-06-01-rag-retrieval-correctness)

## ADDED Requirements

### Requirement: RAG retrieval SHALL surface answerable content with a regression suite

RAG retrieval SHALL surface answerable content for indexed documents (including
extract-indexed), and a regression suite SHALL assert grounded, cited answers
for ground-truth queries.

When a chat turn asks a content question whose answer is present in a document
in the active `ContentScope`, the RAG pipeline (`runRagPipeline` →
`groundedAnswerOverScope` → `searchGroundX`) SHALL surface usable snippets and
return a grounded answer carrying at least one `Citation`. The pipeline SHALL
NOT return a "no snippets" refusal for a query whose answer the platform
demonstrably holds (e.g. a value the Extract surface renders for the same doc
over the same scope).

Retrieval SHALL work for documents regardless of how their searchable text is
indexed, INCLUDING extract-workflow-indexed documents whose chunks may score
below GroundX's default relevance floor: the low-relevance-floor pass SHALL
reliably engage whenever the USABLE-snippet set is empty (not only when the raw
result count is exactly zero), and/or the document's extraction/X-Ray chunks
SHALL serve as a snippet source when prose search yields nothing. The
content-scope filter (`compileScopeFilter` over the active entity's
project/bucket/document scope, composed with the server-derived RBAC filter)
SHALL match the target document; a scope filter that excludes an in-scope
document is a defect.

A deterministic regression suite SHALL assert RAG correctness against RECORDED
real GroundX responses (offline, no live network in CI): for each ground-truth
query over the seeded sample it SHALL assert the answer contains the expected
value, `citations.length >= 1`, a non-empty snippet set, and the expected
citation tier; and a tripwire SHALL assert a known-answerable query never
silently returns zero citations / the "no snippets" refusal. The well-scored
prose-document path SHALL remain first-pass (no extra round-trip introduced by
the empty-set fallback).

#### Scenario: Utility "amount due" returns a grounded citation (DL-1 closure)

- **GIVEN** the seeded Utility sample (bucket 28454, doc c3bfff49, `utility`
  project filter) whose Extract surface renders `balance_payable = 7613.2`
- **WHEN** the user asks "What is the total amount due on this bill?" in
  onboarding chat
- **THEN** `runRagPipeline` returns a non-empty snippet set AND
  `reply.citations.length >= 1`
- **AND** the answer contains the real amount-due value
- **AND** the answer is NOT the "no snippets were found" refusal

#### Scenario: Empty usable-snippet set triggers the low-floor / extract-source pass

- **GIVEN** a document whose chunks score below the default relevance floor on
  the initial search (e.g. an extract-workflow-indexed doc)
- **WHEN** the initial search yields no usable snippets
- **THEN** `searchGroundX` engages the low-relevance-floor pass (and/or the
  extraction/X-Ray snippet source) so the answerable chunks surface
- **AND** the dev-only `_debug.groundx` accumulator records the per-stage
  counts (initial result count, retry fired, retry/fallback result count,
  usable snippet count) so the surfacing path is observable

#### Scenario: Well-scored prose document stays first-pass

- **GIVEN** an ordinary prose document whose chunks clear the default relevance
  floor on the initial search
- **WHEN** the user asks a content question it can answer
- **THEN** the pipeline grounds the answer from the FIRST search pass
- **AND** no additional low-floor retry or extract/X-Ray fetch is performed for
  that turn

#### Scenario: Ground-truth regression suite locks correctness offline

- **GIVEN** the recorded GroundX fixtures for the ground-truth Q&A pairs over
  the seeded sample
- **WHEN** the regression suite runs in CI with fake GroundX + LLM clients
  replaying the fixtures (no live network)
- **THEN** each pair asserts the expected value in the answer,
  `citations.length >= 1`, a non-empty snippet set, and the expected tier floor
- **AND** the "never silently no-snippets" tripwire fails the build if a
  known-answerable query returns zero citations
- **AND** the suite fails if the retrieval fix is reverted
