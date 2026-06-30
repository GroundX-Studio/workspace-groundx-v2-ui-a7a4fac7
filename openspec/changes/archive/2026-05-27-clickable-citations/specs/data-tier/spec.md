# Spec Delta — data-tier

## ADDED Requirements

### Requirement: GET /api/chat-sessions/:id/messages SHALL return citations per assistant turn

The persisted-thread hydrate endpoint SHALL parse the existing
`chat_messages.citations_json` column and project it under each
returned message as `citations: Citation[]`. A `null` /
absent JSON column SHALL map to an empty array. The client-side
`PersistedChatMessage` type SHALL expose the field so `liveTurns`
rehydration carries chips across refreshes.

This closes the "wired but disconnected" gap where `citations_json`
was being WRITTEN by the chat handler insert but never READ by the
hydrate path.

#### Scenario: Round-trip a citation across refresh

- **GIVEN** a chat handler insert wrote `citations_json` for one assistant turn
- **WHEN** the client calls `listChatMessages(chatSessionId)` on mount
- **THEN** the returned `PersistedChatMessage` for that turn carries the same `citations` array (same `documentId` / `page` / `snippet` / `bbox` values)

#### Scenario: Null citations_json maps to empty array

- **GIVEN** a chat_messages row whose `citations_json` is `NULL`
- **WHEN** the hydrate endpoint returns it
- **THEN** the response carries `citations: []`
- **AND** the client doesn't crash on parse
