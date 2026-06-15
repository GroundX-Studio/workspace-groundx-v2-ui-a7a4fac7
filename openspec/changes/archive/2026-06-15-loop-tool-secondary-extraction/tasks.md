# Tasks — loop-tool-secondary-extraction

Picked up 2026-06-15 (split out of `agentic-tool-loop`'s deferred list).

- [x] **T0 — Spec delta hardening (security).** Added the authorization-constraint
  requirement + an "out-of-scope documentId is refused" scenario: the tool may
  only fetch a document the turn surfaced under the caller's authorization
  (RBAC-filtered snippets + explicit `documents` scope). Prevents an IDOR (a
  model-supplied / prompt-injected foreign documentId leaking another doc's fields).

- [x] **T1 — Failing user-visible tests first** (discipline §1). Added to
  `toolLoopCorpus.test.ts`: (A) the model calls `fetch_document_fields` with a
  SURFACED documentId → the extraction endpoint is hit + the fields reach the
  model in the round-2 tool message; (B) IDOR guard — an out-of-scope documentId
  → NO extraction fetch, the unauthorized payload never reaches the model, a
  "not available" result is fed back, turn succeeds. Confirmed RED.

- [x] **T2 — Implement per proposal + (hardened) spec delta.**
  `ServerExecuteContext` gains `fetchExtraction(documentId) => Promise<string>`.
  New `fetch_document_fields` server-executed `read` tool added + registered.
  `groundedAnswerOverScope` computes `authorizedDocIds` (snippet docIds + explicit
  scope) and binds `fetchExtraction`: refuses + logs an out-of-scope id (no fetch),
  else reuses `fetchDocumentExtraction` and returns its `promptBlock`.
  - ↳ Review: model supplies only `documentId`; the authorized set is the
    RBAC-filtered retrieval, so no out-of-scope/cross-tenant read. New tests GREEN.

- [x] **T3 — Drift guards + adversarial review; validate --strict; suites green.**
  Updated EXPECTED_NAMES + the two per-step lists (toolCatalog.test.ts), the
  chatRouter universal-tools list, and the app parity `SERVER_ONLY` set.
  - ↳ Review: found + fixed a description collision (my text echoed the prompt's
    `EXTRACTED FIELDS` header, tripping a body-content assertion — reworded to
    "fields"). IDOR guard tested; best-effort never fails the turn; composable
    (reuses the existing fetch path). Known cosmetic: a refusal records as
    toolActivity not toolFailures (logged for monitoring). middleware 959, app
    1750 green; production build (tsc all workspaces) clean.

- [x] **T4 — Post-archive fix pass + fresh adversarial review (2026-06-15).**
  Fixed the three flagged findings: (1) refusal now THROWS → surfaces in
  `serverToolFailures` (+ warn log), not a misleading "fetched" toolActivity;
  (2) added a per-turn `extractionMemo` so a repeated same-doc fetch is ONE API
  call (extraction has no module cache); (3) the happy-path test now exercises a
  genuine SECOND document (search surfaces doc-a + doc-b; the model fetches
  doc-b). Added a memo test (two same-doc fetches → one extract call) and a
  failure-not-activity assertion to the IDOR test. Remaining minor: the loop's
  catch reasons any throw as "executor_error", so a refused IDOR and a real
  crash share that reason in `serverToolFailures` (distinguished only in the warn
  log) — a distinct reason needs a loop-framework change (out of scope).
  middleware 960, app 1750 green; build clean.
