# WF-15: viewer SHALL NOT fetch an X-Ray for a placeholder id (finding 4)

## Why

Live-drive finding (2026-05-29): on opening a scenario the document viewer mounted with the
placeholder id `scenario:utility` and fired `GET /v1/ingest/document/xray/scenario%3Autility` →
**406**, painting "COULD NOT LOAD DOCUMENT", before the active entity resolved the real
`documentId` (`c3bfff49`) and re-fetched → 200. The user sees an error flash and the app issues
wasted 406 requests on every mount.

## What changes

The document viewer (or its caller) SHALL gate the X-Ray fetch on a real GroundX document UUID and
SHALL NOT request an X-Ray for a placeholder id such as `scenario:*`. Until the real documentId
resolves, it shows a neutral loading state — no error flash, no 406.

## Out of scope

- Citation persistence (WF-16); the doc re-ingest (WF-14).

## Affected

- App: `UnderstandView` / `PdfViewerWidget` caller — gate the fetch on a real documentId; tests.
- Specs: `ui-views` (no placeholder-id X-Ray fetch).
