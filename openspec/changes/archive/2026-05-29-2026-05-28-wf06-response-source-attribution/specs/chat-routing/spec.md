# Spec Delta — chat-routing

## ADDED Requirements

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
