# Spec Delta — testing-suite

## ADDED Requirements

### Requirement: The agentic tool-loop SHALL be validated against a live model before production trust

A documented live-model validation procedure SHALL confirm, against a running dev
server with live LLM + GroundX credentials, that: (1) the model calls
`lookup_groundx_docs` when product knowledge is needed AND refrains when the injected
GroundX knowledge block already covers the question; (2) the `maxRounds` budget is not
routinely exhausted on ordinary turns; (3) retrieved skill sections are relevant. The
procedure MAY run as a manual smoke or a gated CI job and SHALL NOT run in the default
LLM-free unit suite. Its outcome SHALL be recorded.

#### Scenario: A live validation pass distinguishes product vs document turns

- **GIVEN** a running dev server with live LLM + GroundX credentials
- **WHEN** the procedure runs a product question ("how does X-Ray work?") and a document question ("what is the meter number?")
- **THEN** the product question triggers a `lookup_groundx_docs` call and the document question does not
- **AND** the outcome is recorded.
