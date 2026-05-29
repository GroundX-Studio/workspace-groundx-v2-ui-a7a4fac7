# WF-05: extract-field source geometry (X-Ray resolver)

## Why

`ui-views` already requires F4 to highlight a field's **source region** on the PDF when a
field card is clicked ("The selected field's source region MUST be highlighted", ui-views:316)
and F3 field rows to behave the same. Today that only works against **fixture**
`ScenarioCitation.bbox` values. The real path is impossible as-built:

**`document_getextract` returns field VALUES ONLY — no geometry, ever.** A 2026-05-28 live
probe (doc `c3bfff49…`) returned a nested value object
(`{amount_due, due_date, meters:[{meter_charges:[…]}], …}`) with **no bbox, no page, no
confidence, no source location** on any field. (Locked: `project_groundx_search_geometry.md`.)

So unlike WF-03 (where geometry rides on the search result), extract fields have **no geometry
source at all** until we resolve one. The only geometry source for a known field value is
`document_getxray` (`chunks[].boundingBoxes` + `documentPages[].width/height`) — match the
field's value/printed-text against a chunk, lift + normalize the box.

This is a **different resolver** from WF-03 (input = a field value, not a chat snippet), which
is why WF-03 explicitly punted it here.

## What changes

1. **`resolveFieldGeometry(fieldValue, label, xray) → { page, bbox } | null`** in the
   middleware (PRIMARY, production-stable): normalize the field value (strip
   currency/commas/format), match against `chunk.text` / `chunk.suggestedText` (and the field
   label as a secondary signal), pick the best chunk, union its `boundingBoxes`, normalize px ÷
   page dims. Reuses WF-03's `normalizeBox` / `pageOf` helpers (shared `citationGeometry.ts`).
   This gives a **chunk-envelope** box (covers the paragraph/table the value sits in).

1b. **Word-level precision (OPTIONAL upgrade).** A field value is a *verbatim* token, so it can
   be matched to individual **atoms** in the `-118-map.json` OCR map
   (`…/layout/processed/{processId}/{documentId}-118-map.json`, no API key — guide §10) for a
   TIGHT box around the exact value instead of the whole chunk. Behind a flag, with **graceful
   fallback to the chunk-envelope** on any miss or schema drift — the MAP schema is explicitly
   "can change without notice; use X-Ray for production" (guide §05), so it is a precision
   enhancement, never the only path. (`processId` + `documentId` come from `document_get` /
   the X-Ray / search results.)
2. **Extract entity returns geometry-bearing field citations.** The middleware extract path
   (the BFF endpoint that serves `document_getextract` to F3/F4) enriches each returned field
   with `citations: [{ documentId, page, bbox }]` resolved via the X-Ray (cached per doc,
   reusing WF-03's cache). On no match, the field ships citation-less (highlight degrades to
   none — per the existing best-effort rule).
3. **App consumes the resolved geometry** — `ExtractedFieldValue.citations[].bbox` already
   exists in the type and `ExtractView`/`FieldProvenancePanel` already pass it to
   `PdfViewer.highlightBbox`. So app side is verification-only, like WF-03.

## Out of scope

- RAG chat citation geometry — that's WF-03 (geometry off the search result).
- Per-word precision (chunk-envelope is the ceiling; upstream GroundX ask).
- Re-running extraction / schema editing (UI-01 / F3a own that).

## Dependencies

- **WF-03 first** — shares `citationGeometry.ts` (`normalizeBox`, `pageOf`) + the per-doc
  X-Ray cache. WF-05 adds the value-match resolver on top.

## Affected

- Middleware: `services/citationGeometry.ts` (+`resolveFieldGeometry` value-match), the extract
  BFF endpoint/service (enrich field citations), tests.
- App: `ExtractView` / `FieldProvenancePanel` verification test (consume path exists).
- Specs: `ui-views` (extract-field source highlight SHALL resolve geometry from X-Ray, since
  getextract carries none).
