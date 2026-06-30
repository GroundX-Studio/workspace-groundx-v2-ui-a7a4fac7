# Fix citation highlight switching when citations share a first region box

## Status: COMPLETE (implemented + live-verified 2026-06-14) — formalized post-implementation; ready to archive

Found during the `multi-region-citations` live browser run; fixed test-first
the same session. This change formalizes that fix.

## Why

The `multi-region-citations` work made a citation carry MANY proof regions, but
left the front-end citation-click identity comparing only the citation's FIRST
region's `{page, bbox}`. That was safe before multi-region (every citation had
exactly one, distinct box) and is unsafe now: on a tabular/list answer (e.g.
"list every charge line item", "what are all the tax amounts"), many DISTINCT
citations legitimately share the same first region — the big container chunk
that dozens of cited values all sit inside.

Two front-end gates used that first-box-only identity, so clicking a different
citation that shared the active one's first box was misread as a re-click of the
active citation:

1. The `highlightCitation` toggle-off (`CanvasOrchestratorContext`) compared
   `{documentId, page, bbox}` → it CLEARED the highlight instead of switching.
2. The `gotoDocViewer` same-document mutation short-circuit
   (`ChatStoreContext`) compared `page + first-bbox + tier + region COUNT` →
   even after (1) was fixed, two citations with the same first box AND region
   count were treated as identical, so the mutation was suppressed and the
   highlight froze on the prior citation.

User-visible symptom (reproduced live): clicking through the citation chips
`[1][2][3]…` made the highlight overlay flicker on and off — every other click
showed nothing — directly undermining the point of multi-region citations
(showing where each cited value came from).

## What changes

- Both gates compare the citation's WHOLE region set (a compact per-region
  signature: page + box + tier for every region), not just the first box. A
  legacy single-box citation falls back to its one region, so its behavior is
  unchanged. Mirrors how the sibling `showCitations` ("Show all sources") toggle
  already compares its full region array.
- `ui-runtime` spec: the `CanvasOrchestrator … highlightCitation` requirement's
  **Toggle** clause is refined from "(same documentId, page, and bbox)" to the
  whole-region-set identity, the short-circuit guard is folded into the same
  identity, and a new scenario covers the shared-first-box switch case.

## Non-goals

- No change to citation DATA (regions/dedupe/tiers) or the back-end resolver —
  the data layer was re-confirmed correct in the same live run (6 citations,
  3–4 regions each, multi-page, 0 duplicates, 4.2 KB).
- No change to the `showCitations` ("Show all sources") path — it already
  compared full regions and was correct.
- No new abstraction: the fix is a comparison refinement at the two existing
  gates, not a new identity type or shared module.

## Collision note

Touches `CanvasOrchestratorContext.tsx` and `ChatStoreContext.tsx`. No other
in-flight change in `openspec/changes/` edits the citation toggle / gotoDocViewer
short-circuit. The `multi-region-citations` change that introduced the regression
is already archived.
