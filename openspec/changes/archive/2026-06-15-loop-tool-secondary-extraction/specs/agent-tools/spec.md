# Spec Delta — agent-tools

## ADDED Requirements

### Requirement: A secondary extraction-fetch server-executed tool SHALL pull another document's extraction mid-answer

The catalog SHALL include a `read`-category, server-executed tool (declaring
`serverExecute` + `activityLabel`, no `intentBuilder`) that fetches a named document's
full workflow-extraction — the same payload the grounded prompt's primary-document
EXTRACTED FIELDS block uses — on demand inside the grounded tool-result loop, so an
answer spanning multiple documents can reach a second document's structured fields.
The fetch SHALL be best-effort: a failure feeds a terse error and MUST NOT fail the turn.

The tool SHALL only fetch a document the current turn has already surfaced under the
caller's authorization — i.e. a document in the turn's RBAC-filtered search results
(snippets) or the explicit `documents` scope. A model-supplied `documentId` outside
that set (e.g. one injected into document text) SHALL be REFUSED — the middleware
returns a terse "not available" result and performs NO fetch. This mirrors the
re-search tool's no-scope-widening rule: a server-executed read tool can never reach
content the turn's authorized retrieval did not.

#### Scenario: Model fetches a second document's extraction

- **GIVEN** a turn whose answer references a document surfaced in the turn's search results but not covered by the PRIMARY extraction
- **WHEN** the model calls the secondary-extraction tool with that `documentId`
- **THEN** the middleware fetches that document's extraction and feeds it back
- **AND** the answer draws on both documents.

#### Scenario: An out-of-scope documentId is refused, not fetched

- **GIVEN** a turn whose authorized search surfaced only document A
- **WHEN** the model calls the secondary-extraction tool with a `documentId` (B) that was NOT surfaced this turn
- **THEN** the middleware performs NO extraction fetch for B and feeds back a terse "not available" result
- **AND** the turn still succeeds.
