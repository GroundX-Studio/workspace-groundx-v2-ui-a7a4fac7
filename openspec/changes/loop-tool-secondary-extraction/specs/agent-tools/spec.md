# Spec Delta — agent-tools

## ADDED Requirements

### Requirement: A secondary extraction-fetch server-executed tool SHALL pull another document's extraction mid-answer

The catalog SHALL include a `read`-category, server-executed tool (declaring
`serverExecute` + `activityLabel`, no `intentBuilder`) that fetches a named document's
full workflow-extraction — the same payload the grounded prompt's primary-document
EXTRACTED FIELDS block uses — on demand inside the grounded tool-result loop, so an
answer spanning multiple documents can reach a second document's structured fields.
The fetch SHALL be best-effort: a failure feeds a terse error and MUST NOT fail the turn.

#### Scenario: Model fetches a second document's extraction

- **GIVEN** a turn whose answer references a document not covered by the primary extraction
- **WHEN** the model calls the secondary-extraction tool with that `documentId`
- **THEN** the middleware fetches that document's extraction and feeds it back
- **AND** the answer draws on both documents.
