# Spec Delta — chat-routing (per-entity RAG scope SHALL round-trip)

## ADDED Requirements

### Requirement: Per-entity RAG scope SHALL be persisted by a producer and read back, never read-only

An entity's RAG `ContentScope` (its target `documentIds` / `bucketId` / `groupId` / `projectIds`) SHALL
be persisted to `chat_session_entities` by a producer when the target content is known, and read back by
`deriveRagContentScope` to build the per-turn search scope. A scope column that is read SHALL have a
non-test writer; any column that cannot be produced SHALL be removed (column + read site), not left
read-only. When no per-entity scope is resolvable, the fallback SHALL be explicit, not the silent
side effect of perpetually-NULL columns.

#### Scenario: A scoped entity searches its own content, not the fallback bucket

- **GIVEN** an entity whose target is a known document set (or bucket / group / project filter)
- **WHEN** the entity is persisted and a chat turn runs
- **THEN** `deriveRagContentScope` resolves the `ContentScope` to that target
- **AND** the RAG search targets it (NOT the env-samples bucket fallback).

#### Scenario: No read-only scope columns survive

- **GIVEN** the `chat_session_entities` scope columns (`documentIdsJson`, `groupId`, `bucketId`, `projectIdsJson`)
- **WHEN** the round-trip is wired
- **THEN** each column read by `deriveRagContentScope` has at least one non-test writer
- **AND** any column with no producer is dropped (column + read site), per the no-dead-column rule.
