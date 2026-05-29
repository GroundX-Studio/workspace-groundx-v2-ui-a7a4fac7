# Tasks — WF-12 F3 Extract live

- [x] Pure `workflowToSchema` + `extractToValues` in `app/src/api/extractLiveData.ts`, grounded in
      the real live workflow shape. **8 unit tests green.**
- [x] `ExtractView` fetches `getDocument → filter.workflow_id → getGroundXWorkflow` (schema) +
      `getDocumentExtract` (values) via `useEffect`; overlay-merge + F3a save now use the live
      `schema`; manifest is the fallback. No `manifest.extractionSchema`/`sampleExtractionValues`
      reads remain in ExtractView.
- [x] `SchemaView` (F3a) takes the live `schema`/`values` as props from ExtractView (manifest fallback).
- [→] `ChatColumn.tsx:492` pick-view read → split to **WF-17** (chat-surface; can't take the prop).
- [x] App suite **1045/1045**; tsc **0** both sides; F3/F3a tests 47/47; OpenSpec validate.
- [x] **Live-verified (2026-05-29) — schema AND values both live + matching:** F3 renders the live
      **36-field workflow schema** (`addressee`, `balance_payable`, `bill_account_id`, `issued_on`…)
      AND real values from `get_extract`: `addressee = "KWIK TRIP (1147)"`, `balance_payable = 7613.2`,
      `payment_deadline = 2025-07-30`, `issued_on = 2025-07-08`, `document_kind = statement_type_bill`.
      The mock 6-field schema ($18,742 / acct 1023456) is GONE.
- [x] **No seed mismatch** (earlier note WITHDRAWN): BOTH the MCP `document_getextract` AND the app's
      middleware `get_extract` return the SAME vocabulary as workflow 9910308e
      (`addressee`/`balance_payable`/…). The apparent "—" came from (a) a **stale / cross-contaminated
      MCP tool-result file artifact** that surfaced a phantom `amount_due`/`recipient_name` shape
      (+ workflow-id-as-doc-id confusion: `9910308e` against the extract endpoint → 406), and (b) a
      probe that ran before the `getDocument → getGroundXWorkflow(278KB) → getDocumentExtract` chain
      resolved. Both corrected; nothing to re-extract.
- [x] Archive.
