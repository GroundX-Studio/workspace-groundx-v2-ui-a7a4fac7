# Chat response streaming (SSE-framed) + live tool-activity indicator

## Why

The durable `chat-routing` spec requires "Chat SHALL support streaming responses"
(token-by-token), but it is specced-ahead-of-code: the chat path returns a single
JSON envelope today (`POST /api/chat/messages` → `sendChatMessage` → `response.json()`).
Because of that gap, the deferred `stream-chat-tool-activity` work — a live
"Checking GroundX docs…" indicator while a server-executed tool runs mid-turn —
has no channel to emit into. Both needs are unblocked by one foundation: a streaming
chat transport.

## What Changes

A streaming chat transport, content-negotiated on the EXISTING endpoint, plus the
live tool-activity events that ride on it:

- **Same endpoint, negotiated, ONE engine:** `POST /api/chat/messages` streams
  SSE-framed events when the request sends `Accept: text/event-stream`; otherwise it
  runs the same generation to completion and returns today's JSON envelope **contract
  unchanged** (back-compat for every existing consumer + test). Both branches drive the
  SAME `TurnRunner` — no forked generation path, persistence happens once.
- **Real token streaming:** the upstream LLM call gains a streaming mode (`stream: true`)
  whose text + tool-call deltas the runner re-emits as `token` frames (accumulating
  tool-call deltas to detect/run tools mid-loop). Providers that can't stream fall back
  to a single full-text `token` frame — the transport stays provider-agnostic.
- **Decoupled generation:** a per-turn *runner* generates independently of the
  connection. A client drop does NOT abort generation — the runner finishes and
  persists the message to MySQL (the existing chat-handler write). The connection
  merely attaches to the runner's event stream.
- **Wire protocol:** SSE frames each carrying a monotonic `id:` — `meta`,
  `activity` (per server-tool execution, the live indicator), `token` (answer
  deltas), `envelope` (full `ChatReply` on completion), `error`, and periodic
  heartbeats.
- **Production-hardening:** turns are keyed by a CLIENT-supplied idempotency key
  (session-scoped) so reconnect is idempotent (no duplicate turn) and works even if the
  first frame was missed, and resume is authorized to the owning session only.
  Reconnect/resume via re-POST with `Last-Event-ID` against a short-lived in-memory
  per-turn event buffer (replay missed events on the same instance; fall back to the
  persisted final message otherwise — the answer is never lost); heartbeats +
  no-proxy-buffering headers; bounded buffer drained by a per-connection pump
  (backpressure never blocks generation); cooperative cancel when a new turn supersedes
  a prior one (its partial output is discarded, not persisted).
- **Client + React:** a stream reader (`ReadableStream.getReader()` + SSE parser)
  on the chat send path (JSON path retained); incremental token rendering; the live
  activity indicator reuses the existing `ThinkingStream` surface; the `envelope`
  frame applies citations/suggestedActions on completion — same consumers as today.
- **Live tool-activity events** are derived from the SAME `reply.toolActivity[]`
  records the non-streaming envelope already produces — no second activity source.

## Supersedes

This change ABSORBS and replaces the `stream-chat-tool-activity` backlog stub (the
live indicator is folded in here, since it cannot exist without this transport). That
stub is removed — one streaming change, single source of truth.

## Non-goals

- No Redis or other new infrastructure — resume is best-effort in-memory replay with
  a MySQL-persisted final-message fallback (the deliberate cross-replica decision).
- No change to the citation / extraction / tool-loop logic — the `envelope` frame is
  the existing `ChatReply` shape, byte-for-byte.
- No change to the non-streaming JSON contract — it remains the negotiated fallback.

## Conformance to core architectural decisions

Composable: one transport, content-negotiated (mechanism stays; the streaming vs JSON
path is a negotiated value, not a fork). One source of truth: the `envelope` frame IS
the existing `ChatReply`; activity events ARE the existing `toolActivity[]`. Single
planning surface: this OpenSpec change; the superseded stub is removed (no tombstone).
