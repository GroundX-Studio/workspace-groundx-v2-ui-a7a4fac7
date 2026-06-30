# WF-06b: tiered citation render (the app side of WF-06)

## Why

WF-06 shipped the middleware attribution core — the chat router now emits `Citation.tier`
(`exact` | `paraphrase` | `ambient`) + `confidence` + `answerSpan`, quote-verified and tiered,
live on the wire (verified: ambient citations carry `tier:"ambient"`/`confidence:0`). The **app
does not consume it yet**: `ChatColumn` renders citations as undifferentiated `CiteChip`s and the
`PdfViewer` highlight is a single fixed style. WF-06's one app-contract change — rendering the
answer's *tiered* source precision — was split out here so the middleware could ship + verify
independently.

## What changes

The app `Citation` / `ChatCitation` gains `tier` / `confidence` / `answerSpan` (additive),
threaded through the `chatSessions` hydration + the live-send citation mappings (InteractView /
ChatColumn). The answer renders so a claim's source highlight reflects its tier:

- `paraphrase` → translucent chunk-region overlay (the live default for a verified claim),
- `exact` → solid word-level box (dormant until WF-05 1b `-118-map` lands; the app handles it so
  it lights up automatically once the middleware emits `exact`),
- `ambient` → source chip only, no auto inline span (the existing `CiteChip` →
  `highlightCitation` click path is unchanged — the floor behavior).

Optionally, split the answer into claim segments by `answerSpan` with per-claim hover→highlight.

## Out of scope

- The middleware attribution pipeline (Bridge B + verification + tiering) — shipped in WF-06.
- The `exact` tier's DATA (needs WF-05 1b `-118-map` atom resolver) — the app render handles the
  tier regardless, so no further app work is needed when that lands.

## Affected

- App: `ChatColumn` / `CiteChip` / `PdfViewerWidget` consume path; the app `Citation`/`ChatCitation`
  type; the ChatStore `doc-viewer` step carries `tier`; tests.
- Specs: `ui-views` (tiered highlight render).
