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
- [ ] **UNBLOCK — BYO upload path readiness.** If Phase 0(a) reveals the BYO upload path does NOT yet
      exist, record the agreed producer seam (the function/route the upload-complete or entity-activate
      step will call) so the producer is wired behind a real, named seam — not invented upload flow. If it
      does exist, name the exact module/route the producer hooks into. (Gates Phase 1.)
- [ ] **UNBLOCK — column inventory decision.** From Phase 0(b)+(c), record the FINAL list of which of the
      four scope columns (`bucketId`, `documentIdsJson`, `groupId`, `projectIdsJson`) get a producer in
      this change and which remain producerless (→ dropped in Phase 3). (Gates Phase 2 and Phase 3.)

## Phase 1 · Producer contract + write site (TDD)

- [ ] **Failing test:** a producer unit test — given a customer entity whose target content is known (per
      the Phase 0 mapping), the producer computes the correct `ContentScope` refs (`bucketId` /
      `documentIdsJson` / `groupId` / `projectIdsJson`) for that `EntityKind`. RED before the producer
      exists.
- [ ] Add the producer module (middleware service layer) that maps an `EntityKind` + its known target to
      the scope-column refs, using the shared `@groundx/shared` `ContentScope` union (no parallel shape).
- [ ] **Failing test:** the write path — persisting an entity via the producer-fed seam writes the scope
      columns onto the `chat_session_entities` row (today `app.ts:803-810` preserves them as `existing?.X
      ?? null` and never sets them). RED against the current server-only-preserve writer.
- [ ] Wire the producer into the entity-write / upload-complete seam named in the Phase 0 UNBLOCK so the
      produced columns are persisted. Keep anon onboarding unchanged (no target known → columns stay NULL →
      samples-bucket fallback, the documented behavior).

## Phase 2 · Round-trip closeout (satisfies the durable requirement)

- [ ] **Failing test → flips the RED characterization test:** write a scoped customer entity → reload from
      the DB → `deriveRagContentScope` resolves the `ContentScope` to that target (NOT the env-samples
      bucket fallback). This is the write → reload → read → correct-scope round-trip that
      `entity-rag-scope-roundtrip` left as the starting RED.
- [ ] **Failing test:** the anon-onboarding path still resolves to the samples-bucket fallback (no
      regression — the producer only fires when a real target is known).

## Phase 3 · entity-rag Phase 2 §9 — drop producerless columns (ONLY after Phases 1-2 land)

- [ ] **Failing test (drift guard):** every scope column read by `deriveRagContentScope` has at least one
      non-test writer; any column with no producer is absent (no read-only column survives). RED if a
      producerless column is still read.
- [ ] For each column on the Phase 0 producerless list: remove the column read in `deriveRagContentScope`,
      drop the column from `chat_session_entities` (+ the migration / `mysqlRepository.ts` mapper), and
      remove the now-dead field on `ChatSessionEntityRecord` (`middleware/src/types.ts:124-127`). A column
      the Phase 1 producer now writes is KEPT.

## Closeout

- [ ] Update `docs/agents/data-model.md`: the `chat_session_entities` row now reads "scope columns
      produced by `<producer>`, read by `deriveRagContentScope`" (drop the "read-but-unwritten" note);
      record which columns were dropped in Phase 3.
- [ ] Cross-reference `cf19` and `entity-rag-scope-roundtrip` per the Phase 0(c) decision (if the producer
      writes a multi-bucket list, note that `cf19` is the read-side resolver; if it writes `groupId`
      directly, note `cf19` is read-side only).
- [ ] `openspec validate 2026-05-31-steady-scope-producer --strict` green; middleware suite green
      (`--no-file-parallelism`); app suite green (sanity).
- [ ] Adversarial review gate: falsify each claim against the real code AND the durable `chat-routing`
      round-trip requirement; confirm no scope column is left read-only; confirm no dormant/spec-only
      plumbing. Then archive.
