# Drop the write-NULL-only viewer_* chat_sessions columns

## Why

This closes the remaining `viewer_*` half of `2026-05-31-core-data-followups`
§4 #17 ("each persist chain gets a reader+writer or is DROPPED"). The
`chat_messages` half (`tool_calls_json` / `attachments_json`) already shipped
in that change's step 2-7g: both were dead/write-only, so they were dropped
behind a dead-column grep guard rather than given a speculative reader. The
`viewer_*` half was scoped out as the larger drop and left honestly open.

The three `chat_sessions` JSON columns `viewer_history_json` /
`viewer_overlays_json` / `viewer_workspace_json` are **write-NULL-only**. The
full persist chain physically exists end-to-end — DDL
(`mysqlRepository.ts:125-127`), an idempotent `information_schema`-probed ALTER
migration (`mysqlRepository.ts:288-321`), the `upsertChatSession` INSERT
(`424-450`), the `listChatSessions` SELECT + `rowToChatSession` parse
(`462-475`, `805-807`), the PATCH-route validation
(`app.ts:662-767`), the `chatSessionPatch` / `chatSessionsList` client field
contracts, and the `ChatStoreServerHydrator` read path — but **nothing ever
writes a non-null value into them**. The app mutators (ChatStore
`patchPayloads`) only ever PATCH `activeEntityKey` / `currentIntent`, never the
viewer slots. So the columns are always NULL on reload: dead plumbing dressed
as a live feature.

**Decision: DROP the three columns (default), do NOT wire a viewer PATCH.**
This follows the `attachments_json` / `tool_calls_json` precedent already
shipped in core-data-followups step 2-7g: a write-only/dead column is removed,
not propped up with a new reader/writer.

**Rejected alternative — wire a real viewer-state PATCH so reload restores the
viewer.** Rejected because nothing currently consumes persisted viewer state,
and adding a viewer PATCH + the client mutator that produces it is **new
product behavior** (viewer round-trip across refresh), out of scope for a
dead-plumbing closeout. The durable `chat_sessions row SHALL persist the paired
ViewerSession state` spec requirement that authorized this plumbing described a
Phase-1 feature that was never wired to a writer; we retire that requirement
here. If the product later wants viewer-state persistence, that is its own
change with its own failing-first round-trip test — it can re-add the columns
under a requirement that ships with a live writer.

The drop is **behavior-preserving**: the columns were write-NULL-only, so no
reader loses data — every hydrate already saw `null` and mapped it to the empty
default.

## What Changes

1. **Add the dead-column grep guard (failing-first).** Extend
   `middleware/src/db/mysqlRepository.test.ts` (next to the existing
   `tool_calls_json` / `attachments_json` guard from §4 #17) with a case
   asserting the assembled DDL + the `chat_sessions` INSERT + SELECT statements
   mention none of `viewer_history_json` / `viewer_overlays_json` /
   `viewer_workspace_json`. RED while the columns stand, GREEN after the drop;
   fires loudly if any of the three is reintroduced.

2. **Drop the three columns + their ALTER migration.** Remove the three
   `viewer_*_json` lines from the `chat_sessions` CREATE TABLE, and remove the
   dedicated idempotent ALTER block (the `information_schema` existence probe +
   the three `ADD COLUMN` clauses, `mysqlRepository.ts:288-321`). Keep a
   migration test proving both boot paths still succeed against the reduced
   schema: a **fresh boot** (CREATE TABLE has no viewer columns) and an
   **existing-DB upgrade** (an older DB that has the viewer columns is left
   untouched — the drop does not error; dropping the now-unused columns is
   optional cleanup, not required for correctness, and a residual column is
   harmless because nothing writes it).

3. **Remove the INSERT / SELECT / parse references.** Remove the three columns
   from the `upsertChatSession` INSERT column list + `VALUES(...)` ON
   DUPLICATE clause + the `JSON.stringify` arg binds, from the
   `listChatSessions` SELECT column list, and the `viewerHistory` /
   `viewerOverlays` / `viewerWorkspace` keys from `rowToChatSession`.

4. **Remove the PATCH-route viewer-field validation.** Remove the
   `viewerHistory` / `viewerOverlays` / `viewerWorkspace` body keys, their
   `hasOwnProperty` detection, their per-field validation branches, and their
   inclusion in the persisted record from the chat-sessions PATCH handler
   (`app.ts:662-767`).

5. **Remove the viewer fields from the type + client contracts.** Remove
   `viewerHistory` / `viewerOverlays` / `viewerWorkspace` from
   `middleware/src/types.ts` `ChatSessionRecord`, from the app
   `chatSessionPatch` request input/body shape, and from the
   `chatSessionsList` response row shape.

6. **Remove the hydrate read path.** Remove the viewer-slot read/population
   from the `ChatStoreServerHydrator` (`hydrateViewer`) so the hydrator no
   longer reads the dropped fields.

7. **Update the affected test files** (~4) to drop the now-stale `null` /
   empty viewer fixtures and the migration-probe assertions that referenced the
   viewer columns: `mysqlRepository.test.ts`, `app.test.ts` /
   `apiRouteContract.test.ts`, `ChatStoreServerHydrator.test.tsx`, and any
   `ChatStoreContext` / `OnboardingShell` fixtures carrying empty viewer slots.

8. **Retire the durable spec requirement** `chat_sessions row SHALL persist the
   paired ViewerSession state` (it authorized never-wired plumbing) and add a
   durable anti-dead-column requirement: a persisted `chat_sessions` column
   SHALL have a live reader and a live writer, or be dropped.
