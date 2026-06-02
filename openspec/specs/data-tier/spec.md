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

### Requirement: App "projects" + RBAC grants SHALL be the only net-new MySQL tables, never duplicating GroundX-owned concepts

The app SHALL persist a `projects` table (the WF-07 filter-value grouping of
documents within a bucket) and a `project_grants` table (the RBAC/ACL graph over
those projects) in MySQL, and SHALL NOT create MySQL tables that mirror
GroundX-owned concepts (customer identity, buckets, groups, documents, Partner
Projects, workflows). A customer is referenced by its GroundX **username**
(consistent with the existing `groundx_username` columns); a grant `principal`
is `public` or a `user` (that username). Team/org (`account`) grouping of
multiple customers is out of scope until a real consumer exists (earn-the-axis),
so `principal_type` is `public | user` only.

#### Scenario: A project carries an owner and grants, referencing GroundX usernames

- **GIVEN** a `projects` row `{project_id:"proj_x", bucket_id, owner_username}`
  and a `project_grants` row `{project_id:"proj_x", principal_type:"user",
  principal_username:<username>, role:"owner"}`
- **WHEN** the repository is inspected
- **THEN** no MySQL table stores a copy of the GroundX customer, bucket, or
  document record — only the app-owned `project_id` ↔ `bucket_id` ↔
  `owner_username` references and the grant rows

### Requirement: ContentScope SHALL translate to a GroundX search filter intersected with the caller's authorized projects

Every RAG/search/report query SHALL be built from a shared `ContentScope` whose
`filter` carries app organizational fields (e.g. `projectId`), and the middleware
SHALL compile it to a GroundX search filter composed (`$and`) with an RBAC filter
derived from the caller's grants — `{projectId: {$in: authorizedProjectIds(caller)}}`
— so a caller can never read a project they hold no grant on. RBAC resolution
SHALL be server-side only; the frontend SHALL NOT receive the grant graph and
SHALL build only a `ContentScope`.

#### Scenario: Cross-user isolation through the filter

- **GIVEN** `proj_a` granted `user/owner` to username A and a document in it
  stamped `{projectId:"proj_a"}`
- **WHEN** username B (no grant on `proj_a`) issues a chat/search whose scope
  requests `proj_a`
- **THEN** `compileRagFilter` intersects B's authorized set (which excludes
  `proj_a`) and the search returns no documents from `proj_a`

#### Scenario: Public sample reachable by everyone

- **GIVEN** the sample project with a `project_grants(public, viewer)` row and its
  doc stamped `{projectId: proj_sample, workflow_id}`
- **WHEN** an anonymous onboarding caller asks "the total amount due"
- **THEN** `authorizedProjectIds` includes `proj_sample`, the compiled filter
  `{projectId: proj_sample}` matches the doc, and the answer is grounded with a
  citation

### Requirement: Every sample document's GroundX filter SHALL carry the project id, stamped reproducibly by the seed

The seed (`scripts/seed-bucket.ts`) SHALL stamp `filter.projectId` — the real
`proj_<uuid>` resolved from the scenario via `SAMPLE_PROJECT_ID_BY_SCENARIO`
(matching `produceEntityScope`, one source of truth) — on every sample document,
on ingest AND by reconciling already-seeded docs, so the scope→GroundX-filter
path matches without a manual `document_update`. (Flattening the filter — moving
the scenario `manifest`/`scenarioId` app-side so the GroundX filter becomes just
`{projectId, workflow_id}` — is the tracked follow-up
`2026-06-02-flatten-document-filter`; until then the projectId is added
ADDITIVELY alongside the existing manifest the scenario registry still reads.)

#### Scenario: Seeded sample doc's filter carries the matchable project id

- **GIVEN** the seed runs against the samples bucket
- **WHEN** a sample document is stamped
- **THEN** its GroundX `filter.projectId` is the scenario's real `proj_<uuid>`,
  and `search_content(filter:{projectId:"proj_<uuid>"})` returns that document

### Requirement: The GroundX document filter SHALL hold no app/UI metadata; scenarios SHALL be sourced app-side

The GroundX document `filter` SHALL carry only GroundX-matchable scoping keys —
`{ projectId, workflow_id }` (flat) — and SHALL NOT store the scenario
`manifest`/`scenarioId`/`kind` blob. The onboarding scenario registry SHALL
build its `ScenarioConfig[]` from the app-owned scenario JSON configs (manifests)
and resolve each scenario's documents from the bucket by matching
`filter.projectId`, NOT by reading scenario metadata off the document filter. A
single `DocumentFilter` type + `stampDocumentFilter` helper (middleware-side; not
added to `@groundx/shared` without a frontend consumer) SHALL be the one way the
seed (and BYO upload) stamps the filter.

#### Scenario: Flat filter + app-sourced registry

- **GIVEN** the seeded sample document
- **WHEN** the seed stamps its filter and the registry lists scenarios
- **THEN** the doc's GroundX `filter` is `{projectId, workflow_id}` with no
  `manifest`/`scenarioId`/`kind`, the onboarding picker still lists the scenario
  (manifest read from the JSON config), and `search_content(filter:{projectId})`
  returns the document

### Requirement: Superseded persistence tables SHALL be dropped only after a soak and zero remaining readers/writers

A superseded persistence table SHALL be dropped only after its replacement has soaked one full
production release AND a code sweep shows zero readers/writers of the superseded table remain. The
drop SHALL be coupled with the removal of any boot-time copy-migration that reads the superseded
table and any now-orphan `CREATE TABLE` for it, in the same change, so that `createSchema()` and
startup keep succeeding after the table is gone. A migration test SHALL confirm a fresh boot +
`createSchema()` succeed with the table absent.

#### Scenario: A superseded table is dropped after it has soaked one release

- **GIVEN** the `extraction_schemas` table has been superseded by `templates`
- **AND** the `templates` migration has been live in production for one full release
- **AND** a code sweep shows no non-test reader/writer of `extraction_schemas` remains
- **WHEN** this change drops `extraction_schemas`
- **THEN** the same change removes the boot copy-migration `INSERT…SELECT … FROM extraction_schemas`
- **AND** removes the now-orphan `CREATE TABLE IF NOT EXISTS extraction_schemas`

#### Scenario: A fresh boot succeeds with the dropped table gone

- **GIVEN** a fresh MySQL database with no `extraction_schemas` table
- **WHEN** the middleware boots and runs `createSchema()`
- **THEN** `createSchema()` completes without error
- **AND** the emitted DDL contains no `CREATE TABLE IF NOT EXISTS extraction_schemas`
- **AND** no copy-migration reads `extraction_schemas`

#### Scenario: The drop is blocked until both gates clear

- **GIVEN** either the `templates` migration has NOT yet soaked one production release
- **OR** the sequencing audit (`2026-05-31-e2e-experience-audit`) has NOT yet passed
- **WHEN** the drop is considered
- **THEN** the drop SHALL NOT proceed until both the soak gate and the audit gate have cleared

