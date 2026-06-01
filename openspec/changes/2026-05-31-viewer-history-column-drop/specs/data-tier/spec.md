# Spec Delta — data-tier (drop write-NULL-only viewer_* columns)

Behavior-preserving. The three `chat_sessions` `viewer_*_json` columns were
write-NULL-only (full read/write/migration chain existed, but no mutator ever
wrote a non-null value), so dropping them loses no data. This retires the
Phase-1 requirement that authorized the never-wired plumbing and replaces it
with a durable guarantee that persisted columns must have a live reader AND a
live writer or be dropped.

## REMOVED Requirements

### Requirement: chat_sessions row SHALL persist the paired ViewerSession state

**Reason**: The columns this requirement authorized
(`viewer_history_json` / `viewer_overlays_json` / `viewer_workspace_json`) were
never wired to a writer — the app mutators only ever PATCH `activeEntityKey` /
`currentIntent`, so the columns were always NULL on reload. The
"refresh restores the viewer" behavior the requirement described was never
delivered; the plumbing was dead. Per the `tool_calls_json` / `attachments_json`
precedent in `2026-05-31-core-data-followups` §4 #17, the dead columns are
dropped rather than propped up with a speculative writer. If viewer-state
persistence is wanted later, it is its own change, re-adding columns under a
requirement that ships with a live writer + a failing-first round-trip test.

## ADDED Requirements

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
