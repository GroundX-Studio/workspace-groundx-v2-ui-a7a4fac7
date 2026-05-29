# WF-03: citation geometry off the search result (X-Ray = fallback)

## Why

WF-01/WF-01b wired source-region highlighting (cite chip → lit bbox on the PDF), but it only
fires when a citation carries a `bbox` — and prod citations don't, because the chat router never
populates one.

Verified 2026-05-28 against the real Utility sample doc `c3bfff49` (bucket 28454, the
sample-doc/utility filter), after the workspace was cleaned of an erroneous duplicate:

- `search_documents([c3bfff49])` and `search_content(28454)` return chunks that **carry geometry** —
  `boundingBoxes[]` (px corners + `pageNumber`), `pages[]` (`width`/`height`), `searchData`; `text`
  is OCR layout text. This is the documented happy path (`groundx-api/guides/08-source-view-ui.md`
  §4; the `chat-with-sources` widget relies on it).

So citation geometry can be **read straight off the search result**. The blocker is a middleware
bug: `chatRouter.ts` (~985) maps each result reading a **nonexistent top-level `r.pageNumber`** and
**ignoring `boundingBoxes`/`pages`** — so every RAG citation defaults to `page: 1` (line 676) with no
bbox. The canonical harness (`groundedGeneration.ts` → `citationFromSearchResult`) forwards
`boundingBoxes`/`pages` straight off the result; our `SearchResult` type already mirrors that — the
mapper just doesn't use it. **WF-03 realigns to the harness pattern.**

## What changes

**Primary — read geometry off the search result:**

1. **Fix the mapper** (chatRouter.ts:398/985): extend `GroundXSearchResult` with typed
   `boundingBoxes?` + `pages?`; stop reading `r.pageNumber`. Tighten app `SearchResult`
   (`sdkTypes.ts`) from `unknown[]` to the real box/page shapes.
2. **Normalize** in new `middleware/services/citationGeometry.ts`: `groupByPage(boxes)` (a chunk can
   carry several boxes / span pages — guide §5; never union across pages), `normalizeBox(boxesOnPage,
   page)` = union ÷ `page.width`/`page.height` → 0-1 `{x,y,w,h}`, `pageOf(result)` =
   `boundingBoxes[0].pageNumber` (→ `pages[0].number` → 1). Pure, separately tested.
3. **Add `bbox` to the middleware `Citation`** (chatRouter.ts:107); populate `page`+`bbox` in the
   citation assembly (667-678) from the normalized result geometry (not `?? 1`).

**Fallback — X-Ray join (for any doc whose results lack geometry):**

4. When a result carries no `boundingBoxes`, best-effort resolve via the X-Ray: match the snippet
   against `chunks[].text` (normalized), take the page from the matched chunk's `pageNumbers[0]`,
   normalize its cited-page boxes. Fetch the X-Ray once per doc, cached (via `xrayUrl` /
   `document_getxray`). A resolver error never fails the chat turn.

App side needs **no contract change** — `Citation.bbox`, the `highlightCitation` handler, and
`PdfViewer.highlightBbox`/`litRegions` already consume `{x,y,w,h}`. Only a verification test that a
bbox-bearing citation lights a `pdf-viewer-highlight`.

## Out of scope

- **Extract-field geometry (F3/F4)** — `getextract` returns values only, no geometry. Separate
  resolver, filed as **WF-05**.
- Word-level / sub-chunk precision (WF-05/WF-06 via `-118-map`).
- The `tool|noTool` binding-guard holes (WF-04).
- Seed hygiene: the workspace previously contained a duplicate that shadowed `c3bfff49` in search;
  it has been removed. WF-03 assumes the Utility scenario resolves to the single doc `c3bfff49`.

## Affected

- Middleware: `chatRouter.ts` (`GroundXSearchResult`/`Citation`/mapper/assembly), new
  `services/citationGeometry.ts` (`groupByPage` + per-page px→0-1 normalize + `pageOf`; X-Ray
  fallback match + per-doc cache), tests.
- App: `sdkTypes.ts` `SearchResult` precise types; verification test only (consume path exists).
- Specs: `chat-routing` (citations SHALL carry page + normalized bbox read off the search result,
  X-Ray as fallback).
