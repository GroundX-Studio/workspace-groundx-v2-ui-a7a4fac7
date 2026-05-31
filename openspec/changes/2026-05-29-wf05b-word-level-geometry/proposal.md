# WF-05b — word-level citation geometry (tight highlight boxes)

## Why

Citation highlights are only as precise as the bbox the answer carries. The WF-03 X-Ray join
produces **chunk-level** boxes that are often too coarse — e.g. the Utility "amount due" answer's box
lands on the payment-stub barcode, not the "Amount Due $7,613.20" line. That coarseness is the sole
reason the demo hack `UTILITY_AMOUNT_DUE_REGION` exists. WF-06b's **`exact`** attribution tier is
also dormant for the same reason: there is no word-level atom resolver. This change adds it.

## What changes

A **word-level geometry resolver** SHALL map a cited verbatim span to **atom-level boxes** using the
document's `-118-map.json` (word atoms; `…/layout/processed/{processId}/{documentId}-118-map.json`,
no API key) with the X-Ray chunk box as the coarse fallback. The resolved tight `bbox` flows into the
citation, so:
- The WF-06b **`exact`** tier lights a tight word-level highlight (it already renders if a tight box
  is present).
- The Interact "amount due" answer highlights the real line — **removing the need for**
  `UTILITY_AMOUNT_DUE_REGION` (the hack is deleted in `core-data-model-hardening`, gated on this).

## Scope note (2026-05-30)

Ship the pure resolver + fixture test now (exact tier dormant-but-ready); BACKLOG the live
`-118-map.json` fetch wiring (processId discovery + storage-URL build + fetch) — no precedent infra
exists. Verified: `citationGeometry.ts` resolves geometry purely from an `XrayDoc` passed in, and
nothing in `middleware/src` discovers a `processId`, builds the `…/layout/processed/{processId}/…`
storage URL, or fetches/stores the map (only dormant comments in `attribution.ts` / `chatRouter.ts`
reference it). So the resolver + a fixture test are runnable against a fixture map today; the live
fetch path is a backlog ticket.

Also: the X-Ray field-name drift (`documentPages[].pageNumber` as used here vs `.number` / `.page`
declared elsewhere) must be coordinated with `2026-05-29-core-data-model-hardening`'s "X-Ray response
shape declared 3× with field-name drift" item — promote one canonical `XrayDoc` type set; don't
double-author.

## Out of scope

- Re-ingesting samples as plain-layout (an alternative path noted in
  `project_groundx_search_geometry`); this change resolves geometry from the existing artifacts.

## Affected

- Middleware: a `-118-map` word-atom resolver (`services/citationGeometry.ts`), wired into the
  citation bbox pipeline; X-Ray chunk box as fallback.
- Specs: `chat-routing` (citation geometry precision + `exact` tier activation).
