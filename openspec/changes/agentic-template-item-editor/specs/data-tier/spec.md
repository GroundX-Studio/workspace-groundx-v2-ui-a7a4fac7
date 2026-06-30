## ADDED Requirements

### Requirement: Persist the uncommitted draft Template on the chat-session entity twin
The data tier SHALL persist the uncommitted draft as a `TemplateSaveInput`-shaped object (the resolved draft body — plain JSON, no Map/Set; NOT preview results) on the `chat_session_entities` twin via an additive `JSON NULL` column added through an explicit, idempotent `ALTER TABLE … ADD COLUMN` reconciliation (NOT `CREATE TABLE IF NOT EXISTS`, NOT drop+recreate). The column MUST have a read site on hydrate (round-trip) and MUST be covered by the `persistedColumnPolicy` guard. This is session-draft state, NOT a committed `Template`/`Result`. Preview/extraction results SHALL NOT be persisted.

#### Scenario: Fresh DB provisions the new column
- **WHEN** a fresh database boots
- **THEN** the draft-schema column exists on `chat_session_entities` with no dead columns

#### Scenario: Stale pre-migration table is reconciled additively
- **WHEN** a database predating this change is booted
- **THEN** the column is added via `ALTER TABLE … ADD COLUMN` (not `CREATE TABLE IF NOT EXISTS`, not drop+recreate), and the chat-turn read path works

#### Scenario: Uncommitted draft Template round-trips; previews are not stored
- **WHEN** a draft edit is written for a session and the session is reloaded from DB
- **THEN** the uncommitted draft Template is read back and seeds the working draft, and no preview result is present in the persisted column (no write-only/dead column)
