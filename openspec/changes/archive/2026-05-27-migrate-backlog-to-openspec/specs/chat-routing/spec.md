# Spec Delta — chat-routing

Migrated from `backlog.md` Epic CF (active rows only). Closed CF rows
(CF-01..09, 13, 15..18) are dropped — git history is the record.

## ADDED Requirements

### Requirement: Multi-bucket pivots SHALL resolve via a cached ensureBucketGroup helper

The middleware SHALL expose `ensureBucketGroup(bucketIds[]) → groupId`
that, on first call for a given sorted bucket-id list, creates a
GroundX Group via Partner API `POST /v1/groups` with a deterministic
name AND caches the resulting groupId for subsequent calls. The chat
path SHALL route multi-bucket scopes via the returned `{kind: "group",
groupId}`. This requirement is held pending an upstream caller that
actually emits multi-bucket scopes (UI-05 SteadyShell or a multi-
bucket project view); no user-visible test exists until then.

#### Scenario: First multi-bucket pivot creates and caches a Group

- **GIVEN** an entity carrying `bucketIds: [B1, B2]`
- **WHEN** the chat path receives a turn scoped to it for the first time
- **THEN** `ensureBucketGroup([B1, B2])` issues `POST /v1/groups`
- **AND** the returned `groupId` is cached against the sorted-id key
- **AND** a second turn with the same `[B1, B2]` retrieves the cached id without a second POST
- **AND** `chatHandler` routes the search via `{kind: "group", groupId}`

### Requirement: Compression SHALL run off the request hot path

The chat handler SHALL NOT block the user's POST on the compression
pass. Compression MUST run via either a job queue + background worker
returning 202/poll OR via a "pending" flag on the session with eventual
in-band resolution. Either pattern is acceptable; both keep P95 latency
of the chat POST flat regardless of compression workload.

#### Scenario: User POST near compression threshold returns promptly

- **GIVEN** a chat session at 95% of the compression threshold
- **WHEN** the user POSTs a new message
- **THEN** the POST returns 200 (or 202) promptly (P95 < 800ms)
- **AND** the compression pass completes asynchronously
- **AND** the next POST sees the new active summary

### Requirement: Chat SHALL support streaming responses

The chat surface SHALL render the assistant's reply token-by-token via
SSE or fetch-stream rather than waiting for the full response. The
streaming path MUST preserve all existing reply envelope fields
(citations, suggestedActions, proposedSchemaField) once streaming
completes.

#### Scenario: Long answer streams token-by-token

- **GIVEN** a chat turn that would return a long answer (>500 tokens)
- **WHEN** the user sends the turn
- **THEN** the answer SHALL render in the chat scroll token-by-token within ~30ms of each token arriving
- **AND** the full envelope (citations, suggestedActions, proposedSchemaField) lands on completion

### Requirement: routeChat SHALL invoke tool calls when the LLM emits them

The chat router SHALL execute tool calls emitted by the LLM and surface
the resulting tool-call records on the `ChatRouterResponse.tools` array.
The tool registry sources from `AgentToolBus` (see `agent-tools`
capability) and includes the named tools `search_groundx`,
`show_understand`, `show_extraction`, `show_field_citation`,
`pin_to_report`, `propose_schema_field`, `propose_report_section`.

#### Scenario: Show-extraction tool call surfaces in the reply

- **GIVEN** a chat turn whose answer triggers `show_extraction`
- **WHEN** routeChat finishes
- **THEN** `reply.tools` contains a `{name: "show_extraction", arguments: {…}}` entry
- **AND** the canvas advances to F3/Extract with the supplied arguments

### Requirement: DB pool SHALL be sized for batch reads under chat load

The MySQL pool size SHALL be ≥10 connections AND the chat handler SHALL
batch its 5–8 sequential per-post reads into a single round-trip where
the repository layer permits it. Load tests SHALL assert P99 < 1s with
50 concurrent posts under mocked LLM + GroundX backends.

#### Scenario: 50 concurrent chat POSTs stay under P99 1s

- **GIVEN** a load test driving 50 concurrent `/api/chat/messages` POSTs against a mocked LLM + GroundX
- **WHEN** the test runs to completion
- **THEN** P99 latency stays below 1000ms
- **AND** no pool-exhaustion errors are logged
