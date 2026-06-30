# Spec Delta — ui-views

## ADDED Requirements

### Requirement: Chat citations SHALL persist with bbox and rehydrate on refresh

Chat-reply citations SHALL be persisted with their geometry and rehydrated on refresh. The reply's
`citations` (documentId, page, and normalized `bbox`) MUST be written to
`chat_messages.citations_json` and projected on `GET /chat-sessions/:id/messages`, so reloading a
session restores the citation chips at the same geometry as the live reply rather than dropping
them.

#### Scenario: Citations rehydrate after refresh

- **GIVEN** a RAG reply whose citations carried a `bbox`
- **WHEN** the session is reloaded and its messages are fetched
- **THEN** the assistant message's `citations` include page + bbox
- **AND** the chips render at the same geometry as the live reply.
