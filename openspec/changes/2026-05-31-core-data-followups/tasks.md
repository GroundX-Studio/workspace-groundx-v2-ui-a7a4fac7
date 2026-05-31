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

- [ ] **Failing test:** assert a base `ApiError extends Error` exists with `status` + `detail`, and
  that an instance is `instanceof Error` + `instanceof ApiError`.
- [ ] Introduce the base `ApiError extends Error` (`status`, `detail`).
- [ ] Refactor app errors onto it: `ExtractFieldApiError`, `TemplateApiError`, `ChatApiError`.
- [ ] Refactor middleware errors onto it: `ChatHandlerError`, `ChatRouteNotImplementedError`,
  `UpstreamHttpError`, `UpstreamTimeoutError`.
- [ ] Adversarial review: every `*Error` extends the base; no error class declares its own `status`/
  `detail` fields; suites green both sides.

## 3. Entity CRUD factory + 8-context factory + SdkActionResult union
**Execution: ◑ MIXED.** Author `SdkActionResult<T>`, `createEntityClient<T>()`, `createEntityContext<T>()`
SEQUENTIAL (the factory contracts). Migrating the ~30 `api/entities/*` wrappers + the 8 contexts onto
them is ⟲ WORKFLOW-OK once the factories land — independent per file, fixed factory.

- [ ] **Failing test:** the `{ isSuccess: false; response: null; error: null }` limbo no longer
  type-checks; an `isSuccess:true` value exposes `response` and an `isSuccess:false` value exposes
  `error` (discriminated-union narrowing).
- [ ] Define `SdkActionResult<T>` as a discriminated union
  (`{isSuccess:true;response:T} | {isSuccess:false;error}`).
- [ ] Author `createEntityClient<T>()` (api) over `SdkActionResult<T>`.
- [ ] Author `createEntityContext<T>()` (context) over `SdkActionResult<T>`.
- [ ] Migrate the ~30 `api/entities/*` CRUD wrappers (list/create/get/update/delete) onto
  `createEntityClient<T>()`. ⟲ per-wrapper.
- [ ] Migrate the 8 hand-rolled CRUD contexts (Buckets/Documents/Groups/Projects/Workflows/ApiKeys/
  Search/Health) onto `createEntityContext<T>()`. ⟲ per-context.
- [ ] Route `AuthProvider`'s `{isSuccess, error}` two-boolean twin through `SdkActionResult<T>`.
- [ ] Adversarial review: no hand-rolled CRUD wrapper/context remains off the factory; the limbo state
  is unrepresentable; app suite green.

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
- [ ] **Upgrade the tool-catalog drift guard** from name-set to NAME+DESCRIPTION parity app↔server
  (`toolCatalog.test.ts` — currently 6/8 descriptions drifted). Failing-first.

### 4c. Row-mapper validation (→ SEQUENTIAL/TDD)
- [ ] **Union-typed DB columns get validation in the row→object mappers.** Failing test: a corrupt
  `role`/`action`/`source`/`intent_kind`/`last_frame`/`entity_key` row value is rejected/coerced, not
  cast straight into LLM context. Push the citation-style validation into `rowToChatMessage`/
  `rowToViewerEvent` etc. (`mysqlRepository.ts`).
- [ ] **MEDIUM — promote a single `canvasIntentSchema` (Zod) to `@groundx/shared`** and validate at both
  boundaries that read `current_intent_json` (app ChatStore hydration `coerceHydratedIntent` structural
  guard + the middleware cast). Failing-first.

### 4d. dispatch() exhaustiveness + selector + illegal-states (→ SEQUENTIAL/TDD)
- [ ] **#14 orchestrator `dispatch()` conforms to `app-architecture/spec.md`.** Failing test: a new
  `CanvasIntent` kind without a handler fails type-check (today the if-chain silently no-ops). Replace
  the 9-branch if-chain with one `switch (intent.kind)` + `const _never: never = intent`; delete the
  retired-but-live `registerAdapter` (zero non-test callers).
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
