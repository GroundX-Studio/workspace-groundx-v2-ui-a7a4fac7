# Tasks — Drop the write-NULL-only viewer_* chat_sessions columns

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

## 3. Remove INSERT / SELECT / parse references

- [ ] Remove the three columns from the `upsertChatSession` INSERT column list,
  the `VALUES(...)` ON DUPLICATE KEY clause, and the `JSON.stringify` arg binds
  (`mysqlRepository.ts:424-450`).
- [ ] Remove the three columns from the `listChatSessions` SELECT
  (`mysqlRepository.ts:462-475`).
- [ ] Remove `viewerHistory` / `viewerOverlays` / `viewerWorkspace` from
  `rowToChatSession` (`mysqlRepository.ts:805-807`).

## 4. Remove the PATCH-route viewer-field validation

- [ ] Remove the `viewerHistory` / `viewerOverlays` / `viewerWorkspace` body
  keys, the `hasViewer*` `hasOwnProperty` detection, the per-field validation
  branches, and the viewer keys in the persisted record from the chat-sessions
  PATCH handler (`app.ts:662-767`).
- [ ] Remove the viewer-slot defaults from the ensure-create path
  (`app.ts:507-509`).

## 5. Remove viewer fields from type + client contracts

- [ ] Remove `viewerHistory` / `viewerOverlays` / `viewerWorkspace` from
  `ChatSessionRecord` in `middleware/src/types.ts` (+ the doc comment block).
- [ ] Remove the viewer fields from the app `chatSessionPatch` request
  input/body shape (`app/src/api/chatSessionPatch.ts`).
- [ ] Remove the viewer fields from the `chatSessionsList` response row shape
  (`app/src/api/chatSessionsList.ts`).

## 6. Remove the hydrate read path

- [ ] Remove the `hydrateViewer` viewer-slot read/population so the
  `ChatStoreServerHydrator` no longer reads the dropped fields; remove the
  now-unused viewer plumbing in `ChatStoreContext` that was fed only by it.

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

## 8. Spec delta

- [ ] In `specs/data-tier/spec.md`, retire (REMOVE) the `chat_sessions row
  SHALL persist the paired ViewerSession state` requirement.
- [ ] ADD the durable requirement: a persisted `chat_sessions` column SHALL
  have a live reader and a live writer, or be dropped (no write-only/dead
  columns), enforced by a dead-column grep guard.

## Closeout

- [ ] Confirm the task-1 dead-column grep guard is now GREEN.
- [ ] `npm run build` clean (app tsc + vite; middleware tsc).
- [ ] Middleware + app test suites green (file-serial middleware vitest).
- [ ] Drift guards green (no-hardcoded-styles, widget-contract, tool-quality).
- [ ] `openspec validate 2026-05-31-viewer-history-column-drop --strict` passes.
- [ ] Mark `2026-05-31-core-data-followups` §4 #17 fully DONE (the `viewer_*`
  half closed here); archive this change.
