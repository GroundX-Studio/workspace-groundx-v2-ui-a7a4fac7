# Characterize the read-but-unwritten per-entity RAG scope columns (defer the steady-mode producer)

## Why

The 2026-05-30 philosophy sweep flagged this as a "live wrong-bucket bug." Adversarial verification
against the code shows that framing is **overstated**. The behavior is **by design** for the only path
that exists today (anon onboarding), not a live correctness bug:

- `deriveRagContentScope` (`middleware/src/services/chatHandler.ts:528`) reads an entity's
  `documentIdsJson` / `groupId` / `bucketId` / `projectIdsJson` from `chat_session_entities`. When all
  four are null it **intentionally** falls through to the env samples bucket — the documented
  onboarding default (`chatHandler.ts:384-389`: "we land here on either a samples-bucket scope (the
  env-provided default for anon onboarding) or 'unknown'").
- The type contract says the same thing (`middleware/src/types.ts:119-122`): "a fresh anon onboarding
  entity has none of them and falls through to the env samples bucket."
- The only writer (`middleware/src/app.ts:803-810`) deliberately preserves the four scope columns as
  server-only (`existing?.X ?? null`) and never lets a client PUT set them.

So in the current product (anon onboarding over a shared samples bucket) the samples-bucket fallback is
the **correct** scope, not a wrong corpus. There is no user-visible mis-grounding today.

The **real** gap is forward-looking: the future **steady-mode / BYO** path needs an entity→scope
producer that writes a customer's `bucketId` / `documentIds` / `groupId` / `projectIds` into those
columns. That producer **does not exist yet**, and `deriveRagContentScope` is the matching reader waiting
for it. This is a read-but-unwritten seam, not a live defect.

## What changes

This is a deliberately thin slice: lock the truth in code + docs now, defer the producer.

- **Characterization test (Phase 1):** assert today's behavior — the four `chat_session_entities` scope
  columns are read by `deriveRagContentScope` but written by nothing, so a fresh entity resolves to the
  samples-bucket fallback. Documents the seam so the future producer change has a starting RED.
- **Doc correction:** fix `docs/agents/data-model.md` (line ~100), which wrongly claims "scope+filter
  already persisted" for `chat_session_entities` — it is not; the columns exist and are read but have no
  producer.

We do **not** drop the columns. They are the intended landing site for the steady-mode/BYO producer and
for `cf19`/CF-15, which thread these exact columns into `deriveRagContentScope`. A §9 "drop the
read-only column" move here would conflict with that planned wiring.

## Conformance to core architectural decisions

- **Honest framing (§5):** the proposal states what is actually true (by-design fallback) rather than an
  overstated live-bug narrative.
- **One source of truth:** the future producer will write the same shared `ContentScope` refs the reader
  already consumes; no parallel shape introduced.
- **No orphaned plumbing:** the read-but-unwritten seam is now tracked (this change's test + doc) and the
  real producer is an explicit Deferred item, not dormant code pretending to work.

## Deferred (future)

- **The steady-mode / BYO entity→scope producer.** When the steady-mode / BYO upload path exists, wire a
  producer that persists a customer entity's known scope (`bucketId` / `documentIds` / `groupId` /
  `projectIds`) into the `chat_session_entities` scope columns so `deriveRagContentScope` resolves a real
  customer scope instead of the samples-bucket fallback. Sequence with `cf19`/CF-15 (which resolve a
  multi-bucket scope to a group on the read side) — that change consumes these same columns. A round-trip
  test (write → reload → read → correct scope) belongs to that future change, not this slice.

## Out of scope

- The multi-bucket `ensureBucketGroup` resolve helper — that's `cf19`.
- Broader round-trip / dead-plumbing closeout (viewer_* columns, telemetry columns, intent_log) — folded
  into `core-data-model-hardening`.

## Affected

`middleware/src/services/chatHandler.ts` (`deriveRagContentScope` read — characterization test target),
`docs/agents/data-model.md` (doc correction). Spec: `chat-routing`.
