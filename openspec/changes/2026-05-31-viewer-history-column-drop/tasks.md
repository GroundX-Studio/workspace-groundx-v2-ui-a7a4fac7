# Tasks — Drop the write-NULL-only viewer_* chat_sessions columns

> TDD: failing test first, then implement, then adversarial review before
> marking done. **Adversarial review gate after EVERY task (Discipline §10)** —
> a task is not `[x]` until an adversarial review of its output against the plan
> AND the real code passes, run before marking done and before the next task.

Behavior-preserving dead-plumbing closeout. The columns are write-NULL-only,
so no reader loses data. TDD: the dead-column grep guard is RED first (columns
present), GREEN after the drop. Sequential — the guard authored in task 1 only
goes green once tasks 2-7 land.

## 1. Dead-column grep guard (failing-first)

- [ ] Add a case to `middleware/src/db/mysqlRepository.test.ts`, next to the
  existing `tool_calls_json` / `attachments_json` guard (§4 #17), asserting the
  assembled `chat_sessions` DDL + the `upsertChatSession` INSERT + the
  `listChatSessions` SELECT statements contain **none** of
  `viewer_history_json` / `viewer_overlays_json` / `viewer_workspace_json`.
- [ ] Confirm it is RED against current code (all three columns present in the
  DDL/INSERT/SELECT) before writing any production change.
- [ ] **Adversarial review:** open the guard and confirm it asserts absence
  across ALL THREE assembled statements (DDL + INSERT + SELECT), not just one —
  a guard that only checks the DDL would stay green while a `viewer_*` survives
  in the INSERT. Confirm the assertion runs against the *actually-assembled* SQL
  strings (the same code path that ships), not a hand-copied literal that can
  drift. Confirm RED is genuine: it FAILS now (columns present), and the failure
  names a `viewer_*` token — not an unrelated error.

## 2. Drop the columns + ALTER migration

- [ ] Remove the three `viewer_*_json JSON NULL` lines from the `chat_sessions`
  CREATE TABLE (`mysqlRepository.ts:125-127`).
- [ ] Remove the dedicated idempotent ALTER block — the `information_schema`
  existence probe + the three `ADD COLUMN viewer_*_json` clauses
  (`mysqlRepository.ts:288-321`).
- [ ] Update / replace the migration test so it proves both boot paths succeed
  against the reduced schema:
  - **Fresh boot:** CREATE TABLE for `chat_sessions` contains no `viewer_*`
    column.
  - **Existing-DB upgrade:** an older DB that already has the viewer columns
    boots without error (no probe/ALTER references the dropped columns; a
    residual column is harmless because nothing writes it).
- [ ] **Adversarial review:** grep `mysqlRepository.ts` for any surviving
  `viewer_history_json` / `viewer_overlays_json` / `viewer_workspace_json` /
  `information_schema` reference tied to the dropped columns — the probe block
  AND the CREATE TABLE lines must both be gone, not just one. Confirm NO reader
  lost data: re-verify the dropped columns were write-NULL-only (no SELECT or
  app reader ever consumed a non-null value) so the drop is lossless. Confirm
  both boot paths actually run: a fresh boot CREATE asserts no `viewer_*`
  column, AND an existing-DB-with-the-columns boot completes with no error and
  no ALTER/probe touching the dropped names. Confirm the dead-column guard
  (task 1) is still RED at this point (tasks 3+ not yet landed) — it must not be
  prematurely green.

## 3. Remove INSERT / SELECT / parse references

- [ ] Remove the three columns from the `upsertChatSession` INSERT column list,
  the `VALUES(...)` ON DUPLICATE KEY clause, and the `JSON.stringify` arg binds
  (`mysqlRepository.ts:424-450`).
- [ ] Remove the three columns from the `listChatSessions` SELECT
  (`mysqlRepository.ts:462-475`).
- [ ] Remove `viewerHistory` / `viewerOverlays` / `viewerWorkspace` from
  `rowToChatSession` (`mysqlRepository.ts:805-807`).
- [ ] **Adversarial review:** grep the whole of `mysqlRepository.ts` for any
  remaining `viewer_history_json` / `viewer_overlays_json` /
  `viewer_workspace_json` (SQL column) AND `viewerHistory` / `viewerOverlays` /
  `viewerWorkspace` (JS field) — the INSERT column list, the `VALUES(...)` ON
  DUPLICATE clause, the `JSON.stringify` binds, the SELECT list, and
  `rowToChatSession` must ALL be clean. Confirm the INSERT column count still
  matches the `VALUES`/bind arity (an off-by-one bind here is the classic break)
  by reading the parameter list against the column list. Confirm
  `rowToChatSession`'s returned object no longer references the dropped fields
  and still type-checks against `ChatSessionRecord` (which loses these fields in
  task 5) — note any temporary type mismatch to be resolved in task 5.

## 4. Remove the PATCH-route viewer-field validation

- [ ] Remove the `viewerHistory` / `viewerOverlays` / `viewerWorkspace` body
  keys, the `hasViewer*` `hasOwnProperty` detection, the per-field validation
  branches, and the viewer keys in the persisted record from the chat-sessions
  PATCH handler (`app.ts:662-767`).
- [ ] Remove the viewer-slot defaults from the ensure-create path
  (`app.ts:507-509`).
- [ ] **Adversarial review:** grep `app.ts` for any surviving `viewerHistory` /
  `viewerOverlays` / `viewerWorkspace` / `hasViewer` token — the PATCH body
  keys, the `hasOwnProperty` detection, the per-field validation branches, the
  persisted-record writes, AND the ensure-create defaults must all be gone.
  Confirm the PATCH handler still validates and persists its REMAINING fields
  (the removal didn't strand a now-empty validation block or break the
  partial-update path). Confirm no client can still send a `viewer*` key and
  have it silently dropped vs. rejected — the route should no longer reference
  the keys at all. Cross-check `apiRouteContract.test.ts` / `app.test.ts` for
  any viewer fixture that would now fail (handled in task 7, but flag here).

## 5. Remove viewer fields from type + client contracts

- [ ] Remove `viewerHistory` / `viewerOverlays` / `viewerWorkspace` from
  `ChatSessionRecord` in `middleware/src/types.ts` (+ the doc comment block).
- [ ] Remove the viewer fields from the app `chatSessionPatch` request
  input/body shape (`app/src/api/chatSessionPatch.ts`).
- [ ] Remove the viewer fields from the `chatSessionsList` response row shape
  (`app/src/api/chatSessionsList.ts`).
- [ ] **Adversarial review:** grep `middleware/src/types.ts`, `chatSessionPatch.ts`,
  and `chatSessionsList.ts` for any residual `viewerHistory` / `viewerOverlays` /
  `viewerWorkspace` — type fields, doc-comment mentions, request/body shape,
  AND response row shape must all be clean. Confirm `ChatSessionRecord` and the
  app request/response shapes still agree with the middleware writers/readers
  (no consumer still references a now-deleted field) by `tsc --noEmit` on both
  app and middleware. Confirm the wire contract is consistent end-to-end: the
  PATCH input (task 4), the type (here), and the list response (here) all dropped
  the same three fields — no half-removed contract where one side still names them.

## 6. Remove the hydrate read path

- [ ] Remove the `hydrateViewer` viewer-slot read/population so the
  `ChatStoreServerHydrator` no longer reads the dropped fields; remove the
  now-unused viewer plumbing in `ChatStoreContext` that was fed only by it.
- [ ] **Adversarial review:** grep `ChatStoreContext` + `ChatStoreServerHydrator`
  (and anything they import) for surviving `viewerHistory` / `viewerOverlays` /
  `viewerWorkspace` / `hydrateViewer` references. Confirm the removed
  `ChatStoreContext` plumbing was fed ONLY by `hydrateViewer` — that no other
  caller (live viewer widget, intent dispatch, ViewerEvent path) still reads or
  writes those slots, otherwise this is a real regression, not dead-plumbing
  removal. Confirm the hydrator still hydrates its REMAINING state correctly
  (the round-trip for non-viewer fields is unbroken) and that `tsc --noEmit` is
  clean across the app with no dangling reference to the dropped slots.

## 7. Update affected test files (~4)

- [ ] `middleware/src/db/mysqlRepository.test.ts` — drop the viewer-column
  migration-probe assertions (`viewer_history_json` / `viewer_overlays_json` /
  `viewer_workspace_json` ADD/probe expectations) superseded by the task-1 guard.
- [ ] `middleware/src/app.test.ts` + `middleware/src/apiRouteContract.test.ts`
  — drop the PATCH viewer-field cases / fixtures.
- [ ] `app/src/contexts/ChatStoreContext/ChatStoreServerHydrator.test.tsx` —
  drop the `viewerHistory` / `viewerOverlays` / `viewerWorkspace` fixtures and
  any viewer round-trip assertion.
- [ ] Sweep remaining stale viewer fixtures (`ChatStoreContext.test.tsx`,
  `CanvasOrchestratorContext.test.tsx`, `OnboardingShell.test.tsx`,
  `EntitySessionStoreContext` if present) — remove empty `viewerHistory: []` /
  `null` fixture fields so no test re-asserts the dropped contract.
- [ ] **Adversarial review:** grep the WHOLE repo (app + middleware, incl. ALL
  `*.test.ts`/`*.test.tsx` + fixtures) for ANY surviving `viewer_history_json` /
  `viewer_overlays_json` / `viewer_workspace_json` / `viewerHistory` /
  `viewerOverlays` / `viewerWorkspace` — the only permitted matches are the
  task-1 dead-column guard's negative assertions. Confirm no test was retargeted
  or weakened to pass (e.g. a viewer round-trip assertion silently deleted vs. a
  fixture field removed) — each touched test still asserts its remaining,
  intended behavior. Confirm no test now references a deleted symbol such that it
  fails to compile rather than fails to assert.

## 8. Spec delta

- [ ] In `specs/data-tier/spec.md`, retire (REMOVE) the `chat_sessions row
  SHALL persist the paired ViewerSession state` requirement.
- [ ] ADD the durable requirement: a persisted `chat_sessions` column SHALL
  have a live reader and a live writer, or be dropped (no write-only/dead
  columns), enforced by a dead-column grep guard.
- [ ] **Adversarial review:** run `openspec validate
  2026-05-31-viewer-history-column-drop --strict` and confirm the delta is well
  formed. Confirm the REMOVED requirement actually exists verbatim in the
  shipped/archived `specs/data-tier/spec.md` (a REMOVE of a non-existent
  requirement is a no-op delta) and that the ADDED requirement is enforced by a
  REAL guard that exists in code (the task-1 dead-column guard), not aspirational
  spec text with no enforcement. Confirm the new requirement's wording matches
  what the guard actually checks (reader + writer presence), not a stronger claim.

## Closeout

- [ ] Confirm the task-1 dead-column grep guard is now GREEN.
- [ ] `npm run build` clean (app tsc + vite; middleware tsc).
- [ ] Middleware + app test suites green (file-serial middleware vitest).
- [ ] Drift guards green (no-hardcoded-styles, widget-contract, tool-quality).
- [ ] `openspec validate 2026-05-31-viewer-history-column-drop --strict` passes.
- [ ] Mark `2026-05-31-core-data-followups` §4 #17 fully DONE (the `viewer_*`
  half closed here); archive this change.
