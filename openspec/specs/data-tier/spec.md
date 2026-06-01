# data-tier Specification

## Purpose

Define the durable contract for app-owned persistence — the MySQL
schema (chat sessions, messages, viewer events, entities, intent log),
the in-memory dev repository that mirrors it for local preview, and
the migration discipline that keeps the two shapes in lockstep.
## Requirements
### Requirement: Migrations SHALL run via a Knex (or equivalent) migrations infrastructure

The middleware SHALL ship migration definitions + a `npm run migrate`
script that applies pending migrations against the configured MySQL
database. The `up` direction MUST be idempotent (re-running a partially-
applied migration recovers); a `down` direction is optional but the
last N migrations SHALL support rollback.

#### Scenario: Migrations apply against a fresh database

- **GIVEN** a fresh MySQL database
- **WHEN** `npm run migrate` is run
- **THEN** every migration applies cleanly and the schema matches
  `mysqlRepository.ts`'s expected DDL

### Requirement: Production deploys SHALL read/write against MySQL primary

The production deploy SHALL set `APP_REPOSITORY_MODE=mysql` and wire
`MYSQL_*` secrets via Helm. The in-memory repository MUST NOT be used
in production. This requirement is BLOCKED on AWS RDS provisioning +
Helm secret wiring (infra, not code).

#### Scenario: Production app reads/writes against MySQL

- **GIVEN** a production deploy with `APP_REPOSITORY_MODE=mysql` and `MYSQL_*` env set
- **WHEN** the app boots and serves the first chat POST
- **THEN** the chat_session, chat_messages, and viewer_events rows
  appear in MySQL — not in any in-memory map

### Requirement: Retention sweep jobs SHALL prune old rows per the durable retention table

A nightly job SHALL delete:

- `chat_messages` AND `chat_summaries` older than 1 year
- `intent_log` rows older than 90 days
- `viewer_events` rows older than 30 days

The retention bounds match `memory/project_database.md`. The job MUST
log its row counts.

#### Scenario: Nightly sweep deletes past-retention rows

- **GIVEN** a `chat_messages` row 366 days old AND a `viewer_events` row 31 days old
- **WHEN** the nightly retention job runs
- **THEN** both rows are deleted
- **AND** the job logs counts per table

### Requirement: Anonymous sessions SHALL apply a compression strategy

Anonymous chat sessions SHALL fold their accumulated messages into a
compression chain so the user's localStorage doesn't blow past its
quota. The system MUST adopt one of: (a) server-side compression for
anon sessions (since anon now has DB rows), OR (b) a localStorage-side
compression for anon-only that mirrors the leaf+meta shape used by
authed sessions.

#### Scenario: Anon session with 200+ messages stays within localStorage budget

- **GIVEN** an anonymous session with 200+ messages
- **WHEN** the user takes a new turn
- **THEN** localStorage stays under the 5MB QuotaExceededError threshold
- **AND** older messages have been folded into a `ConversationSummary`

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

### Requirement: Persisted canvas intents SHALL be validated through the shared schema at the row boundary

The persistence layer SHALL treat the `chat_sessions.current_intent_json` column as untrusted arbitrary JSON. When mapping a row back into a `ChatSessionRecord`, the middleware SHALL validate `current_intent_json` through the single shared `canvasIntentSchema` (`@groundx/shared`) rather than casting the deserialized column blindly. A value that fails validation SHALL be mapped to `null`; a valid value SHALL pass through unchanged. This is the middleware twin of the app-side hydration guard — both ends of the persisted intent boundary derive from the one shared schema, so a corrupt or legacy persisted intent cannot enter either runtime as a typed `CanvasIntent`.

#### Scenario: A malformed persisted intent maps to null in the middleware row mapper

- **GIVEN** a `chat_sessions` row whose `current_intent_json` deserializes to a malformed intent (a string `kind` but missing the variant's required fields, or a `kind` that is not a real discriminant)
- **WHEN** `rowToChatSession` maps the row into a `ChatSessionRecord`
- **THEN** the record's `currentIntent` is `null`
- **AND** every other field of the mapped record is unaffected

#### Scenario: A valid persisted intent round-trips through the row mapper unchanged

- **GIVEN** a `chat_sessions` row whose `current_intent_json` holds a well-formed `{ "kind": "openDocument", "documentId": "util-1", "page": 2 }`
- **WHEN** `rowToChatSession` maps the row
- **THEN** the record's `currentIntent` equals the persisted intent (behavior preserved for valid intents)

### Requirement: Persisted chat_sessions columns SHALL have a live reader and writer or be dropped

Every column on the `chat_sessions` table SHALL have BOTH a live writer (a code
path that writes a non-null value under real app use) AND a live reader (a code
path that reads it back into app/LLM context). A column that is write-only,
read-only, or write-NULL-only — "dead plumbing" — SHALL NOT persist; it SHALL be
dropped. This SHALL be enforced by a dead-column grep guard in
`mysqlRepository.test.ts` (mirroring the `tool_calls_json` / `attachments_json`
guard), so a dropped or never-wired column cannot silently return.

#### Scenario: Dropped viewer columns are absent from the DDL, INSERT, and SELECT

- **GIVEN** the `mysqlRepository` `chat_sessions` DDL, the `upsertChatSession`
  INSERT, and the `listChatSessions` SELECT statements
- **WHEN** the dead-column grep guard runs
- **THEN** none of `viewer_history_json` / `viewer_overlays_json` /
  `viewer_workspace_json` appears in any of those statements
- **AND** the guard fails if any of the three is reintroduced

#### Scenario: A reintroduced write-only column fails the guard

- **GIVEN** a developer adds a new `chat_sessions` column to the DDL + INSERT
  but wires no reader
- **WHEN** the dead-column grep guard runs
- **THEN** the guard fails, naming the dead column, until a live reader is
  wired OR the column is dropped

#### Scenario: Fresh boot and existing-DB upgrade both succeed against the reduced schema

- **GIVEN** the viewer columns have been dropped from the schema
- **WHEN** the middleware boots against a fresh MySQL database
- **THEN** the `chat_sessions` CREATE TABLE applies with no `viewer_*` column
- **AND** when the middleware boots against an older database that still has the
  viewer columns, the boot succeeds without error (no probe or ALTER references
  the dropped columns; a residual column is harmless because nothing writes it)

