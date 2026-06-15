# Tasks — chat-response-streaming

NOT STARTED — planned 2026-06-15 (brainstormed: production-hardened, fetch+ReadableStream
SSE-framed, best-effort in-memory replay + MySQL-final resume). Phased; each task is
failing-test-first (discipline §1) + adversarial review before advancing.

## P1 — Server: SSE framing + decoupled runner + content negotiation
- [ ] **P1.0** Upstream LLM streaming mode in the LLM client (`stream: true`): parse the
  provider's TEXT deltas AND TOOL-CALL deltas; accumulate tool-call deltas to a complete
  call. Graceful fallback to a single full-text chunk when a provider can't stream. This
  is what makes `token` frames real (not post-hoc chunking). Failing test first: a
  streamed completion yields ordered text deltas + a reconstructed tool call; fallback
  yields one chunk.
- [ ] **P1.1** Content negotiation on `POST /api/chat/messages`: BOTH branches drive the
  SAME runner (one generation path, persist once). `Accept: text/event-stream` → stream;
  else run to completion → JSON. Failing test first: a non-streaming POST still returns
  the exact JSON envelope (back-compat guard) AND persists exactly one message; a
  streaming POST returns `Content-Type: text/event-stream`.
- [ ] **P1.2** `TurnRunner` that drives the existing grounded path but EMITS
  `meta`/`activity`/`token`/`envelope`/`error` events (monotonic `seq`) to an
  append-only buffer, and performs the existing MySQL persistence on completion.
  Keyed by a CLIENT-supplied `turnKey` scoped to the session (`Map<(sessionId,
  turnKey), runner>`) — idempotent: a re-POST with a known key ATTACHES, never starts
  a duplicate generation/persist. Test: frame order + ids; the `envelope` frame equals
  the non-streaming `ChatReply` byte-for-byte; `activity` frames mirror `toolActivity[]`;
  a duplicate POST with the same `turnKey` does NOT create a second turn/message.
- [ ] **P1.3** Connection-as-subscriber: SSE writer that subscribes to a runner buffer
  and writes frames. Streaming headers set (`text/event-stream`, `no-cache`,
  `X-Accel-Buffering: no`). Test: headers + a full happy-path stream.

## P2 — Production-hardening (server)
- [ ] **P2.1** Decoupled lifecycle: a client disconnect does NOT abort the runner;
  it completes + persists. Test: simulate `res` close mid-turn → message still saved.
- [ ] **P2.2** Reconnect/resume: re-request with the same `turnKey` + `Last-Event-ID`
  replays buffered events after that seq (runner present); else delivers the persisted
  final message as one `envelope`. Per-turn buffer TTL + eviction. **Authorization:** a
  `turnKey` owned by a different session is REFUSED (no cross-session resume). Tests:
  same-instance replay, final-from-DB fallback, cross-session refusal.
- [ ] **P2.3** Heartbeats (idle keep-alive under the ALB ~60s timeout) + bounded buffer
  backpressure (overflow drops oldest `token`s, never `meta`/`activity`/`envelope`/
  `error`). Tests: heartbeat on idle; overflow keeps the envelope.
- [ ] **P2.4** Supersede-cancel: a new turn for the same session cooperatively cancels
  the prior runner (AbortController on the LLM call). Test: prior runner aborted.

## P3 — Client: stream reader + reconnect
- [ ] **P3.1** Streaming `sendChatMessage` variant: generate a `turnKey` (idempotency
  key) on the initiating POST; POST `Accept: text/event-stream`,
  `response.body.getReader()`, SSE frame parser → dispatch token/activity/envelope/
  error. JSON variant retained. Test: parser + dispatch; turnKey sent; JSON path unchanged.
- [ ] **P3.2** Reconnect with `Last-Event-ID` (bounded retries + backoff); on
  exhaustion, fetch the saved message. `AbortController` on navigate/new-turn +
  signal the server to supersede-cancel. Tests: reconnect, abort.

## P4 — React rendering + live indicator
- [ ] **P4.1** Incremental token rendering into the in-flight assistant turn (chat
  scroll). Test: tokens append in order; final state matches the envelope.
- [ ] **P4.2** Live activity indicator: drive the existing `ThinkingStream` surface
  from real `activity` events (replacing the timed animation). `envelope` applies
  citations/suggestedActions via the existing consumers. Tests: live indicator shows
  on an `activity` event; citations render on `envelope`.

## P5 — Verify + close out
- [ ] **P5.1** Full suites green (existing JSON tests UNCHANGED — the back-compat
  proof); `openspec validate --strict`; production build clean.
- [ ] **P5.2** Live verification (preview): a real streamed turn renders token-by-token
  AND shows a live "Checked GroundX docs" indicator mid-answer.
- [ ] **P5.3** Adversarial review (per phase + whole); archive; the superseded
  `stream-chat-tool-activity` stub is already removed by this change.
