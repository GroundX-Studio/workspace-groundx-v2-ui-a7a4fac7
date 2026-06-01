# Tasks — WF-05b word-level citation geometry

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

> **Delivery note (2026-05-31):** Every code deliverable below was already shipped by the
> superseding change `2026-05-31-word-level-citation-geometry` (now archived at
> `openspec/changes/archive/2026-05-31-2026-05-31-word-level-citation-geometry`). That change
> implemented the pure resolver + fixture test, the canonical `XrayDoc` type, the pipeline wire-up,
> AND went further than this change's scope by also building the live `-118-map.json` fetch
> (`wordMapCache.ts`) — the item this change had deliberately BACKLOGGED. Nothing remained to build
> here; this pass verified each deliverable against the shipped code (TDD red-proofs included) and
> ran all gates green. Boxes are checked with the file/line evidence; only Archive is left for the
> orchestrator.

- [x] **Failing test:** a cited verbatim span resolves to a tight word-level `bbox` (smaller than the X-Ray chunk box) for the Utility "amount due" answer. — SHIPPED + VERIFIED. `middleware/src/services/citationGeometry.test.ts:214` ("resolves the Utility 'amount due' verbatim span to a tight word-level bbox") asserts `bbox.w < chunkBox.w`. Proved real this pass: forking the resolver normalization (`env.minX + 99`) turns it RED (3 failed), reverted → 24 passed.
- [x] Implement the pure word-atom resolver in `services/citationGeometry.ts` (given a `-118-map` payload, match the cited span → union of atom boxes), normalized to page coords. **Pure transform only — runnable now against a fixture map.** — SHIPPED. `resolveWordGeometry(span, map)` (`citationGeometry.ts:392`) — pure: word-map in, no fetch; runs against `wordMap.fixture.json`.
- [ ] **BACKLOG (deferred):** live `-118-map.json` fetch wiring — processId discovery + `…/layout/processed/{processId}/{documentId}-118-map.json` storage-URL build + fetch/store. No precedent infra exists; ticket separately. — NO LONGER BACKLOG: the superseding archived change built this as `wordMapCache.ts` (`fetchDocumentWordMap`, derives the URL by swapping `-xray.json`→`-118-map.json` on `document_get.xrayUrl`; 11 tests in `wordMapCache.test.ts`, all green). Left unchecked here because THIS change deliberately scoped it OUT; it was delivered by the other change, so there is no surviving ticket to open.
- [x] Fallback chain: word-level (`-118-map`) → X-Ray chunk box → none. Verbatim-only (no paraphrase guessing) per `project_groundx_search_geometry`. — SHIPPED + VERIFIED. Resolver returns `null` on non-verbatim/empty (`citationGeometry.test.ts:246,253`); router falls back to the X-Ray chunk box (`paraphrase`) then geometry-less (`chatRouter.test.ts`).
- [x] Wire the tight `bbox` into the citation pipeline so `Citation.bbox` carries it; the WF-06b `exact` tier lights word-level automatically. — SHIPPED. Chat router calls `resolveWordGeometry` for verified citations and sets `bbox` + `assignTier(v, { hasAtomBox: true })`; no `hasAtomBox: false` literal remains in non-test code. `exact` tier lights end-to-end (router test in `chatRouter.test.ts`).
- [x] Unblocks the hack removal: with the real tight box present, `core-data-model-hardening` deletes `UTILITY_AMOUNT_DUE_REGION` + `isUtilityAmountDue`. — DONE elsewhere. Grep across `app/src` + `middleware/src` finds zero `UTILITY_AMOUNT_DUE_REGION` / `isUtilityAmountDue` (already removed; not by this change, per scope).
- [x] Middleware tests (resolver + fallback + the amount-due case); suites green; `validate --all --strict`. — VERIFIED this pass: middleware vitest 687 passed (36 files); app vitest 1464 passed (174 files); app build clean; middleware `tsc --noEmit` clean; `openspec validate 2026-05-29-wf05b-word-level-geometry --strict` → valid. Canonical `XrayDoc` proved load-bearing: forking `documentPages[].pageNumber`→`pageNumberDRIFT` breaks tsc at lines 208+459, reverted.
- [ ] Archive. — Left for the orchestrator (hard scope rule: do NOT run `openspec archive`).
