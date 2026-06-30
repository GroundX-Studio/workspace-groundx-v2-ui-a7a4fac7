# Tasks — WF-15 no placeholder-id viewer fetch

- [x] **Failing tests (TDD):** `isResolvedDocumentId` helper (5 tests) + 2 PdfViewerWidget gate tests
      (no `getDocumentXray` for `scenario:utility`; neutral loading, no "COULD NOT LOAD"; fetches once
      the id resolves to a real UUID). RED confirmed (gate fired the fetch before the fix).
- [x] `isResolvedDocumentId` in `app/src/api/documentId.ts` — a resolved id is non-empty and colon-free
      (real GroundX ids are colon-free UUIDs; app placeholders use the `kind:value` shape e.g.
      `scenario:utility`). Test-safe (stub ids like `doc-1` still pass).
- [x] Gated the PdfViewerWidget X-Ray `useEffect` on `isResolvedDocumentId(documentId)` — placeholder
      ids hold the neutral loading state (xray+error null → `loading` true) and re-run when the real
      id arrives.
- [x] App suite **1054/1054**; tsc **0**; drift guards green; OpenSpec validate.
- [x] **Live-verified (2026-05-29):** opening the utility scenario fires X-Ray only for the real
      `c3bfff49` UUID — **zero `xray/scenario%3A*` 406s** in the network tab, no "COULD NOT LOAD" flash.
- [x] Archive.
