# Spec Delta — chat-routing (the steady/BYO entity→scope producer)

## ADDED Requirements

### Requirement: A producer SHALL write a known customer entity's RAG scope onto its persisted row

The middleware SHALL persist a customer entity's known target content as `ContentScope` refs
(`bucketId` / `documentIds` / `groupId` / `projectIds`) onto its `chat_session_entities` row when that
target is known (steady-mode active workspace or a completed BYO upload), so that `deriveRagContentScope`
reads a real customer scope instead of the env-samples-bucket fallback. The producer SHALL write the same
shared `@groundx/shared` `ContentScope` refs the reader consumes, with no parallel scope shape.

#### Scenario: A steady-mode customer entity persists and resolves its own bucket

- **GIVEN** a steady-mode entity whose target is a known customer bucket (optionally a project filter)
- **WHEN** the producer runs at the entity-write / upload-complete seam
- **THEN** the entity's `chat_session_entities` row carries the produced scope refs
- **AND** on reload `deriveRagContentScope` resolves the `ContentScope` to that bucket (NOT the env-samples fallback).

#### Scenario: A completed BYO upload persists its document scope

- **GIVEN** a BYO entity whose target is the document(s) just uploaded and ingested
- **WHEN** the producer runs at upload-complete
- **THEN** the entity's row carries the produced `documentIds` (or bucket) refs
- **AND** on reload `deriveRagContentScope` targets those documents.

#### Scenario: Anon onboarding still falls through to the samples bucket

- **GIVEN** a fresh anon onboarding entity with no known customer target
- **WHEN** a chat turn runs
- **THEN** the producer writes no scope refs
- **AND** `deriveRagContentScope` resolves to the env-samples-bucket fallback (the documented onboarding behavior, unchanged).

### Requirement: Every read scope column SHALL have a producer or be dropped

Every `chat_session_entities` scope column read by `deriveRagContentScope` SHALL have at least one
non-test writer after the producer lands, and any column that still has no producer SHALL be dropped —
the column, its read site, and its `ChatSessionEntityRecord` field removed together — so no scope column
is left read-only.

#### Scenario: A column the producer fills is kept and round-trips

- **GIVEN** a scope column the producer now writes
- **WHEN** the no-dead-column drift guard runs
- **THEN** the column has a non-test writer and is retained
- **AND** a write → reload → `deriveRagContentScope` round-trip resolves the correct scope.

#### Scenario: A producerless column is dropped, not left read-only

- **GIVEN** a scope column that still has no producer after this change
- **WHEN** the §9 no-dead-column move runs
- **THEN** the column, its `deriveRagContentScope` read site, and its `ChatSessionEntityRecord` field are removed together
- **AND** the drift guard confirms no read-only scope column survives.
