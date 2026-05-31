# Spec Delta — chat-routing

## MODIFIED Requirements

### Requirement: Multi-bucket pivots SHALL resolve via a cached ensureBucketGroup helper

The middleware SHALL expose `ensureBucketGroup(bucketIds[]) → groupId`
that, on first call for a given sorted bucket-id list, creates a
GroundX Group via Partner API `POST /v1/groups` with a deterministic
name AND caches the resulting groupId for subsequent calls. The chat
path SHALL route multi-bucket scopes via the returned `{kind: "group",
groupId}`.

The "held pending an upstream caller" caveat from the original
requirement is dropped — CF-19 ships the helper AND wires
`deriveRagContentScope` to use it, so an entity carrying
`bucketIds.length > 1` produces a `group`-shaped scope automatically.

The cache MUST be in-memory only for v1; cold-start re-issuance is
acceptable because the GroundX API treats group creation as
idempotent on the deterministic name.

#### Scenario: First multi-bucket pivot creates and caches a Group

- **GIVEN** an entity carrying `bucketIds: [B1, B2]`
- **WHEN** the chat path receives a turn scoped to it for the first time
- **THEN** `ensureBucketGroup([B1, B2])` issues `POST /v1/groups` once
- **AND** the returned `groupId` is cached against the sorted-id key
- **AND** a second turn with the same `[B1, B2]` retrieves the cached id without a second POST
- **AND** `chatHandler` routes the search via `{kind: "group", groupId}`

#### Scenario: Single-bucket scopes stay single-bucket

- **GIVEN** an entity carrying `bucketIds: [B1]`
- **WHEN** the chat path receives a turn scoped to it
- **THEN** `deriveRagContentScope` returns `{kind: "bucket", bucketId: B1}`
- **AND** `ensureBucketGroup` is NOT called.

#### Scenario: Cold start re-issues POST /v1/groups idempotently

- **GIVEN** a cached `(sortedIds → groupId)` mapping that was lost to
  a process restart
- **WHEN** the first post-restart turn with the same `bucketIds` arrives
- **THEN** the helper issues `POST /v1/groups` again with the same
  deterministic name
- **AND** the GroundX API returns the EXISTING group's id (idempotent
  on name)
- **AND** the helper caches the id and subsequent calls hit the cache.
