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
> Core hardening is already STRUCTURALLY in place from P1.2/P1.3: the runner is
> decoupled (generation starts in the ctor, not tied to the connection), same-instance
> replay works (idempotent re-POST test), and backpressure is real (pump `drain` +
> bounded drop-oldest-token buffer). What remains below is the explicit tests +
> heartbeat emission + from-DB resume fallback + supersede-cancel.
- [x] **P2.1** Decoupled lifecycle.
  - ↳ DONE: runner unit test — generation runs to completion + buffers the envelope
    even when NO connection reads the buffer (a disconnect never stops the turn; the
    generate thunk's persistence still runs).
- [x] **P2.2** Reconnect/resume.
  - ↳ DONE: SAME-INSTANCE replay (idempotent re-POST attaches + replays from the live
    runner) + session isolation (the `(chatSessionId, turnKey)` registry key makes
    cross-session attach structurally impossible) + per-turn buffer TTL eviction.
  - ↳ DONE: FROM-DB fallback — a reconnect (Last-Event-ID present) whose runner is
    gone returns the persisted answer instead of re-generating. Mapping via a NEW
    `chat_turn_index (chat_session_id, turn_key) → message_id` table — a separate
    CREATE-only table (NOT a chat_messages ALTER), because this repo's boot is
    deliberately CREATE-only (no `information_schema`/`ALTER`; test-enforced). The
    route looks it up + streams a single envelope; the handler stamps the index on
    persist. Tests: route from-DB reconnect (no re-generation) + memory-repo lookup
    (session-scoped, miss→null). middleware booted clean against the live RDS.
- [x] **P2.3** Heartbeats + backpressure.
  - ↳ DONE: extracted `streamPump.ts` `pumpFramesToResponse()` — replays from
    Last-Event-ID, emits a `:` heartbeat every 15s while idle (under a ~60s ingress
    idle timeout), awaits socket `drain` on backpressure, ends on done. The route uses
    it. Backpressure's buffer half (drop-oldest-token, never structural) was already
    done + tested in `TurnEventBuffer`. 2 pump tests (heartbeat+resume, drain).
- [x] **P2.4** Supersede-cancel.
  - ↳ DONE: the runner holds an `AbortController` exposed via `abort()`; the ambient
    sink carries `abortSignal` → `callGroundedLlm` passes it to `llmClient.forward`,
    which composes it with the per-call timeout (`fetchWithTimeout`). The registry
    tracks the current runner per session and aborts a still-running prior one when a
    NEW turn (unknown key) arrives — a reconnect (known key) attaches, never
    supersedes. An aborted turn ends in an `error` frame (code `superseded`) and its
    partial output is NEVER persisted (the abort throws before the assistant write).
    Tests: supersede aborts the prior + emits error-not-envelope; reconnect attaches
    without aborting.

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
- [x] **P3.2** Reconnect with `Last-Event-ID` (bounded retries + backoff).
  - ↳ DONE: `streamChatMessage` wraps connect+drain in a retry loop — a silent drop
    (stream ends with no envelope) OR a network throw reconnects with the SAME turnKey
    + `Last-Event-ID: <lastSeq>` (server attaches to the live runner + replays the
    missed frames), bounded by `maxRetries` (default 2) with ×attempt backoff. HTTP
    errors / server `error` frames / aborts are terminal (no retry). An `AbortSignal`
    is plumbed (`opts.signal`). Test: drop-before-envelope → reconnect carries
    Last-Event-ID=2 + same turnKey → tokens from both legs + the envelope resolve.
  - ↳ NOT WIRED (low value): the hook passing an AbortController to abort on
    navigate/new-turn — the runner is decoupled (an un-aborted client stream finishes
    + persists server-side regardless), so there's no harm to leave it; the seam is
    ready. Server supersede-cancel is P2.4 (deferred).

## P4 — React rendering + live indicator
- [x] **P4.1** Incremental token rendering into the in-flight assistant turn.
  - ↳ DONE: `useConversation.send` pushes an empty assistant bubble then calls
    `api.chat.streamChatMessage` with `onToken` (append delta to that turn) +
    `onActivity` (append to its `toolActivity`); on completion it finalizes with the
    cleaned envelope answer + citations/actions/proposal/auto-highlight (unchanged).
    The fake api delegates `streamChatMessage`→`sendChatMessage` so all existing
    consumers stay green. Wired into `realApi.chat`. Test: tokens render incrementally
    (draft visible while the envelope is pending) then finalize; streaming path used,
    not the JSON `sendChatMessage`.
- [x] **P4.2** Live activity indicator + envelope consumers.
  - ↳ DONE: `activity` events append to the in-flight turn's `toolActivity`, rendered
    live by the existing chat-tool-activity annotation; the `envelope` applies
    citations/suggestedActions via the SAME consumers as the JSON path (incl.
    auto-highlight of the primary citation). Test asserts the live activity label
    renders mid-stream.

## P5 — Verify + close out
- [x] **P5.1** Full suites green (existing JSON tests UNCHANGED — back-compat proof);
  production build clean. middleware 980 + app 1753; `tsc` all workspaces clean.
  (`openspec validate --strict` + archive = P5.3.)
- [x] **P5.2** Live verification (preview, real LLM + GroundX, 2026-06-15): the chat POST
  sent `Accept: text/event-stream`; the server responded `200` `Content-Type:
  text/event-stream` `Cache-Control: no-cache, no-transform` `X-Accel-Buffering: no`
  and streamed for 36s; the answer rendered ("Total amount due: $7,613.20" + the 8-meter
  table + 27 citations) with the source auto-opened on the canvas; ZERO console errors.
  (Token-by-token increment is unit-proven in P4.1; the live run proves the SSE
  transport + render end-to-end.)
- [ ] **P5.3** Adversarial review (per phase + whole); archive; the superseded
  `stream-chat-tool-activity` stub is already removed by this change.
