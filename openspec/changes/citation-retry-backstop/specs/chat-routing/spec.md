# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: A content turn that emits no citations SHALL be retried once for the citations block

The middleware SHALL retry exactly once for the citations block: when a
rag-mode grounded turn with non-empty snippets produces a content answer
whose completion carries no citation entries, it SHALL issue ONE follow-up
completion over the same transcript requesting only the citations block, verify its entries through
the unchanged verification contract, and ship the result. The retry MUST NOT
fire for non-content turns (the no-invented-citations rule is unchanged),
MUST NOT fire more than once per turn, and a retry that still yields no
citations SHALL ship the answer citation-less without failing the turn. The
citation funnel SHALL mark retried turns. (Conditional on the T0
measurement gate — if the residual zero-citation rate is immaterial, this
change closes unimplemented and this delta is withdrawn.)

#### Scenario: Omitted block recovered by one retry

- **GIVEN** a scripted LLM that omits the citations block on the first completion and emits a valid block on the second
- **WHEN** a rag content turn runs
- **THEN** the reply ships the verified citations
- **AND** exactly one retry request was made
- **AND** the funnel marks the turn as retried.

#### Scenario: Retry never fires on non-content turns

- **GIVEN** a product question whose completion carries no citations block
- **WHEN** the turn runs
- **THEN** no retry request is made and the reply carries zero citations.
