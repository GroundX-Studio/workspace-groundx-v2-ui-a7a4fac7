# Tasks

- [x] T1 — SEQUENTIAL — **Failing user-visible test first**: extend
  `middleware/src/services/extractionCitations.test.ts` with a word-map fixture
  (mirroring `chatRouter.test.ts`'s `wordMapFetch` seam usage): a validated
  extraction citation whose value has a consecutive atom run lights
  `tier: "exact"` with the tight atom-run bbox; word-map null / value-absent /
  thrown fetch all keep `tier: "paraphrase"` + chunk bbox without dropping.
  Gate: tests fail for the right reason (exact expected, paraphrase received).
- [x] T2 — SEQUENTIAL — Implement the upgrade in `verifyExtractionCitation`
  (`groundedAnswer.ts`): resolve `String(actual)` through
  `deps.wordMapFetch ?? fetchDocumentWordMap` + `resolveWordGeometry`; on hit
  take the word geo page/bbox and `assignTier(v, { hasAtomBox: true })`; wrap
  in its own try so a throwing fetch degrades, never drops. Gate: T1 green,
  full middleware vitest green, `npm run build` green.
- [x] T3 — SEQUENTIAL — Spec delta: MODIFIED claim-level-citations requirement
  (MAY → SHALL-when-resolvable) + two scenarios. Gate:
  `openspec validate --all --strict` passes; adversarial review of the diff
  against code + spec (no contradiction with the drop-on-miss scenario — the
  drop rule is scoped to the chunk-level resolver).
