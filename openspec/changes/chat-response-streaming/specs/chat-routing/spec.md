# Spec Delta — chat-routing

## MODIFIED Requirements

### Requirement: Chat SHALL support streaming responses

The chat surface SHALL render the assistant's reply token-by-token rather than waiting
for the full response, over the EXISTING `POST /api/chat/messages` endpoint via content
negotiation: a request with `Accept: text/event-stream` receives an SSE-framed stream;
any other request receives the existing single JSON envelope UNCHANGED (back-compat).

The streaming path SHALL emit SSE frames each carrying a monotonic `id` (sequence
number): a `meta` frame (`turnId`, `messageId`) first; `activity` frames (one per
server-executed tool); `token` frames (answer-text deltas); a terminal `envelope`
frame carrying the full existing `ChatReply` (citations, suggestedActions,
proposedSchemaField, intents, toolFailures, toolActivity); or a terminal `error` frame.
The streaming path MUST preserve ALL existing reply envelope fields once streaming
completes — the `envelope` frame is the existing `ChatReply` shape, unchanged.

Generation SHALL be DECOUPLED from the connection: a per-turn runner generates and
persists the message to the repository independently, so a client disconnect does NOT
abort or lose the turn. A SUPERSEDING new turn for the same session SHALL cooperatively
cancel the prior runner.

The streaming response SHALL set headers that defeat proxy buffering and idle timeouts
(`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`)
and SHALL emit a periodic heartbeat so intermediaries do not close an idle stream.
The server SHALL apply backpressure (a bounded per-turn event buffer; generation is
never blocked by a slow or absent reader).

The turn SHALL be identified by a CLIENT-supplied idempotency key on the initiating
request (not a server-minted id), so the client can always reconnect — even if the
`meta` frame never arrived — and so a re-request NEVER creates a duplicate turn or a
duplicate persisted message. The runner is keyed by `(session, turnKey)`; a re-request
with a known key attaches to the existing runner rather than starting a new generation.

Reconnect/resume SHALL be supported: a client re-request carrying the same turn key and
`Last-Event-ID` replays buffered events after that sequence from the in-memory per-turn
buffer when the runner is still on the serving instance; otherwise the server SHALL
deliver the persisted final message as a single `envelope` frame. Correctness (the final
answer) is guaranteed by persistence; token-level live resume is best-effort.

Resume SHALL be authorized: the server SHALL serve a turn's stream only to the SAME
authenticated session that owns the turn. A request for a turn key owned by a different
session SHALL be refused (no cross-session resume).

Backpressure SHALL NOT block generation: the runner appends events to a bounded buffer
(drop-oldest `token` on overflow); a SEPARATE per-connection pump drains the buffer to
the socket honoring write backpressure. A slow or absent reader never stalls generation.

#### Scenario: Long answer streams token-by-token

- **GIVEN** a chat turn that would return a long answer (>500 tokens)
- **WHEN** the user sends the turn with `Accept: text/event-stream`
- **THEN** the answer SHALL render in the chat scroll token-by-token within ~30ms of each token arriving
- **AND** the full envelope (citations, suggestedActions, proposedSchemaField) lands as the terminal `envelope` frame on completion

#### Scenario: Non-streaming request still gets the JSON envelope

- **GIVEN** a chat POST WITHOUT `Accept: text/event-stream`
- **WHEN** the chat router handles it
- **THEN** the response is the existing single JSON `ChatReply` envelope, unchanged
- **AND** no SSE framing is applied (every existing consumer/test keeps working)

#### Scenario: Client disconnect does not lose the turn

- **GIVEN** a streaming turn whose client connection drops mid-generation
- **WHEN** the runner continues
- **THEN** the turn completes and the assistant message is persisted to the repository
- **AND** a subsequent fetch of the session messages returns the completed answer

#### Scenario: Reconnect replays missed events, else delivers the final message

- **GIVEN** a streaming turn the client was consuming up to sequence N
- **WHEN** the client re-requests with `Last-Event-ID: N` and the runner+buffer are still on the serving instance
- **THEN** only events after N are sent, continuing the stream
- **GIVEN** instead the runner is no longer on the serving instance (different replica or expired buffer)
- **WHEN** the client re-requests with `Last-Event-ID: N`
- **THEN** the server delivers the persisted final message as a single `envelope` frame and closes

#### Scenario: A reconnect with the same turn key does not duplicate the turn

- **GIVEN** a streaming turn initiated with client turn key K whose connection dropped
- **WHEN** the client re-requests with the SAME turn key K
- **THEN** the server attaches to the existing runner (or its persisted result) for K
- **AND** no second generation runs and no duplicate assistant message is persisted

#### Scenario: A turn key owned by another session is refused

- **GIVEN** a turn keyed to session A
- **WHEN** a request from a DIFFERENT authenticated session presents that turn key
- **THEN** the server refuses (no stream, no replay) — turns resume only within their owning session

## ADDED Requirements

### Requirement: The chat stream SHALL surface in-progress server-tool activity

The chat stream SHALL emit a live `activity` frame as each server-executed tool (e.g. `lookup_groundx_docs`, `search_documents`, `fetch_document_fields`) runs mid-turn, derived from the SAME per-call records that ship as `reply.toolActivity[]` in the non-streaming envelope — there SHALL NOT be a second activity source. The completed reply's `envelope` frame SHALL still carry the equivalent `toolActivity[]` entries.

#### Scenario: Live indicator during a mid-answer tool call

- **GIVEN** a streaming chat turn in which the model calls a server-executed tool
- **WHEN** the tool executes
- **THEN** the stream emits the tool's `activity` frame (e.g. "Checked GroundX docs") BEFORE the subsequent answer tokens
- **AND** the completed reply's `envelope` carries the same entry in `toolActivity[]`
