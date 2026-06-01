# Single-source the chat wire contract onto @groundx/shared — Tasks

> **Execution mode: → SEQUENTIAL/TDD, fold-per-twin.** Each twin is an
> independent source-of-truth move: write the failing guard first (extend the
> `Eq<>` assert + a runtime Zod `validate`), then add the shared schema, then
> replace both local declarations with re-exports, then prove green. Behaviour
> is preserved at every step — these are type moves, not logic changes. The
> precedent is the proposal-envelope fold in `chatSessions.test.ts`
> (`core-data-followups` step 2-7g): a compile-time
> `Eq<Local, Shared>` that fails `npm run build` if a side re-forks.
>
> **Cross-plan dependency (DO NOT double-fix here):** the X-Ray response-shape
> twin (`documentPages[].number`/`.page`/`pageNumber`) AND the WF-03 `PageDim`
> shape both live in `citationGeometry.ts`, which `2026-05-29-wf05b-word-level-geometry`
> owns and re-authors. Those two twins are DEFERRED to wf05b. This change must
> not edit `citationGeometry.ts`'s page/X-Ray shapes — sequence after wf05b or
> leave that file's geometry shapes alone.

## A. Chat reply envelope twin (ChatReply ↔ ChatRouterResponse)

- [ ] **Failing guard first:** in `app/src/api/chatSessions.test.ts`, add
      `Eq<ChatReply, SharedChatReply>` + `Eq<ChatDispatchedIntent,
      SharedDispatchedIntent>` + `Eq<ChatToolFailure, SharedToolFailure>`
      asserts (red — shared types absent) plus a runtime
      `chatReplySchema.safeParse(...)` over a representative reply fixture.
- [ ] Add `chatReplySchema` / `dispatchedIntentSchema` / `toolFailureSchema`
      to `@groundx/shared` (z.infer types `ChatReply` / `DispatchedIntent` /
      `ToolFailure`), reusing the shared `Citation` / `SuggestedAction` /
      `ProposedSchemaField` already there. The `tools[]`, `intents[]`,
      `toolFailures[]`, `proposedSchemaField`, `_debug?` fields match the
      current twin byte-for-byte.
- [ ] Replace the app `ChatReply` / `ChatDispatchedIntent` / `ChatToolFailure`
      interfaces with re-exports (keep the local names as aliases) in
      `chatSessions.ts`.
- [ ] Replace the middleware `ChatRouterResponse` / `DispatchedIntent` /
      `ToolFailure` interfaces with re-exports (keep local names) in
      `chatRouterTypes.ts`; add the parallel `Eq<>` middleware-side guard in an
      existing middleware test that imports both.
- [ ] Runtime validate at the parse boundary: the `/api/chat/messages` route
      handler (or `sendChatMessage` client) validates the reply against
      `chatReplySchema` before returning/consuming. App + middleware suites green.

## B. Debug payload + debug-scope twin (ChatReplyDebug ↔ ChatRouterDebug)

- [ ] **Failing guard first:** add `Eq<ChatReplyDebug, SharedChatReplyDebug>`
      to `chatSessions.test.ts` (red) + a runtime `chatReplyDebugSchema`
      validate over a debug fixture whose `scope` is a real `ContentScope`.
- [ ] Add `chatReplyDebugSchema` to `@groundx/shared` with its `scope` field
      typed as the shared `ContentScope` (NOT the re-declared
      `{type,bucketId,groupId,documentIds,filter}` literal) — this closes the
      LOW debug-scope twin.
- [ ] Replace app `ChatReplyDebug` and middleware `ChatRouterDebug` with
      re-exports; the `mode` / `groundx` / `llm` fields match the current twin.
- [ ] Confirm the dev-console logger in `sendChatMessage` (`result.reply._debug.scope`)
      and the middleware writer both compile against the `ContentScope`-typed
      scope. Suites green.

## C. Create-session result + scopeHint

- [ ] **Failing guard first:** add `Eq<CreateChatSessionResult, SharedCreateChatSessionResult>`
      + an `Eq<>` for the `scopeHint` shape to `chatSessions.test.ts` (red) +
      a runtime validate on each.
- [ ] Add `createChatSessionResultSchema` and `chatScopeHintSchema` to
      `@groundx/shared`; replace the app declarations (and the middleware
      `ChatRouterRequest.scopeHint` field) with the shared type.
- [ ] Runtime validate `CreateChatSessionResult` at the `POST /api/chat-sessions`
      response boundary. Suites green.

## D. Shared Source union (7× event-source enum + IntentSource)

- [ ] **Failing guard first:** add a runtime test asserting
      `sourceSchema.options` deep-equals `["user","agent","tour","system"]`
      and a compile-time `Eq<IntentSource, Exclude<Source,"system">>` (red —
      shared `Source` absent).
- [ ] Add `sourceSchema = z.enum(["user","agent","tour","system"])` + type
      `Source` to `@groundx/shared`, and derive a `intentSourceSchema` /
      `IntentSource = Exclude<Source,"system">`.
- [ ] Replace middleware `viewerEventSourceSchema` + `intentLogSourceSchema`
      (and their `*_FALLBACK` consts) with the shared `sourceSchema`; replace
      the `app.ts` allow-sets to derive from `sourceSchema.options`.
- [ ] Replace the app event-source literals in `ChatStoreContext/types.ts`,
      `api/intentLog.ts`, `api/viewerEvents.ts` with the shared `Source`, and
      single-source `CanvasOrchestratorContext.IntentSource` off
      `Exclude<Source,"system">`. Add `Eq<>` guards on both app + middleware
      sides. Suites green.

## E. AppUserMetadata + customer-auth client modules

> Note: the app `AppUserMetadata` (`groundxUsername?`, `onboardingState?`) is a
> documented SUBSET of the middleware shape (7 fields). The shared schema makes
> every non-core field OPTIONAL so each side narrows from ONE source rather
> than maintaining two divergent shapes.

- [ ] **Failing guard first:** add `Eq<AppUserMetadata, SharedAppUserMetadata>`
      on both the app (`customerEntity.test.ts`) and middleware sides (red) +
      a runtime `appUserMetadataSchema` validate.
- [ ] Add `appUserMetadataSchema` to `@groundx/shared` (all session-metadata
      fields optional except `groundxUsername`); replace the app + middleware
      `AppUserMetadata` declarations with re-exports.
- [ ] Single-source the two customer-auth client modules
      (`api/entities/customerEntity.ts`, `api/entities/partnerCustomerEntity.ts`):
      move their shared request/response wire shapes (login/register/auth
      response + partner credentials/profile) onto `@groundx/shared` schemas
      where a middleware mirror exists; add `Eq<>` guards. Runtime validate at
      the auth response parse boundary. Suites green.

## F. SchemaFieldExtractionResult

- [ ] **Failing guard first:** add `Eq<SchemaFieldExtractionResult,
      SharedSchemaFieldExtractionResult>` in the `ChatStoreContext` test (red)
      + a runtime `schemaFieldExtractionResultSchema` validate.
- [ ] Add `schemaFieldExtractionResultSchema` to `@groundx/shared`; replace the
      app `SchemaFieldExtractionResult` declaration (`ChatStoreContext/types.ts`)
      with a re-export so `ChatStoreContext.tsx` + `SchemaView.tsx` consume the
      shared type. Suites green.

## Closeout

- [ ] `openspec validate 2026-05-31-chat-wire-types-shared --strict` prints valid.
- [ ] Adversarial review per twin: each `Eq<>` guard VERIFIED to fire (fork the
      local type → tsc fails → revert); every runtime validate exercised by a
      red-first test; no shared schema is dormant (every shared type has both a
      real app + middleware consumer — axis earned per twin).
- [ ] App suite green; middleware suite green (file-serial vitest).
- [ ] `npm run build` clean in app + middleware + `@groundx/shared` (the `Eq<>`
      guards are load-bearing under app tsc).
- [ ] Confirm `citationGeometry.ts` page/X-Ray shapes were NOT touched (the
      X-Ray + `PageDim` twins remain deferred to wf05b).
- [ ] Archive `2026-05-31-chat-wire-types-shared`.
