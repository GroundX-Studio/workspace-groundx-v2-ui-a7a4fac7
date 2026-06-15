# Design — chat-response-streaming

## Decisions (brainstormed 2026-06-15)

1. **Scope:** production-hardened — reconnect/resume, heartbeats, backpressure.
2. **Transport:** `fetch` + `ReadableStream`, SSE-framed over the response body of the
   existing `POST /api/chat/messages` (NOT native `EventSource` — that is GET-only and
   awkward for the POST body + auth; NOT WebSocket — overkill + sticky-session cost).
3. **Resume model:** best-effort in-memory replay + MySQL-guaranteed final message
   (no Redis). Generation is decoupled from the connection.

## Architecture

### Content negotiation (back-compat is non-negotiable)
`POST /api/chat/messages` branches on `Accept`. BOTH branches drive the SAME generation
engine (the `TurnRunner`, below) — there is ONE generation path, never a fork, and
persistence happens exactly ONCE (in the runner):
- `text/event-stream` → subscribe a pump to the runner; stream frames as emitted.
- anything else → run the runner to completion and return its assembled `ChatReply` as
  the single JSON response. The JSON CONTRACT is unchanged (every current test/caller
  keeps working); the internal code now routes through the runner (no second generation
  path, no double DB write).

### Upstream LLM streaming (what makes `token` frames real)
`token` frames require the UPSTREAM LLM completion to stream — otherwise "token-by-token"
would just be post-hoc chunking of a finished answer. The LLM client gains a streaming
mode (`stream: true`) that parses the provider's TEXT deltas AND TOOL-CALL deltas. The
runner consumes that stream: it re-emits each text delta as a `token` frame and
ACCUMULATES streamed tool-call deltas until a call is complete, then executes the tool
(emitting an `activity` frame) and continues the loop's next round. So `token` and
`activity` frames INTERLEAVE across rounds (prose → tool → prose) — NOT a fixed
meta→activity→token order. **Graceful fallback:** if a configured provider/model can't
stream, the runner emits each round's full text as a single `token` frame — transport,
resume, activity, and envelope all still work, just without intra-round token-by-token.
The foundation stays provider-agnostic.

### Decoupled turn runner
A `TurnRunner` owns one turn's generation, independent of any HTTP connection:
- Created on the initiating POST; keyed by a **client-supplied** idempotency key
  `turnKey` scoped to the session — `Map<(sessionId, turnKey), TurnRunner>` on the
  instance. CLIENT-supplied (not server-minted) so the client can reconnect even if
  the `meta` frame never arrived, and so a re-POST with a known key ATTACHES to the
  existing runner instead of starting a duplicate generation / duplicate DB write
  (idempotency). `meta` echoes the key for confirmation.
- **Authorization:** a runner is bound to its owning authenticated session. Any
  attach/resume request is served ONLY to that session; a `turnKey` presented by a
  different session is refused (no cross-session resume — IDOR guard).
- Drives the existing `handleChatMessage` / grounded loop, but instead of returning a
  single envelope it EMITS events (`meta`, `activity`, `token`, `envelope`, `error`)
  to an internal append-only buffer, each stamped with a monotonic `seq`.
- On completion it performs the existing MySQL message write (unchanged persistence),
  marks itself `done`, and is retained for a short TTL (e.g. 60s) for late reconnects,
  then evicted.
- A client disconnect does NOT stop the runner (that's the decoupling). A *superseding*
  new turn for the same session DOES cancel it (cooperative `AbortController` on the
  LLM call) — abandoned compute is wasteful. A superseded turn's PARTIAL output is
  DISCARDED, not persisted — the user moved on; only completed turns persist their
  assistant message. (The USER message still persists at turn start, as today, so a
  cancelled turn never loses the user's prompt.)

### The connection is just a subscriber (the pump)
The POST response handler verifies the caller's session owns `turnKey` (else 403),
then attaches a per-connection PUMP that drains the runner's buffer to the socket:
1. Sets streaming headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`,
   `Connection: keep-alive`, `X-Accel-Buffering: no`. Ingress-agnostic: heartbeats (3)
   handle idle-timeout on ANY ingress (ALB/nginx); `X-Accel-Buffering` is the
   belt-and-suspenders for an nginx ingress (a no-op, harmless, on an ALB).
2. Subscribes from `Last-Event-ID + 1` (0 if absent): replays buffered events, then
   pumps live ones as they're appended. **The pump — not the runner — owns socket
   backpressure:** it awaits `res.write()` drain. The runner only ever appends to the
   bounded buffer (drop-oldest `token` on overflow), so a slow/absent reader never
   stalls generation.
3. Emits a heartbeat comment (`:\n\n`) every ~15s (under the typical ~60s idle timeout).
4. On `res` close, the pump unsubscribes — but leaves the runner running.

### Wire protocol (SSE frames)
```
id: <seq>
event: meta | activity | token | envelope | error
data: <json>

```
- `meta` `{ turnKey, messageId }` — first frame; echoes the client's `turnKey` (the
  client already holds it from the initiating POST, so reconnect works even if `meta`
  is missed).
- `activity` `{ name, label }` — one per server-tool execution (the live indicator),
  the SAME records that land in `reply.toolActivity[]`.
- `token` `{ delta }` — answer text increment.
- `envelope` `{ ...ChatReply }` — the full existing envelope (citations,
  suggestedActions, proposedSchemaField, intents, toolFailures, toolActivity) on done.
- `error` `{ code }` — terminal failure (the turn still persisted whatever it had).
- heartbeat — SSE comment line, no `event:`, ignored by the parser.

### Reconnect / resume
Client re-POSTs the SAME turn key with header `Last-Event-ID: <seq>` (the `turnKey` it
generated on the initiating POST); the server verifies the session owns the key first:
- **Runner still on this instance** (live or within TTL) → replay events after `seq`,
  continue if still generating, or send the final `envelope` if done.
- **Runner not here** (different replica, or TTL expired) → load the persisted final
  message from MySQL and send it as a single `envelope` frame, then close. The user
  sees the complete answer (just not token-by-token for the dropped span). **Correctness
  is guaranteed by persistence; live resume is the best-effort optimization.**

### Backpressure (two distinct layers — don't conflate)
- **Socket layer (the pump):** the per-connection pump honors Node `res.write()`
  backpressure (await `drain` when it returns false). This throttles only THAT
  connection, never the runner.
- **Generation layer (the runner):** the runner appends to a BOUNDED per-turn buffer
  (cap by event count / bytes). On overflow it drops the OLDEST `token` events (never
  `meta`/`activity`/`envelope`/`error`). Generation is therefore never blocked by a
  slow/absent reader (it only ever touches the bounded buffer). A reconnect past the
  dropped window falls back to the final-from-DB path.

## Client

- `sendChatMessage` gains a streaming variant: POST with `Accept: text/event-stream`,
  read `response.body.getReader()`, parse SSE frames, and dispatch:
  `token`→append to the streaming message, `activity`→live indicator, `envelope`→finalize
  (citations/actions via the existing consumers), `error`→error state.
- The JSON `sendChatMessage` is retained for non-streaming callers/tests.
- `AbortController`: abort on navigate / new turn (client-side); a new turn also tells
  the server to supersede-cancel the prior runner.
- Reconnect: on a recoverable stream error, re-POST with the last seen `seq` as
  `Last-Event-ID`, bounded retries with backoff; on exhaustion, fetch the saved message.

## React rendering

- Incremental tokens append to the in-flight assistant turn in the chat scroll.
- The live activity indicator reuses the existing `ThinkingStream` surface (now driven
  by real `activity` events instead of a timed animation).
- The `envelope` frame applies citations/suggestedActions through the SAME consumers as
  the non-streaming path — no new rendering for the final state.

## Why not the alternatives
- **EventSource:** GET-only; the chat turn is a POST with a body + cookie auth. Would
  require a two-step POST-then-GET dance and a server-side attach-by-id anyway — the
  fetch-stream path gets POST ergonomics with the same resume mechanics.
- **WebSocket:** bidirectional, but the turn is one-directional server→client; adds WS
  upgrade handling + sticky sessions on EKS for no benefit here.
- **Redis buffer:** rejected — best-effort in-memory + MySQL-final keeps correctness
  without new infra (the explicit cross-replica decision).

## Testing strategy (failing-test-first per phase)
- Content negotiation: `Accept: text/event-stream` → SSE; else JSON (existing suites
  stay green — the back-compat guard).
- Frame order + ids: `meta` first, then `token`/`activity` INTERLEAVED across loop
  rounds (prose → tool → prose), `envelope` last; monotonic `seq` throughout.
- Decoupled generation: simulate a client disconnect mid-turn → the runner still
  completes and persists (the saved message exists).
- Reconnect replay: re-subscribe with `Last-Event-ID` → only events after it are sent.
- Reconnect fallback: runner absent → a single `envelope` from the persisted message.
- Heartbeat emitted on an idle stream; streaming headers present.
- Backpressure: overflow drops oldest `token`s, never the `envelope`.
- Supersede-cancel: a new turn for the session cancels the prior runner.
- Client SSE parser: frame parsing, dispatch, reconnect-with-Last-Event-ID, abort.
- React: incremental render + live activity + envelope-on-completion.
- Live (preview): a real streamed turn renders token-by-token and shows the live
  "Checked GroundX docs" indicator mid-answer.

## Risk / sequencing
Largest change in the cluster — touches the chat transport end-to-end. `tasks.md`
phases it: (P1) server SSE + runner + content-negotiation; (P2) resume/heartbeat/
backpressure; (P3) client reader + reconnect; (P4) React rendering + live indicator;
(P5) live verify + supersede the stub. The decoupled-generation lifecycle (generation
outliving the request) is the riskiest seam; the in-memory buffer + DB-final fallback
keeps it correct without new infra.
