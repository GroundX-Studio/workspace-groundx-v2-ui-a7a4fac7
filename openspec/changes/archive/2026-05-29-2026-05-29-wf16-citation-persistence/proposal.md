# WF-16: chat citations persist with bbox across refresh (finding 5)

## Why

Live-drive finding (2026-05-29): the live `POST /api/chat/messages` reply carried `citations` with
`bbox`, and the chat rendered them — but `GET /chat-sessions/:id/messages` returned
`citations: []`. The chips render only from the in-memory POST reply; on refresh they vanish. This
violates the existing `ui-views` "citation chips survive a refresh" rule — the persisted
`citations_json` (with `bbox`) isn't written/projected on the messages GET.

## What changes

The chat-reply `citations` (documentId + page + normalized `bbox`) SHALL be persisted to
`chat_messages.citations_json` and projected on the messages GET, so a rehydrated session restores
the chips at the same geometry as the live reply.

## Out of scope

- Generating the citations/bbox (WF-03, done); the placeholder-fetch flash (WF-15).

## Affected

- Middleware: persist `citations` (incl. bbox) on the chat write; project `citations_json` on
  `GET /chat-sessions/:id/messages`. App: confirm rehydrate restores chips.
- Specs: `ui-views` (citations persist with bbox + rehydrate).
