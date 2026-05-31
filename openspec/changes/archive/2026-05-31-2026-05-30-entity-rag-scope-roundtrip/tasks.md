# Tasks — Characterize the read-but-unwritten per-entity RAG scope columns

> **MIGRATED 2026-05-31.** Phase 1 SHIPPED (round-trip test + stale-comment fixes). The real
> entity→scope producer + the §9 column-drop → **`2026-05-31-steady-scope-producer`** (which leads with
> an INPUT NEEDED gate on the steady/BYO scope model). Do NOT pick up the producer/§9 tasks here. Stays
> ACTIVE (not archived) — its "persisted by a producer" requirement is unsatisfied until that plan ships.

> THIN SLICE. The `chat_session_entities` scope columns are READ by `deriveRagContentScope` but written
> by no producer. For the only path that exists today (anon onboarding) the samples-bucket fallback is
> **by design** — not a live wrong-bucket bug (verified: `chatHandler.ts:384-389`, `types.ts:119-122`,
> `app.ts:803-810`). The real producer (steady-mode / BYO) does not exist yet and is **Deferred**.
>
> **Execution: → TDD.** Characterization test first, then the doc correction. No producer in this slice.

## Phase 1 · Characterize the seam + correct the doc
- [x] **Characterization test:** with a fresh `chat_session_entities` entity (all four scope columns
      NULL), assert `deriveRagContentScope` returns the samples-bucket fallback — documenting that the
      scope columns are read-but-unwritten today and the fallback is the intended onboarding behavior.
      (This is the RED starting point the future steady-mode/BYO producer change will flip.)
      _Added `describe("deriveRagContentScope — characterization …")` (2 cases) in
      `middleware/src/services/chatHandler.test.ts`._
- [x] **Doc correction:** fix `docs/agents/data-model.md` line ~100 — replace the inaccurate
      "scope+filter already persisted" claim with the truth: the scope columns exist and are read by
      `deriveRagContentScope` but have **no producer yet** (future steady-mode/BYO).
      _Already corrected last turn (line 100 now states "exist and are READ … but have no producer
      yet … not a bug"); verified, no further edit needed._

## Closeout
- [ ] `validate --strict` green; middleware suite green (`--no-file-parallelism`).
- [ ] Archive. The real producer is tracked under **Deferred (future)** in `proposal.md` (sequence with
      `cf19`/CF-15, which wire these exact columns) — pick it up when the steady-mode/BYO path exists.

> **Dropped from this slice (deliberate):** the prior "Phase 2 · §9 enforcement / drop the column" work.
> The four scope columns must NOT be dropped — `cf19`/CF-15 intend to thread these exact columns into
> `deriveRagContentScope`, so a §9 read-only-column drop here would conflict with that planned wiring.
