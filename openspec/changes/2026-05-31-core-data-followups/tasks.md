# Tasks — core data-model hardening: remaining refactors

> Every item is tracked here so none reverts to a silent placeholder/hack. Each lands behind green
> tests, no user-visible regression. WIP cap = 3 in flight. TDD: failing test first, then implement,
> then adversarial review before marking done.
>
> **Authoring order rule:** the recurrence drift-guards (§5) are authored AFTER the bases they guard
> exist (a `*Error`-base guard presupposes the `ApiError` base; a placeholder guard presupposes the
> typed contexts). §6 (the DB drop) is SOAK-GATED — not ready until a release after the `templates`
> migration; it stays an open ticket, never advanced past gated.

## 1. Split chatRouter.ts
**Execution: → SEQUENTIAL.** Behavior-preserving refactor of a single 1637-line file — cannot be
safely parallelized. One hand, tests green after each extraction.

- [x] **Failing/guard test:** lock the public surface of `chatRouter.ts` (exported entry points +
  observable behavior) with the existing `chatRouter.test.ts` suite green as the regression baseline
  BEFORE moving any code. — DONE: new `chatRouter.split.test.ts` asserts each sub-module exists +
  `chatRouter.ts` re-exports the SAME bindings (`===` identity); failed red before extraction (modules
  absent), green after. Existing `chatRouter.test.ts` (90 tests) kept unchanged as the behavior baseline.
- [x] Extract the **wire types** into their own module; re-export from `chatRouter.ts`. tsc + tests green.
  — DONE: `chatRouterTypes.ts` (request/response/debug/deps types, `proposalEnvelopeV1Schema`,
  `ChatRouteNotImplementedError`, `GroundXSearchResult`, shared tuning constants).
- [x] Extract the **deterministic classifier** into its own module. tsc + tests green. — DONE:
  `chatClassifier.ts` (`classifyChatMode`).
- [x] Extract **`searchGroundX` + `composeFilters`** into their own module. tsc + tests green. — DONE:
  `groundxSearch.ts` (`searchGroundX`, `composeFilters`, `SearchGroundXOptions`).
- [x] Extract the **RAG pipeline** (`runRagPipeline`/`callGroundedLlm`/`parseGroundedAnswer`/
  `buildSnippetBlock`) into its own module. tsc + tests green. — DONE: `ragPipeline.ts`. Live seams
  preserved verbatim: server-side role filter (`toolsForStep(activeStepKind, callerRole)`), word-level
  `assignTier(v, { hasAtomBox })` + `wordMapFetch`, inline `ContentScope` derivation.
- [x] Extract the **mocks** into their own module. tsc + tests green. — DONE: `chatMocks.ts`
  (`mockResponseFor` + per-scenario fixtures).
- [x] Adversarial review: `chatRouter.ts` is now a thin composition; no behavior change; full
  middleware suite + app suite green. — DONE: `chatRouter.ts` 1698→150 lines (entry `routeChat` +
  re-export barrel). Verified no test weakened/retargeted (chatRouter.test.ts 90 / chatHandler.test.ts 36
  / structuredHandler.test.ts 27 all unchanged + green); middleware suite 649 green, app suite 1414 green,
  middleware tsc clean, app `npm run build` (tsc+vite) clean, `openspec validate --strict` clean.

## 2. Shared ApiError base + 7-error refactor
**Execution: ◑ MIXED.** Author the base `ApiError` SEQUENTIAL (the contract). Refactoring the 7
hand-rolled errors onto it is ⟲ WORKFLOW-OK once the base lands — each error in its own file,
independent, against a fixed base.

- [x] **Failing test:** assert a base `ApiError extends Error` exists with `status` + `detail`, and
  that an instance is `instanceof Error` + `instanceof ApiError`. — DONE: new
  `middleware/src/services/apiError.test.ts` asserts the base shape + that each middleware `*Error` is
  `instanceof ApiError` + preserves its observable envelope (`.statusCode`/`.status`/`.upstreamStatus`/
  `.mode`). Failed red (ApiError absent), green after.
- [x] Introduce the base `ApiError extends Error` (`status`, `detail`). — DONE: added to
  `@groundx/shared` (`shared/src/index.ts`) — isomorphic plain class, `readonly status`/`detail`,
  `detail` optional, `Object.setPrototypeOf(this, new.target.prototype)` so `instanceof` survives.
- [x] Refactor app errors onto it: `ExtractFieldApiError`, `TemplateApiError`, `ChatApiError`,
  `SmartReportApiError`. — DONE: all four now `extends ApiError`, call `super(message, status, detail)`,
  set only `this.name`; their own `status`/`detail` field declarations removed. (`SmartReportApiError`
  in `app/src/api/smartReport.ts` was missed in the first pass — it predates §2, created by the archived
  `2026-05-29-smart-report-screen` change — and swept here: new `instanceof ApiError` test in
  `smartReport.test.ts` failed red, then green after the refactor; its live consumer
  `SmartReportBuilder.tsx:257` reads `.status` unchanged.) Existing error-path tests unchanged + green.
- [x] Refactor middleware errors onto it: `ChatHandlerError`, `ChatRouteNotImplementedError`,
  `UpstreamHttpError`, `UpstreamTimeoutError`. — DONE: all four `extends ApiError`. `ChatHandlerError`
  keeps `.statusCode` as a getter aliasing base `.status` (route reads it). `ChatRouteNotImplementedError`
  passes `status:501`, keeps `.mode`. Upstream errors pass `status` to super, keep `.upstreamStatus`
  (mirror) for the global handler payload. Envelope unchanged.
- [x] Adversarial review: every `*Error` extends the base; no error class declares its own `status`/
  `detail` fields; suites green both sides. — DONE (re-verified after the SmartReportApiError sweep):
  all 8 hand-rolled errors extend `ApiError` with real non-test throw-sites — app: ExtractFieldApiError,
  TemplateApiError, ChatApiError, SmartReportApiError (smartReport.ts:159 & :236, consumed at
  SmartReportBuilder.tsx:257); middleware: ChatHandlerError×9, NotImplemented×1, UpstreamHttp via
  `upstreamError()` helper w/ 2 callers, UpstreamTimeout×1 — none dormant. CORRECTION to the prior note:
  an earlier completion claim asserted "only the base declares status/detail fields" — that was FALSE.
  `grep -rn '^\s*status:' app/src/api/*.ts` had surfaced `smartReport.ts:36` (`status: number;`) and
  `detail:` at `:37` — real class-field declarations on a then-`extends Error` subclass, not ctor
  params/getters. Those fields are now removed (the class extends `ApiError` and defers to `super`), so the
  acceptance criterion "no error class declares its own status/detail fields" now holds across the codebase.
  Re-ran: middleware 653 + app 1414+ suites green (error-path tests unchanged, not retargeted); middleware
  tsc clean; app `npm run build` (tsc+vite) clean; `openspec validate --strict` clean.

## 3. Entity CRUD factory + 8-context factory + SdkActionResult union
**Execution: ◑ MIXED.** Author `SdkActionResult<T>`, `createEntityClient<T>()`, `createEntityContext<T>()`
SEQUENTIAL (the factory contracts). Migrating the ~30 `api/entities/*` wrappers + the 8 contexts onto
them is ⟲ WORKFLOW-OK once the factories land — independent per file, fixed factory.

- [x] **Failing test:** the `{ isSuccess: false; response: null; error: null }` limbo no longer
  type-checks; an `isSuccess:true` value exposes `response` and an `isSuccess:false` value exposes
  `error` (discriminated-union narrowing). — DONE: new `contexts/sdkContextTypes.test.ts` — two
  `@ts-expect-error` cases (the `{isSuccess:false;response:null;error:null}` limbo + a success with
  `response:null`) plus runtime narrowing asserts. Failed red first (`sdkSuccess`/`sdkFailure` absent),
  green after. The `@ts-expect-error` cases are load-bearing under `npm run build` (tsc): if the limbo
  ever re-typechecked, tsc flags the directive UNUSED and the build fails.
- [x] Define `SdkActionResult<T>` as a discriminated union
  (`{isSuccess:true;response:T} | {isSuccess:false;error}`). — DONE: `contexts/sdkContextTypes.ts` now
  `type SdkActionResult<T> = {isSuccess:true; response:T; error?:undefined} | {isSuccess:false;
  response:null; error:NonNullable<unknown>}`. Failure keeps `response:null` so the many callers that
  read `result.response` without narrowing (Extract.tsx, useLiveExtractionSchema, PdfViewerWidget,
  AppInitialization) still compile, AND the existing context failure-path tests that assert
  `toMatchObject({isSuccess:false, response:null})` stay green unchanged. The old mutable
  `createSdkResult()` builder (which produced the limbo) is REPLACED by `sdkSuccess(response)` /
  `sdkFailure(error)` constructors — zero `createSdkResult` references remain.
- [~] Author `createEntityClient<T>()` (api) over `SdkActionResult<T>`. — DELIBERATELY NOT BUILT
  (earn-every-axis GUARDRAIL, project_anti_overengineering). The ~30 `api/entities/*` wrappers do NOT
  share an `SdkActionResult` shape — they are 4-7-line thin axios calls returning RAW response bodies
  (`BucketResponse`/`GroupResponse`/`MessageResponse`/…). Their only common core is
  `(await axios.<verb>(url, ...args)).data`; they vary on EVERY other axis (verb · url-template ·
  request body · response-unwrap key · groundx-vs-partner config builder · pagination · path-encoding)
  and many carry genuinely-bespoke methods (`addBucketToGroundXGroup`, `attachBucketToPartnerProject`,
  `customerEntity` x-jwt-token header extraction, `documentsEntity` ingest/crawl/copy). A
  `createEntityClient<T>()` generating uniform list/create/get/update/delete would need per-method
  config objects LONGER than the current one-liners and could not cover the bespoke methods — a forced
  abstraction with awkward escape hatches, the exact pattern the GUARDRAIL forbids. Kept the concrete
  wrappers; noted here rather than orphaning a one-true-shape abstraction.
- [x] Author `createEntityContext<T>()` (context) over `SdkActionResult<T>`. — DONE:
  `contexts/createEntityContext.tsx` exports (1) `useSdkRunner(defaultErrorMessage)` — the context-side
  runner that BUILDS an `SdkActionResult<T>` (so the limbo can't be hand-constructed at a call-site),
  replacing the byte-identical `run = useCallback(...)` helper that lived in 6 providers + the inlined
  twins in Search/Health; (2) `createContextHook(Context, msg)` — replacing the duplicated
  `useContext; if(!c) throw; return c;` hook body in 8 context `index.tsx` files. Both factories have
  ≥6 real consumers (axis earned). New `contexts/createEntityContext.test.tsx` (failing-first) covers
  success/failure/override + in-provider/out-of-provider.
- [~] Migrate the ~30 `api/entities/*` CRUD wrappers (list/create/get/update/delete) onto
  `createEntityClient<T>()`. ⟲ per-wrapper. — N/A: `createEntityClient<T>()` deliberately not built
  (see above). The concrete wrappers are unchanged and remain the source of truth; `entityCoverage.test.ts`
  (15) stays green.
- [x] Migrate the 8 hand-rolled CRUD contexts (Buckets/Documents/Groups/Projects/Workflows/ApiKeys/
  Search/Health) onto `createEntityContext<T>()`. ⟲ per-context. — DONE: all 8 providers now call
  `useSdkRunner("<entity> operation failed.")` instead of an inline `run`; Search/Health rewrote their
  inlined variants onto the runner (state-setting stays inside the `work` closure); all 8 `index.tsx`
  hooks now `createContextHook(...)` with byte-identical error messages. Existing `sdkContexts.test.tsx`
  (14) + the 6 per-provider `*Provider.test.tsx` suites stay green; only an INCIDENTAL `let
  actionResult: {isSuccess:boolean; error:unknown}` annotation in the 6 failure-path tests was widened
  to `{isSuccess:boolean; response?:unknown; error?:unknown}` to match the union (assertions untouched,
  not a retarget). NOTE on `run` signature: the old Buckets `run(work, errorMessage, successMessage)`
  arg order is unified to the runner's `(work, successMessage?, errorMessage?)`; the 6 Bucket call-sites
  that passed the redundant default error string were rewritten to pass only the success message —
  behavior identical (the explicit string equalled the default).
- [x] Route `AuthProvider`'s `{isSuccess, error}` two-boolean twin through `SdkActionResult<T>`. — DONE:
  `register`/`resetPassword`/`confirmChangingPassword`/`updateAppMetadata` now return
  `SdkActionResult<void>` and `getUserData` returns `SdkActionResult<User>`, built via
  `sdkSuccess`/`sdkFailure` (`AuthContext.tsx` interface + `AuthProvider.tsx` bodies). `login` keeps its
  distinct `LoginReqCallback` (has `banned`) — not a simple twin, left alone. This ELIMINATES the
  hand-rolled limbo in `register` (old code returned `{isSuccess:false, error:false}` when
  `api.register` returned falsy). Consumers verified behavior-preserving: Register.tsx (`if
  result.isSuccess`), ResetPassword.tsx (×2), OnboardingProvider (`if result.isSuccess`),
  AppInitialization (`if result.error || !result.response`). Their test mocks were updated to emit
  `SdkActionResult` values (`sdkSuccess`/`sdkFailure`) — AppInitialization.test, Home.test,
  OnboardingProvider.test — assertions unchanged.
- [x] Adversarial review: no hand-rolled CRUD wrapper/context remains off the factory; the limbo state
  is unrepresentable; app suite green. — DONE: zero `createSdkResult` references remain; zero inline
  `run = useCallback` helpers remain across the 8 contexts; all 8 `useXContext` hooks go through
  `createContextHook`; the `{isSuccess:false;response:null;error:null}` limbo + the hand-rolled
  `{isSuccess:false,error:false}` limbo in AuthProvider are both unrepresentable (tsc-enforced). EARNED:
  `SdkActionResult` (8 contexts + Auth + external readers), `useSdkRunner` (8 providers), `createContextHook`
  (8 hooks) — each ≥2 real consumers; `createEntityClient` deliberately not built (forced-abstraction
  guardrail, documented above). Gates: app suite 1424 green (existing tests unchanged, not retargeted),
  middleware suite 653 green (untouched), app `npm run build` (tsc+vite) clean, `openspec validate
  --strict` clean, widget-contract (164) + no-hardcoded-styles (72) + entityCoverage (15) guards green.

## 4. Type-unification + row-mapper validation + wire-types module + illegal-states unions

### 4a. Type-unification (⟲ WORKFLOW-OK once the target type is confirmed; drift guard stays green)
- [ ] **#12 field-type union → shared.** Failing test: a type-equality assert each former alias ===
  `TemplateFieldType`. Replace ~10 re-spellings of `"STRING"|"NUMBER"|"DATE"|"BOOLEAN"` (`api/
  extractField.ts`, `services/fieldExtractor.ts`, + 8 inline) with `TemplateFieldType` from
  `@groundx/shared`.
- [ ] **#13 `ExtractFieldResult` → shared** (the `/api/extract-field` body twin) + fold the 3rd
  `SuggestedAction` copy (`SuggestedActionChips.tsx`) onto the shared type with the chatSessions↔
  chatRouter pair.

### 4b. Wire-types module + description-level drift guard (◑ MIXED — fold per twin, guard green)
- [ ] **#18 shared wire-types module.** Move onto `@groundx/shared` `z.infer`: the `/api/chat/*`
  envelope (`ChatReply`/`ChatReplyDebug`/`ChatDispatchedIntent`/`ChatToolFailure` ↔ `ChatRouterResponse`/…,
  inline `_debug.scope`, `CreateChatSessionResult`, `scopeHint`), `AppUserMetadata`, the 7× `eventSource`
  enum (vs `IntentSource`), the WF-03 page-dim shape, `SchemaFieldExtractionResult`, the two customer-auth
  client modules.
- [ ] **LOW — fold remaining inline wire-twins** onto the shared module: `ProposalEnvelopeProvenance`
  (declared twice), the debug-scope twin (`ChatRouterDebug.scope` ↔ `ChatReplyDebug.scope` → derive from
  shared `ContentScope`), the X-Ray response shape (declared 3× with `documentPages[].number` vs `.page`
  drift — coordinate with `wf05b`, do not double-fix), and one shared `Source` union
  (`IntentSource = Exclude<Source,'system'>`).
- [x] **Upgrade the tool-catalog drift guard** from name-set to NAME+DESCRIPTION parity app↔server
  (`toolCatalog.test.ts` — currently 6/8 descriptions drifted). Failing-first.
  — DONE: the description-parity assertion landed in the EXISTING cross-package consumer
  `app/src/tools/catalog-parity.test.ts` (it already imports BOTH catalogs — the app `toolRegistry`
  glob + the middleware `SERVER_TOOL_CATALOG`; `toolCatalog.test.ts` can't see the app glob, so the
  cross-package guard is the only place a real app↔server description comparison can run). New test
  "every app tool's description matches its server mirror's description verbatim" failed RED first
  (9 drifted descriptions — book_call, commit_gate, dismiss_gate, propose_schema_field, accept_proposal,
  reject_proposal, accept_report_section, reject_report_section, edit_report_section — wording diverged
  silently between the hand-mirrored sides), green after reconciling the 9 SERVER descriptions to match
  the app `.tools.ts` canonical text VERBATIM. Behavior-preserving: descriptions are LLM-facing text; the
  edit only de-drifts wording (no tool/intent/schema change). The guard now fires on any future one-sided
  description edit. SERVER-ONLY tools (suggest_intent) skipped by design. Existing `toolCatalog.test.ts`
  (18) unchanged + green; tool-quality/tool-references guards green (descriptions still pass the 40-char +
  Use-when floor).

### 4c. Row-mapper validation (→ SEQUENTIAL/TDD)
- [x] **Union-typed DB columns get validation in the row→object mappers.** Failing test: a corrupt
  `role`/`action`/`source`/`intent_kind`/`last_frame`/`entity_key` row value is rejected/coerced, not
  cast straight into LLM context. Push the citation-style validation into `rowToChatMessage`/
  `rowToViewerEvent` etc. (`mysqlRepository.ts`).
  — DONE: the three genuinely-union columns (`chat_messages.role`, `viewer_events.action`/`source`,
  `intent_log.source`) are now Zod-derived enums in `middleware/src/types.ts` (one source of truth — the
  TS type is `z.infer` of the schema, paralleling shared's `templateKindSchema`), and the row→object
  mappers narrow them via a new `coerceEnum(schema, value, fallback)` helper in `mysqlRepository.ts`
  (parallel to the existing `rowToTemplate` kind-guard precedent). A corrupt value is COERCED to a
  documented safe in-union default (`role`→`system`, `action`→`opened`, `source`→`system`) rather than
  blind-cast into LLM context — coerce-not-drop preserves turn ordering + the row's other fields. A VALID
  value passes through unchanged (behavior preserved). `intent_kind`/`last_frame`/`entity_key` are FREE
  strings (not closed unions — `intentKind` is the open CanvasIntent discriminator, `lastFrame`/`entityKey`
  are arbitrary ids), so they are correctly NOT enum-coerced. Failing-first: 5 new cases in
  `mysqlRepository.test.ts` ("row-mapper union validation (§4c)") — 3 corrupt-coercion (red first, green
  after) + 2 valid-passthrough (green throughout, proving behavior preserved). The MEDIUM `canvasIntentSchema`
  sub-item below is SEPARATE and remains open.
- [ ] **MEDIUM — promote a single `canvasIntentSchema` (Zod) to `@groundx/shared`** and validate at both
  boundaries that read `current_intent_json` (app ChatStore hydration `coerceHydratedIntent` structural
  guard + the middleware cast). Failing-first.

### 4d. dispatch() exhaustiveness + selector + illegal-states (→ SEQUENTIAL/TDD)
- [x] **#14 orchestrator `dispatch()` conforms to `app-architecture/spec.md`.** Failing test: a new
  `CanvasIntent` kind without a handler fails type-check (today the if-chain silently no-ops). Replace
  the 9-branch if-chain with one `switch (intent.kind)` + `const _never: never = intent`; delete the
  retired-but-live `registerAdapter` (zero non-test callers).
  — DONE: the three independent `if (intent.kind === …)` blocks in
  `CanvasOrchestratorContext.tsx` are now ONE `switch (intent.kind)` whose `default` calls the new
  exported `assertNeverIntent(intent: never): never` sentinel — a new union kind without a `case` now
  FAILS `tsc` (verified: a synthetic `__synthetic_unhandled__` kind triggers
  `TS2345: … not assignable to parameter of type 'never'` at the `assertNeverIntent(intent)` line, NOT a
  silent no-op). Behavior-preserving: every case keeps its exact prior context guard (`if (chatStore)` /
  `if (onboardingSession)` / `typeof window`) + handler; the ChatStore triple-write
  (`setCurrentIntent`/`appendViewerEvent`/`recordIntent`) stays a pre-switch block; the
  `adaptersRef.get(intent.kind)` dispatch runs after the switch unchanged. Failing-first test:
  `dispatchExhaustive.test.ts` (red first — `assertNeverIntent` absent; green after) + a `@ts-expect-error`
  proving the sentinel rejects a concrete kind. Existing `CanvasOrchestratorContext.test.tsx` (33) UNCHANGED
  + green. **CORRECTION to the stale task text + the change's spec delta:** `registerAdapter` is NOT
  "retired-but-live (zero non-test callers)" — it has 6 REAL non-test callers (SignUpWidget×1,
  DialogTitle×1, OnboardingWizard×4) added by `2026-05-31-tool-system-completion`. It is RETAINED (deleting
  it would break those widgets); the adapter-only kinds are enumerated as explicit no-op `case`s so the
  exhaustiveness check still names them. The change's `specs/app-architecture/spec.md` delta was reconciled
  to drop the false "SHALL be removed" clause.
- [ ] **#16 `selectActiveStep(session)` selector** (co-located with ChatStore/viewer state) replaces the
  `stepIndex >= 0 ? history[stepIndex] : null` idiom at the 9 sites.
- [ ] **#20 illegal-states.** Session auth → `{kind:"anon"} | {kind:"authed";groundxUsername;
  groundxApiKey}`, collapse the ~12 empty-string `groundxUsername` checks; `LoginReqCallback` +
  `SchemaFieldExtractionResult` flat-record→discriminated union; add a `parseChatStoreSnapshot(unknown)`
  validator on the localStorage rehydration. Failing-first per shape.
- [ ] **#19 `assertChatSessionOwnership(session, req)` helper.** Failing test: all session routes return
  the SAME error code for a non-owner. Collapse the 6-way copy-pasted guard + reconcile the drifted twin
  (returns `chat_session_forbidden` not `not_session_owner`) onto one helper + one error code.

### 4e. Round-trip / dead-plumbing closeout (→ SEQUENTIAL/TDD)
- [ ] **#17 §9 closeout.** Each persist chain gets a reader+writer or is DROPPED (the `attachments_json`
  precedent): `chat_sessions` `viewer_history/overlays/workspace` cols (mutators issue no PATCH → NULL
  on reload — wire a viewer PATCH or delete cols + `chatSessionPatch` + the migration + `hydrateViewer`);
  `chat_messages` telemetry cols (written never read); `intent_log` (`listIntentLog` test-only). Per
  item, a dead-column grep guard.

### 4f. LOW UI cleanups (⟲ WORKFLOW-OK, independent)
- [ ] **LOW — scenario capability flag:** `ExtractView.tsx` `supportsJsonRender = scenarioId === "loan"`
  → read a `ScenarioConfig` capability flag (data, not a hardcoded-id branch).
- [ ] **LOW — `PasswordField` primitive:** extract the show/hide toggle duplicated across `LoginForm`/
  `RegisterForm`/`ConfirmChangePasswordForm` into `components/primitives/PasswordField`.

## 5. Recurrence drift-guards + reconciliation matrix
**Execution: ◑ MIXED.** The `_template/` scaffold update + reconciliation-matrix doc + checklist are
→ SEQUENTIAL (single docs/scaffold edits). The 5 drift guards (a–e) are ⟲ WORKFLOW-OK — each an
independent test file with its own pass/fail. **AUTHOR THESE AFTER the bases they guard exist** (§2,
§3, §4) — a guard for a missing base would be vacuous.

- [ ] **Update the `components/_template/` scaffold:** add a `ScopedViewerWidget` variant (scope prop +
  `show_*` tool + registry) for viewer widgets; reference `docs/agents/data-model.md` + the shared bases.
- [ ] **Cross-layer reconciliation matrix** — maintain (in `docs/agents/data-model.md`) a concept ×
  layer matrix (app type · wire/middleware type · DB column · persisted JSON) asserting agreement.
- [ ] **Drift guards** (failing-first against current tree, then fail loudly): (a) a `viewer-widget`
  that doesn't build on `ScopedViewerWidget` / lacks a `show_*` tool; (b) a duplicate exported type name
  across files; (c) a `Record<string,unknown>` placeholder in a context's typed state; (d) a `*Error`
  not extending the base `ApiError`; (e) a persisted DB column with no in-memory type field.
- [ ] **Chat-widget reachability guard (migrated from `core-data-model-hardening` on its 2026-05-31
  archive — the canvas `CanvasKind` registry covers VIEWER widgets only; chat widgets mount imperatively
  in `ChatColumn`).** For TOOL-triggered cards (`propose_schema_field`→ProposeSchemaFieldCard,
  `book_call`→BookingStatusCard, `save_to_account`/`suggestedActions`→SuggestedActionChips): add a
  `rendersWidget?: "<slot>/<name>"` binding on the relevant `*.tools.ts` + `SERVER_TOOL_CATALOG` entries
  + a coverage test (every UI-card tool names a real mounted chat widget; every tool-triggered chat widget
  is named by ≥1 tool), riding the existing app↔server tool-catalog parity guard — not a second list.
  Always-on widgets (ThinkingStream, input bar, GateChatRail-by-gate-state) are a DELIBERATE exemption
  covered by `ChatColumn`'s render tests. Phase 2 (data-driven `ChatColumn` dispatch registry) deferred —
  earn the axis first. (`knip --production` backstop was DROPPED on the hardening archive: the mandatory
  sibling-test rule defeats it, and registry-as-sole-mount-path + the ESLint import ban are the real
  orphan catches.)
- [ ] **Docs/memory:** the "before you add a widget/type/tool/context" checklist lives in
  `docs/agents/data-model.md` header + AGENTS.md + memory, so future agents consult it.

## 6. Deferred DB sweep — drop extraction_schemas (SOAK-GATED — NOT READY)
**Execution: → SEQUENTIAL (deploy-gated).** This task is **GATED, not ready.** It MUST NOT be started
until the `templates` migration has soaked one release in production and the gate below is confirmed.

- [ ] **UNBLOCK (soak gate):** confirm the `templates` migration has been live one release AND a code
  sweep shows zero readers/writers of `extraction_schemas` remain (Phase-3 cutover removed them). Only
  after this passes may the drop task below begin.
- [ ] **(gated on the UNBLOCK above)** Drop the `extraction_schemas` table AND in the same change remove
  the boot copy-migration `INSERT…SELECT … FROM extraction_schemas` in `mysqlRepository.ts` (it reads
  that table; leaving it after the drop breaks `createSchema`/startup) AND drop the now-orphan
  `CREATE TABLE IF NOT EXISTS extraction_schemas`. A migration test confirms a fresh boot + `createSchema`
  succeed with the table gone.

## Closeout
**Execution: → SEQUENTIAL (gate).** A single serial gate, never a workflow.

- [ ] `openspec validate --all --strict` green; `scaffold/app` + `scaffold/middleware` suites green;
  widget-contract + no-hardcoded-styles + tool-quality guards green.
- [ ] Update `docs/agents/data-model.md` (remove the resolved duplicates/placeholders from the facts table).
- [ ] Archive.
