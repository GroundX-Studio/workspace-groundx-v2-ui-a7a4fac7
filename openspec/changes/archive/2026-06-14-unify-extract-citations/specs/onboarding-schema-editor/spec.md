# Spec Delta — onboarding-schema-editor

## ADDED Requirements

### Requirement: Extract-field citations SHALL be verified and tiered like every other grounded citation

The per-field extraction path SHALL produce its citation through the SAME
verify-and-tier pipeline as the chat/report/hybrid grounded paths — never a
bespoke, unverified citation shape. The LLM's emitted supporting quote SHALL be
verified against the retrieved snippet text via the shared verifier
(`verifyQuote`) and assigned a precision tier (`exact` / `paraphrase` /
`ambient`) and confidence via the shared `assignTier` / `confidenceFor`, exactly
as a grounded chat or report citation is. An emitted quote that does not verify
SHALL survive as an `ambient`-tier citation (it is not silently dropped), and a
citation whose `documentId` is not in the retrieved snippet set SHALL be
dropped. The extract-field citation wire shape SHALL therefore carry the same
`tier` / `confidence` / `bbox?` fields as the one shared `Citation` — the
former narrow `{documentId, page, snippet?}` subset is retired. The per-citation
verify-and-tier logic SHALL live in ONE shared helper used by both the grounded
answer path and the extraction path (no duplicated verification logic).

#### Scenario: An extract citation whose quote is verbatim in the document is tiered, not bare

- **GIVEN** a field extraction whose LLM result cites a quote present in a retrieved snippet
- **WHEN** the extraction result is built
- **THEN** the citation carries a non-`ambient` tier (`paraphrase`, or `exact` when a word box resolves) and a confidence, produced by the same verifier the chat/report paths use.

#### Scenario: An extract citation whose quote cannot be verified degrades to ambient

- **GIVEN** a field extraction whose LLM-emitted quote is not found in any retrieved snippet (but the documentId is in the snippet set)
- **WHEN** the extraction result is built
- **THEN** the citation is kept at `ambient` tier (not silently dropped), mirroring the grounded path.

#### Scenario: An extract citation referencing an unretrieved document is dropped

- **GIVEN** a field extraction whose LLM citation names a documentId absent from the retrieved snippet set
- **WHEN** the extraction result is built
- **THEN** the citation is dropped (`null`), preserving the existing trust boundary.
