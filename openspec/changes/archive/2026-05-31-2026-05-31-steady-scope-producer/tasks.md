# Tasks — Real steady/BYO entity→scope producer + scope-column drop

> The upstream producer that `entity-rag-scope-roundtrip` Deferred, `cf19` waits on, and single-doc
> viewer flows need. **Build the producer first, THEN drop only the columns that remain producerless.**
> Every scope column read by `deriveRagContentScope` ends this change with a real non-test producer OR is
> dropped (column + read site) — no column stays read-only.
>
> **Execution: → SEQUENTIAL/TDD.** This is one coupled contract (the producer + the columns it fills + the
> reader it feeds). Failing-test-first throughout. Adversarial review gate after each phase, against the
> real code AND the durable `chat-routing` round-trip requirement.

## Phase 0 · Decide the model (gates everything below)

- [x] **INPUT NEEDED → ANSWERED 2026-05-31 — DECISION: build the producer for the existing `sample` EntityKind.** Map `sample` → `{ type: "bucket", filter: { project: <scenarioId> } }` (the demo scope), produced at entity-activate, so the scope columns get a real producer end-to-end. BYO upload is DEFERRED until its upload path lands (not built here). The §9 column-drop (Phase 3) applies ONLY to columns still producerless after this producer. Original question retained below for context:
- [ ] _(answered above)_ Confirm the steady-mode / BYO scope-production model before any producer code:
      **(a)** When does the BYO upload path land, and what does it write — does a completed upload create a
      customer bucket + documents, and is the producer triggered at upload-complete or at entity-activate?
      **(b)** The `EntityKind` → `ContentScope` mapping: which kind maps to `{type:"bucket"}` (steady-mode
      active workspace), `{type:"documents"}` (single uploaded/opened doc), `{type:"group"}` (multi-bucket),
      or `{type:"bucket", filter:{projectId:[…]}}` (project-scoped)? `EntityKind` is currently only
      `"sample"` (`app/src/contexts/EntitySessionStoreContext/types.ts:16`) — which new kinds land here?
      **(c)** Relationship to `cf19`: does the producer write a **multi-bucket list** that `cf19`'s reworked
      `ensureBucketGroup` later resolves to a `groupId`, OR does the producer write `groupId` directly
      (making `cf19` read-side only)? This decides whether `chat_session_entities` needs a multi-bucket
      column at all.
- [x] **UNBLOCK — BYO upload path readiness.** — DONE. BYO upload path does NOT exist yet → BYO producer
      deferred (per Phase 0 decision). The producer is wired at the **entity-write seam**: PUT
      `/api/chat-sessions/:id/entities/:entityKey` (`app.ts`, the in-memory entity activate/upsert PUTs
      here). New module `middleware/src/services/entityScopeProducer.ts` (`produceEntityScope`).
- [x] **UNBLOCK — column inventory decision.** — DONE. **Producer-backed (KEEP):** `bucketId`,
      `projectIdsJson` (the `sample` demo scope). **Producerless but KEPT (tracked future consumer, NOT
      dropped):** `groupId` (cf19 multi-bucket→group substrate, backlogged/tracked) + `documentIdsJson`
      (single-doc viewer / wf05b substrate, tracked). **NET: zero columns dropped in Phase 3** — the
      conservative §9 call; over-dropping would break cf19's rework + single-doc flows.

## Phase 1 · Producer contract + write site (TDD)

- [x] **Failing test:** a producer unit test — DONE. `entityScopeProducer.test.ts` (5 tests): `sample:<id>`
      → `{bucketId, projectIdsJson:[id], groupId:null, documentIdsJson:null}`; null for unrecognized kind /
      no samples bucket / malformed key. Watched RED (module absent) before implementing.
- [x] Add the producer module — DONE. `middleware/src/services/entityScopeProducer.ts` —
      `produceEntityScope(entityKey, {samplesBucketId})`. Returns the persisted column subset that
      `deriveRagContentScope` reads (no parallel shape); maps `projectIdsJson` → `filter.projectId` via the
      existing reader.
- [x] **Failing test:** the write path — DONE. `apiRouteContract.test.ts` RT-03 block (+4 tests): a fresh
      `sample:*` PUT with a samples bucket configured persists `bucketId` + `projectIdsJson`; idempotent on
      re-PUT; NULL when no samples bucket. Watched 3 RED before wiring.
- [x] Wire the producer into the entity-write seam — DONE. `app.ts` PUT
      `/api/chat-sessions/:id/entities/:entityKey`: runs `produceEntityScope` on first write (idempotent —
      preserved on later writes), fills `bucketId`/`projectIdsJson`. Anon onboarding unchanged (no samples
      bucket / unrecognized key → null → NULL columns → fallback).

## Phase 2 · Round-trip closeout (satisfies the durable requirement)

- [x] **Failing test → flips the RED characterization test:** — DONE. `chatHandler.test.ts` new
      "entity scope round-trip" block: producer writes scope columns → `deriveRagContentScope` resolves
      `{type:"bucket", bucketId, filter:{projectId:[scenarioId]}}` (the demo scope) even with the same env
      fallback supplied — proving the columns are read, not the fallback branch. Depends on the Phase 1
      producer (which was RED-first).
- [x] **Failing test:** anon-onboarding still falls through to the samples-bucket fallback — DONE. Same
      block: when `produceEntityScope` yields null (no samples bucket), columns stay NULL and the entity
      resolves to `{type:"bucket", bucketId}` (bare fallback). The locked characterization unit tests
      (NULL columns → fallback) stay green unchanged.

## Phase 3 · entity-rag Phase 2 §9 — drop producerless columns (ONLY after Phases 1-2 land)

- [x] **Failing test (drift guard):** — DONE. `entityScopeColumnPolicy.test.ts` (4 tests): every scope
      column READ by `deriveRagContentScope` (parsed from source) must be either producer-backed (non-null
      assignment in the named producer) OR documented as KEPT for a tracked future consumer — no read-only
      column. Proven to bite (RED) by temporarily dropping a column from the policy table.
- [x] §9 column-drop — DONE, **CONSERVATIVE: zero columns dropped.** `bucketId` + `projectIdsJson` are
      producer-backed → KEPT. `groupId` (cf19 multi-bucket→group substrate) + `documentIdsJson` (single-doc
      viewer / wf05b substrate) have a **tracked future consumer** → KEPT (dropping them would break cf19's
      rework + single-doc flows). No column read by `deriveRagContentScope` is producerless-AND-unkept, so
      no column / read site / `ChatSessionEntityRecord` field is removed.

## Closeout

- [x] Update `docs/agents/data-model.md` — DONE. The `chat_session_entities` cols row now reads "scope
      columns produced by `entityScopeProducer.produceEntityScope`, read by `deriveRagContentScope`",
      records the §9 outcome (zero columns dropped; `groupId`/`documentIdsJson` kept for tracked
      consumers), and notes BYO deferred. The "read-but-unwritten / no producer yet" note is dropped.
- [x] Cross-reference `cf19` and `entity-rag-scope-roundtrip` — DONE. Recorded in tasks + data-model: this
      change supplies the producer half of the durable round-trip requirement (`entity-rag-scope-roundtrip`
      supplied the reader). `cf19` is the **read-side resolver** for the multi-bucket→group case; this
      change does NOT write a multi-bucket list or `groupId` (only the `sample` bucket+project scope), so
      `groupId` is KEPT as cf19's substrate, awaiting cf19's own upstream/rework. No cf19 code built here.
- [x] `openspec validate 2026-05-31-steady-scope-producer --strict` green — DONE. Middleware suite green
      (635 passed, file-serial config intact); app suite green (1404 passed); `npm run build` clean
      (middleware tsc + app tsc+vite); tool-references + tool-quality drift guards green.
- [ ] Adversarial review gate: falsify each claim against the real code AND the durable `chat-routing`
      round-trip requirement; confirm no scope column is left read-only; confirm no dormant/spec-only
      plumbing. Then archive. _(Left for the gate agent — this run does not self-archive or commit.)_
