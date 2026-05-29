# Spec Delta — ui-views

## ADDED Requirements

### Requirement: The chat answer SHALL render claim segments whose highlight precision matches the citation tier

The ChatColumn SHALL render an assistant answer and, on hover or click of a cited claim, SHALL
highlight that claim's source region at the precision of its citation `tier`. An `exact`-tier
claim SHALL drive a tight (word-level) `pdf-viewer-highlight`; a `paraphrase`-tier claim SHALL
drive a chunk-region overlay rendered with a distinct, lower-confidence visual (translucent); an
`ambient`-tier claim SHALL render a source chip only, with no inline span highlight. The existing
CiteChip → `highlightCitation` dispatch SHALL remain the path for ambient sources, so the floor
behavior is unchanged when no tier resolves above ambient. (The `exact` tier may be dormant until
the middleware emits it — the render MUST handle all three tiers regardless.)

#### Scenario: Tier drives highlight precision

- **GIVEN** an assistant answer with claims tiered `exact`, `paraphrase`, and `ambient`
- **WHEN** the user hovers or clicks each cited claim in turn
- **THEN** the `exact` claim lights a tight word-level highlight on the cited page
- **AND** the `paraphrase` claim lights the chunk-region overlay in the translucent style
- **AND** the `ambient` claim shows only its source chip with no inline highlight.
