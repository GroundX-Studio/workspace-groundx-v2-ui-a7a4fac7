# Tasks — WF-05 extract-field source geometry

## 0. Depends on WF-03

- [x] WF-03 merged: `citationGeometry.ts` (`normalizeBox`, `pageOf`) + per-doc X-Ray cache exist.

## 1. Value-match resolver — DONE (2026-05-29)

- [x] **Failing test → green:** `resolveFieldGeometry(7613.2, "balance_payable", xray)` matches the
      chunk printed as `"$7,613.20"` (value-candidate raw-substring match handles currency/comma/
      decimal formatting) and returns `{ page, bbox }` normalized 0-1.
- [x] **Failing test → green:** a value with no matching chunk → `null` (caller ships citation-less).
- [x] **Failing test → green:** the field label is the secondary tiebreaker when a value is
      ambiguous (two chunks contain `18.43`; the label picks the right chunk). + null for empty/bool.
- [x] Implemented `resolveFieldGeometry(value, label, xray)` + `fieldValueCandidates` in
      `citationGeometry.ts` (reuses `normalizeBox`/`groupByPage`/`matchScore`). Chunk-envelope box.
      Middleware **480/480**, tsc 0.

## 1b. Word-level precision via `-118-map.json` (OPTIONAL, flagged) — SKIPPED

- [→] **Deliberately not built.** The chunk-envelope (§1) is the production ceiling per the
      proposal ("per-word precision — out of scope"); the `-118-map` schema is explicitly unstable
      ("can change without notice; use X-Ray for production"). Live geometry already lands sane
      chunk-envelope boxes. Filing as a future precision enhancement, not a gap. Not blocking.

## 2. Enrich the extract path — DONE (2026-05-29)

- [x] **Failing test → green:** `POST /api/documents/:id/field-geometry` resolves per-field
      geometry from the cached X-Ray (`apiRouteContract.test.ts`): a matched value → `{page, bbox}`,
      an unmatched value → `null`, missing `fields` → 400. (Chose a dedicated endpoint over enriching
      the generic extract proxy — the app already has schema+values from WF-12, so it POSTs
      `{value,label}` pairs and the middleware resolves via `resolveFieldGeometry`.)
- [x] Wired the endpoint behind the per-doc X-Ray cache (`fetchDocumentXray`). Best-effort: no
      X-Ray → all-nulls; never fails. Extended `FakeGroundXClient` with `responseByPathFragment` to
      inject an X-Ray fixture in tests.

## 3. App consume — DONE (2026-05-29)

- [x] App entity `fetchFieldGeometry(documentId, fields)` (`app/src/api/fieldGeometry.ts`) + 4 unit
      tests (parallel geometry array; all-nulls on non-ok/throw; no request for empty list).
- [x] `ExtractView` resolves geometry in the live `useEffect` and attaches it as each field's
      `citations: [{documentId, page, bbox}]` → the existing field-click → `pdf-viewer-highlight`
      path (WF-01b C) now lights up with real source regions. (WF-08 had removed the mock field
      bboxes, breaking this; WF-05 restores it with live geometry.)

## Closure — DONE

- [x] Middleware **482/482** + app **1061/1061**; tsc 0 both sides; drift guards green; OpenSpec validate.
- [x] **Live (Chrome DevTools):** F3 fires `POST /api/documents/c3bfff49/field-geometry` → 200 with
      real resolved bboxes — `addressee` → p1 `{0.125,0.03,0.31,0.28}`, `balance_payable` → p1
      `{0.538,…}`, `payment_deadline` → p1 `{0.558,0.414,…}`; empty `bill_account_id` → null. Sane,
      in-bounds, non-zero; correct degradation on misses.
- [x] Archive the change.
