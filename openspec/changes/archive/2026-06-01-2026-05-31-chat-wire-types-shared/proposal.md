# Single-source the chat wire contract onto @groundx/shared

## Why

The `/api/chat/*` request/response contract is declared TWICE — once on
the app (`api/chatSessions.ts`: `ChatReply` / `ChatReplyDebug` /
`ChatDispatchedIntent` / `ChatToolFailure` / `CreateChatSessionResult` /
`scopeHint`) and once on the middleware (`services/chatRouterTypes.ts`:
`ChatRouterResponse` / `ChatRouterDebug` / `DispatchedIntent` /
`ToolFailure`) — as hand-mirrored byte-twins that nothing forces to agree.
That is exactly the drift hazard step 2-7g of `core-data-followups` already
closed for the proposal-envelope pair (`ProposedSchemaField` /
`ProposalEnvelopeProvenance`) by single-sourcing the shape on
`@groundx/shared` z.infer and pinning the twin with a compile-time `Eq<>`
assert that is load-bearing under `npm run build`. This change applies the
same proven mechanism to the rest of the chat envelope plus the adjacent
twins flagged LOW in that change's §4b: the inline `_debug.scope` (which
should derive from the shared `ContentScope`), a shared `Source` union
behind the 7× `["user","agent","tour","system"]` enum (with `IntentSource =
Exclude<Source,"system">`), `AppUserMetadata`, `SchemaFieldExtractionResult`,
and the two customer-auth client modules. Each twin is behaviour-preserving
(a source-of-truth move, not a logic change) and each is pinned with an
`Eq<>` guard so the wire halves can no longer silently diverge.

## What Changes

- Single-source the chat envelope onto `@groundx/shared` (z.infer): the app
  `ChatReply` / `ChatReplyDebug` / `ChatDispatchedIntent` / `ChatToolFailure`
  and the middleware `ChatRouterResponse` / `ChatRouterDebug` /
  `DispatchedIntent` / `ToolFailure` become re-exports of one shared schema
  pair; local names (`ChatReply`, `ChatRouterResponse`, …) are kept as
  aliases so no consumer churns.
- Single-source `CreateChatSessionResult` and the `SendChatMessageInput.scopeHint`
  shape onto `@groundx/shared`.
- Derive the inline `_debug.scope` on BOTH `ChatReplyDebug.scope` and
  `ChatRouterDebug.scope` from the shared `ContentScope` (LOW debug-scope
  twin) — stop re-declaring the `{type,bucketId,groupId,documentIds,filter}`
  literal on each side.
- Introduce one shared `Source` z.enum (`["user","agent","tour","system"]`)
  behind the 7× duplicated source literal (middleware `viewerEventSourceSchema`
  + `intentLogSourceSchema`, app `ChatStoreContext` / `intentLog` /
  `viewerEvents` event-source, the `app.ts` allow-sets). Derive `IntentSource =
  Exclude<Source,"system">` so the app `CanvasOrchestratorContext.IntentSource`
  (`"user"|"agent"|"tour"`) single-sources off the same union.
- Single-source `AppUserMetadata` and the two customer-auth client modules
  (`api/entities/customerEntity.ts`, `api/entities/partnerCustomerEntity.ts`)
  onto `@groundx/shared` — reconciling the documented app-vs-middleware field
  divergence (app declares a subset; the shared shape makes the optional
  fields explicit so each side narrows from one source).
- Single-source `SchemaFieldExtractionResult` (app `ChatStoreContext`) onto
  `@groundx/shared`.
- Each folded twin ships a compile-time `Eq<Local, Shared>` drift guard
  (load-bearing under app `npm run build` via tsc; mirrored under middleware
  tsc) plus a runtime Zod `validate` at each parse boundary, following the
  precedent established in `chatSessions.test.ts`.
- **DEFERRED — cross-plan dependency:** the X-Ray response-shape twin
  (`documentPages[].number` vs `.page` vs `pageNumber`, declared in middleware
  `citationGeometry.ts` and app `groundxDocumentsEntity.ts`) is SHARED
  OWNERSHIP with `2026-05-29-wf05b-word-level-geometry` (its `tasks.md`/`proposal.md`
  both flag it). This change does NOT touch that twin — it is folded by wf05b
  to avoid a double-fix / merge collision on `citationGeometry.ts`.
- **DEFERRED — cross-plan dependency:** the WF-03 page-dim shape (middleware
  `PageDim` `{number,width,height}`) is part of the same `citationGeometry.ts`
  surface wf05b owns; it is co-deferred with the X-Ray twin above, not
  folded here.
