# Spec Delta — chat-routing

## ADDED Requirements

### Requirement: Citations SHALL survive the chat reply transport intact

The `citations: Citation[]` array returned by `routeChat` SHALL pass
through the `/api/chat/messages` route, the `sendChatMessage` client
wrapper, and the `ChatReply.citations` consumer surface without
re-shaping or filtering. Each `Citation` SHALL carry at minimum
`documentId: string` + `page: number`, with `snippet: string | null`
and `bbox?: {x,y,w,h}` as optional enrichment. The chat router already
emits this payload on every RAG and hybrid reply; this requirement
formalizes the transport contract end-to-end.

#### Scenario: Citation round-trip end-to-end (Rule 9 closure)

- **GIVEN** the chat router returns a reply with `citations: [{documentId: "X", page: 7, snippet: "...", bbox: {...}}]`
- **WHEN** the client receives the `sendChatMessage` result
- **THEN** `result.reply.citations[0]` carries the same documentId, page, snippet, and bbox values byte-for-byte
- **AND** the `chat_messages.citations_json` row holds the same JSON shape
