# Tasks — WF-03 citation geometry (read off the search result; X-Ray fallback)

## 1. Geometry helpers (pure)

- [x] `groupByPage` / `normalizeBox` / `pageOf` / `bboxForResult` + defensive `parseBoundingBoxes`/
      `parsePages` in `middleware/src/services/citationGeometry.ts`. **11 tests green** incl. the
      `(362,593)-(1601,2031)` on 1700×2200 → `{x:0.213,y:0.270,w:0.729,h:0.654}` case + multi-box
      union + null on empty/zero dims.

## 2. Fix the mapper + read geometry off the result (primary)

- [x] Mapper (chatRouter.ts ~985) now reads `r.boundingBoxes`/`r.pages` via `bboxForResult` and
      **stops reading the nonexistent `r.pageNumber`**; sets resolved `pageNumber` + `bbox`. Test:
      "reads page + normalized bbox off a result's boundingBoxes/pages" (76 chatRouter tests green).
- [x] `GroundXSearchResult` + app `SearchResult` (`sdkTypes.ts`) tightened to typed
      `BoundingBox[]`/`PageDim[]` (`SearchResultBoundingBox`/`SearchResultPage`).

## 3. Attach geometry to citations

- [x] `Citation` carries `bbox?: NormalizedBbox`; assembly populates `page` (via the resolved
      result page, not `?? 1`) + `bbox` for both the validated-LLM and ambient branches
      (`bboxFor(documentId, page)` lookup). Covered by the chatRouter round-trip test.

## 4. X-Ray fallback (for results lacking geometry)

- [x] `resolveGeometryFromXray(snippet, xray)` (normalized text→chunk match → cited-page boxes →
      normalize) + `xrayCache.fetchDocumentXray` (per-doc, 5-min TTL, best-effort, never throws).
      Wired into `searchGroundX` — fires ONLY when a result lacks `bbox`. Tests: resolver (3) +
      `normalizeText` (1) + cache (5: fetched-once, endpoint, null-on-error, throw→null, TTL) +
      chatRouter "geometry-less result resolves bbox from the doc's X-Ray".

## 5. App consume (verification — no contract change)

- [x] Extracted the litRegion derivation to a pure `app/.../litRegions.ts` + 5 tests proving a
      citation's REAL bbox is used verbatim (not the fallback band) + color-keying; `InteractView`
      now consumes it. `ChatCitation.bbox`/`Citation.bbox`/`PdfViewer.litRegions` already existed.

## Closure

- [x] Middleware suite 475/475; app suite 1037/1037; tsc both sides 0 errors.
- [x] Drift guards green (widget-contract + no-hardcoded-styles run in the app suite;
      check-tool-references / check-tool-quality unaffected — no interactive controls touched).
      OpenSpec `validate --all --strict` green.
- [~] Chrome DevTools MCP live bbox measurement: **deferred to a real-data smoke.** Local dev runs
      MOCK_MODE (fixtures carry no real geometry), so a meaningful measurement needs the live
      GroundX backend + the layout-ingested `c3bfff49`. The render path is unit-verified
      (litRegions + InteractView tests) and the round-trip is test-verified (chatRouter). Flagged
      as the one manual check requiring a real-data environment.
- [x] Archive.

## Follow-ups (not in this change)

- **WF-05** — extract-field geometry (X-Ray chunk match + `-118-map` word-level).
- **WF-06** — response→source attribution (tiers).
- **WF-04** — widen the `tool|noTool` binding guard.
