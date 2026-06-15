# Tasks — chat-response-streaming

NOT STARTED — planned 2026-06-15 (brainstormed: production-hardened, fetch+ReadableStream
SSE-framed, best-effort in-memory replay + MySQL-final resume). Phased; each task is
failing-test-first (discipline §1) + adversarial review before advancing.

## P1 — Server: SSE framing + decoupled runner + content negotiation
- [x] **P1.0** Upstream LLM streaming mode in the LLM client (`stream: true`): parse the
  provider's TEXT deltas AND TOOL-CALL deltas; accumulate tool-call deltas to a complete
  call. Graceful fallback to a single full-text chunk when a provider can't stream. This
  is what makes `token` frames real (not post-hoc chunking).
  - ↳ DONE (parser): `chatCompletionStream.ts` `consumeChatCompletionStream(response,
    {onText})` → `{rawAnswer, toolCalls, finishReason}` (same shape as the non-stream
    dispatch); accumulates tool-call deltas by index; robust to frames split across
    reads; ignores SSE comments. 5 tests.
  - ↳ DONE (dispatch): `callGroundedLlm` gains an opt-in `stream:{onToken}` param →
    `dispatch` sends `stream:true` + consumes via the parser when the response is
    `text/event-stream`, re-emitting each delta via `onToken`; a streaming-requested
    provider that returns JSON falls back to the unchanged JSON parse (provider-
    agnostic). Non-streaming path byte-identical (no `stream` key). 3 tests. Parser is
    now CONSUMED (not dormant). Threading `onToken` up through `groundedAnswerOverScope`
    → the runner is P1.2.
- [x] **P1.1** Content negotiation on `POST /api/chat/messages`: BOTH branches drive the
  SAME runner (one generation path, persist once). `Accept: text/event-stream` → stream;
  else run to completion → JSON.
  - ↳ DONE: the route branches on `Accept`; both create a runner via the per-app
    `TurnRegistry`. JSON awaits `runner.completion` (surfacing a `ChatHandlerError` as
    today's status); SSE pumps. The streaming-sink is wired only on the SSE branch, so
    the JSON branch's UPSTREAM LLM call is byte-identical (test asserts no `stream:true`).
    Tests: SSE returns `text/event-stream` + meta/token/envelope; JSON unchanged + same
    envelope; persists once. 980 middleware green.
- [ ] **P1.2** `TurnRunner` that drives the existing grounded path but EMITS
  `meta`/`activity`/`token`/`envelope`/`error` events (monotonic `seq`) to an
  append-only buffer, and performs the existing MySQL persistence on completion.
  Keyed by a CLIENT-supplied `turnKey` scoped to the session (`Map<(sessionId,
  turnKey), runner>`) — idempotent: a re-POST with a known key ATTACHES, never starts
  a duplicate generation/persist. Test: frame order + ids; the `envelope` frame equals
  the non-streaming `ChatReply` byte-for-byte; `activity` frames mirror `toolActivity[]`;
  a duplicate POST with the same `turnKey` does NOT create a second turn/message.
  - ↳ DONE (event buffer): `turnEventBuffer.ts` `TurnEventBuffer` — seq-stamped
    append; `read(afterSeq)` replays then follows live frames until `markDone()`;
    BOUNDED (`maxEvents`) dropping oldest `token`s but never structural frames;
    no-missed-wakeup waiter. 5 tests. This is the resume + backpressure core the
    runner + pump build on.
  - ↳ DONE (runner + registry): `turnRunner.ts` — `TurnRunner` runs generation
    DECOUPLED from the connection (starts in ctor; a disconnect never aborts it),
    sets the ambient `turnStreamContext` sink (via `streamSink.ts` AsyncLocalStorage,
    so `callGroundedLlm` 5 layers down streams with NO threaded params), brackets
    frames `meta` … `envelope`/`error`, and lets the `generate` thunk own the single
    MySQL write. `TurnRegistry` keys by `(chatSessionId, turnKey)` → idempotent attach
    + session isolation; retains a done runner briefly for late replay. The
    `callGroundedLlm` `stream` arg now resolves `explicit ?? ambient store`, with a
    live `onActivity` at the tool-exec site. 4 runner tests + 3 dispatch + route tests.
- [x] **P1.3** Connection-as-subscriber: SSE writer that subscribes to a runner buffer
  from `Last-Event-ID` and writes `id:`/`event:`/`data:` frames, honoring `res.write()`
  backpressure (`once(res,"drain")`). Streaming headers set (`text/event-stream`,
  `no-cache, no-transform`, `keep-alive`, `X-Accel-Buffering: no`).
  - ↳ DONE: pump in the route; full happy-path + idempotent-replay tested. (Periodic
    heartbeat is P2.3; the subscribe-from-Last-Event-ID seam is in place for P2.2.)

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
- [x] **P3.1** Streaming `sendChatMessage` variant: generate a `turnKey` (idempotency
  key) on the initiating POST; POST `Accept: text/event-stream`,
  `response.body.getReader()`, SSE frame parser → dispatch token/activity/envelope/
  error. JSON variant retained.
  - ↳ DONE: `sseFrames.ts` `readSseFrames()` (id/event/data blocks, split-frame-safe,
    skips heartbeats) + `streamChatMessage()` in `chatSessions.ts` (same ensure +
    reply-validate + 404-invalidation as the JSON path; client `turnKey`; fires
    onToken/onActivity/onMeta; returns the same `SendChatMessageResult` from the
    `envelope` frame; throws a ChatApiError on an `error` frame). 2 tests; app 1752
    green; tsc clean. Consumed by P4 (the chat send path).
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
