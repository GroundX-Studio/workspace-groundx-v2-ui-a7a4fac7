# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: The geometry-drop rate of validated extraction citations SHALL be measured before any policy change

The team SHALL measure, from the `citationFunnel` log over a usage soak
window, the share of extraction-sourced citations that passed payload
validation but were dropped with `dropReasons.geometry`, and SHALL record
the measurement in this change before proposing any relaxation of the
"no pageless citation form" rule. Any behavioral relaxation SHALL land its
MODIFIED spec delta (rewriting the claim-level-citations requirement's
geometry-drop clauses) BEFORE code, and SHALL be an explicit user decision —
never inferred. If geometry-only drops prove rare, this change SHALL close
with the measurement recorded and no behavior change.

#### Scenario: Measurement gates the policy decision

- **GIVEN** the citation funnel has accumulated over a usage soak window
- **WHEN** this change's T0 runs
- **THEN** the geometry-only drop share of validated extraction citations is recorded in the change
- **AND** no `verifyExtractionCitation` behavior changes before a MODIFIED delta and a recorded user decision.
