# Spec Delta — scenarios

## ADDED Requirements

### Requirement: All three sample scenarios SHALL be backed by real ingested documents

Each of the three sample scenarios SHALL be backed by real GroundX-ingested documents, not
placeholders or fixtures. Utility ships its single billing statement, Loan ships its 12-document
packet, and Solar ships its portfolio; all docs MUST be ingested at layout/full processLevel so
search returns geometry and an X-Ray exists, and each MUST carry a `filter.workflow_id` for schema
resolution. Solar's Portfolio, Fund, and Project levels MUST be expressed as document filter fields
(not GroundX groups). The `/api/scenarios` endpoint SHALL return all three with real `documentId`s.

#### Scenario: Each sample scenario resolves to real documents

- **GIVEN** the seeded sample bucket
- **WHEN** `/api/scenarios` is fetched
- **THEN** Utility, Loan, and Solar are returned, each with real GroundX `documentId`s
- **AND** none returns a placeholder id such as `scenario:<id>`.
