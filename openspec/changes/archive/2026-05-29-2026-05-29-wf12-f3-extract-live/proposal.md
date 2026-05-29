# WF-12: F3 Extract — live workflow schema + extract values (finding 1)

## Why

Live-drive finding (2026-05-29): F3 showed `amount_due 18742.16` / `account_number 1023456` /
`meter_kwh 4128` — the manifest's **fake** `sampleExtractionValues` — not the real Windom extract
(`$7,613.20` / KWIK TRIP). Three readers still pull the manifest schema/values:
`ExtractView.tsx:158,304`, `SchemaView.tsx:155-156` (F3a editor), `ChatColumn.tsx:492`.

## What changes

F3 SHALL build its schema from `getDocument(docId).filter.workflow_id` →
`getGroundXWorkflow(workflow_id)` (a pure `workflowToSchema` transform) and its values from
`getDocumentExtract(docId)`. The same swap applies to `SchemaView` (F3a) and the
`ChatColumn` schema read. No `manifest.extractionSchema` / `sampleExtractionValues` reads remain.
The overlay-merge + F3a save flow operate on the live schema.

## Out of scope

- F5 chat (WF-13), manifest strip + re-ingest (WF-08 §5 / WF-14).

## Affected

- App: `ExtractView.tsx`, `SchemaView.tsx`, `ChatColumn.tsx`; new `workflowToSchema` transform; tests.
- Specs: `ui-views` (F3 renders live schema + values).
