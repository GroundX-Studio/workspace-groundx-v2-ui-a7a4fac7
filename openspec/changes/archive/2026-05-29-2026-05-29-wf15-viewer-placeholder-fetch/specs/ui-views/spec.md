# Spec Delta — ui-views

## ADDED Requirements

### Requirement: The document viewer SHALL NOT fetch an X-Ray for a placeholder id

The document viewer SHALL gate its X-Ray fetch on a real GroundX document UUID and SHALL NOT
request an X-Ray for a placeholder id such as `scenario:utility`. Until the active entity resolves
a real `documentId`, the viewer MUST show a neutral loading state rather than firing a doomed
request and flashing an error.

#### Scenario: No request for a placeholder id

- **GIVEN** a scenario opened before its real documentId resolves
- **WHEN** the viewer mounts
- **THEN** no `GET /v1/ingest/document/xray/scenario:*` request is issued
- **AND** a neutral loading state is shown until the real documentId is available.
