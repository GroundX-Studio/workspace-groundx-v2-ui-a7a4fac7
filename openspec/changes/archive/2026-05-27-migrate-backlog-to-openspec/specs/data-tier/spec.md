# Spec Delta — data-tier

Migrated from `backlog.md` Epic DT (active rows only).

## ADDED Requirements

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
