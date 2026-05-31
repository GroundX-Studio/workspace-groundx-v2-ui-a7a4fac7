# Tasks — WF-05b word-level citation geometry

> **MIGRATED 2026-05-31.** The pure `resolveWordGeometry` resolver SHIPPED. The live `-118-map` fetch +
> pipeline wiring → **`2026-05-31-word-level-citation-geometry`**. Do NOT pick up the live-fetch/wiring
> tasks here. Stays ACTIVE (not archived) until that plan ships the live path.

> **Execution mode: → SEQUENTIAL/TDD.** One self-contained feature in `citationGeometry.ts` (resolver +
> fallback + pipeline wire), failing-test-first. Not a fan-out — single module, single test target. It
> *unblocks* the demo-hack removal in `core-data-model-hardening`; sequence this before that bullet.
> (Shares the canonical X-Ray-shape type with the core change's audit-batch — coordinate, don't double-author.)
>
> **Scope note (2026-05-30):** ship the pure resolver + fixture test now (exact tier dormant-but-ready);
> BACKLOG the live `-118-map.json` fetch wiring (processId discovery + storage-URL build + fetch) — no
> precedent infra exists (verified: nothing in `middleware/src` obtains a processId or fetches/stores the
> map). The X-Ray field-name drift (`documentPages[].pageNumber`) must be coordinated with the core-data
> X-Ray-shape item.

- [ ] **Failing test:** a cited verbatim span resolves to a tight word-level `bbox` (smaller than the X-Ray chunk box) for the Utility "amount due" answer.
- [ ] Implement the pure word-atom resolver in `services/citationGeometry.ts` (given a `-118-map` payload, match the cited span → union of atom boxes), normalized to page coords. **Pure transform only — runnable now against a fixture map.**
- [ ] **BACKLOG (deferred):** live `-118-map.json` fetch wiring — processId discovery + `…/layout/processed/{processId}/{documentId}-118-map.json` storage-URL build + fetch/store. No precedent infra exists; ticket separately.
- [ ] Fallback chain: word-level (`-118-map`) → X-Ray chunk box → none. Verbatim-only (no paraphrase guessing) per `project_groundx_search_geometry`.
- [ ] Wire the tight `bbox` into the citation pipeline so `Citation.bbox` carries it; the WF-06b `exact` tier lights word-level automatically.
- [ ] Unblocks the hack removal: with the real tight box present, `core-data-model-hardening` deletes `UTILITY_AMOUNT_DUE_REGION` + `isUtilityAmountDue`.
- [ ] Middleware tests (resolver + fallback + the amount-due case); suites green; `validate --all --strict`.
- [ ] Archive.
