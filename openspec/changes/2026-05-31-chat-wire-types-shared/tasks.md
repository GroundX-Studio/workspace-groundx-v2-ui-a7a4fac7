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
> **TDD: failing test first, then implement, then adversarial review before
> marking done. Adversarial review gate after EVERY task (Discipline §10)** — a
> task is not `[x]` until an adversarial review of its output against the plan
> AND the real code passes, run before marking done and before the next task.
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
- [ ] **Adversarial review:** grep app + middleware for any surviving local
      re-declaration of `ChatReply` / `ChatRouterResponse` / `DispatchedIntent` /
      `ToolFailure` (only re-export aliases may remain); confirm BOTH the app-side
      and middleware-side `Eq<>` guards actually fire by forking one app field to a
      mismatch and observing `tsc`/`npm run build` fail, then revert; confirm the
      runtime `chatReplySchema` accepts the real reply fixture byte-for-byte
      (`tools[]`/`intents[]`/`toolFailures[]`/`proposedSchemaField`/`_debug?`) and
      no field was dropped/renamed — behaviour unchanged, no runtime shape change.

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
- [ ] **Adversarial review:** confirm the LOW debug-scope twin is actually closed —
      grep both sides for the re-declared `{type,bucketId,groupId,documentIds,filter}`
      scope literal and verify it is GONE (scope now resolves to the shared
      `ContentScope`); confirm the `Eq<ChatReplyDebug, SharedChatReplyDebug>` guard
      fires by forking the `scope`/`mode`/`groundx`/`llm` shape to a mismatch →
      `tsc` fails → revert; exercise `chatReplyDebugSchema` against a fixture whose
      `scope` is a real `ContentScope` variant; behaviour unchanged.

## C. Create-session result + scopeHint

- [ ] **Failing guard first:** add `Eq<CreateChatSessionResult, SharedCreateChatSessionResult>`
      + an `Eq<>` for the `scopeHint` shape to `chatSessions.test.ts` (red) +
      a runtime validate on each.
- [ ] Add `createChatSessionResultSchema` and `chatScopeHintSchema` to
      `@groundx/shared`; replace the app declarations (and the middleware
      `ChatRouterRequest.scopeHint` field) with the shared type.
- [ ] Runtime validate `CreateChatSessionResult` at the `POST /api/chat-sessions`
      response boundary. Suites green.
- [ ] **Adversarial review:** grep for any surviving local `CreateChatSessionResult`
      or inline `scopeHint` shape on app or middleware (incl. the middleware
      `ChatRouterRequest.scopeHint` field — confirm it now references the shared
      `chatScopeHintSchema` type, not a re-fork); confirm the `Eq<>` guards for BOTH
      `CreateChatSessionResult` and `scopeHint` fire by forking each to a mismatch →
      `tsc` fails → revert; exercise both runtime validates against real fixtures;
      behaviour unchanged.

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
- [ ] **Adversarial review:** count the source-enum declarations BEFORE and AFTER —
      all 7 event-source enum sites + the `IntentSource` site must now derive from
      the one `sourceSchema` (grep for surviving `["user","agent","tour","system"]`
      / `viewerEventSourceSchema` / `intentLogSourceSchema` / `*_FALLBACK` re-forks
      and confirm they delegate, not redefine); confirm the `Source.options`
      deep-equals test fires by adding a bogus enum member → test fails → revert;
      confirm `IntentSource` actually excludes `"system"` (a literal `"system"` in an
      intent-source position must fail `tsc`); behaviour unchanged.

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
- [ ] **Adversarial review:** confirm the subset/superset claim holds — every
      app-narrowed field is genuinely OPTIONAL in the shared schema and the app
      still compiles consuming only `groundxUsername?`/`onboardingState?` while
      middleware sees all 7; grep both sides for a surviving local `AppUserMetadata`
      interface (only re-exports may remain); fire the app + middleware `Eq<>` guards
      by forking a field's optionality → `tsc` fails → revert; exercise
      `appUserMetadataSchema` over a real session-metadata fixture; behaviour unchanged.
- [ ] Single-source the two customer-auth client modules
      (`api/entities/customerEntity.ts`, `api/entities/partnerCustomerEntity.ts`):
      move their shared request/response wire shapes (login/register/auth
      response + partner credentials/profile) onto `@groundx/shared` schemas
      where a middleware mirror exists; add `Eq<>` guards. Runtime validate at
      the auth response parse boundary. Suites green.
- [ ] **Adversarial review:** verify the axis is EARNED per shape — only fold a
      request/response shape that has a real middleware mirror (no dormant shared
      schema with a single consumer); confirm NO secret-bearing field leaks into the
      shared schema or a committed fixture (Partner API `*username` values stay out —
      see the never-commit-secrets lock); fire each new `Eq<>` guard by forking →
      `tsc` fails → revert; exercise the auth-response runtime validate against a
      sanitized fixture; grep for a surviving local copy of any folded wire shape;
      behaviour unchanged.

## F. SchemaFieldExtractionResult

- [ ] **Failing guard first:** add `Eq<SchemaFieldExtractionResult,
      SharedSchemaFieldExtractionResult>` in the `ChatStoreContext` test (red)
      + a runtime `schemaFieldExtractionResultSchema` validate.
- [ ] Add `schemaFieldExtractionResultSchema` to `@groundx/shared`; replace the
      app `SchemaFieldExtractionResult` declaration (`ChatStoreContext/types.ts`)
      with a re-export so `ChatStoreContext.tsx` + `SchemaView.tsx` consume the
      shared type. Suites green.
- [ ] **Adversarial review:** confirm BOTH real consumers (`ChatStoreContext.tsx`
      AND `SchemaView.tsx`) now resolve `SchemaFieldExtractionResult` to the shared
      type and that no local declaration survives (grep); fire the `Eq<>` guard by
      forking a field → `tsc` fails → revert; exercise
      `schemaFieldExtractionResultSchema` against a real extraction-result fixture;
      behaviour unchanged.

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
