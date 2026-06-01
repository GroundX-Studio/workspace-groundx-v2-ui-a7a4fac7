# Core data-model hardening — remaining refactors

## Why

The `2026-05-29-core-data-model-hardening` change shipped its run-critical foundations
(`GeneratedResult`, the `ScopedViewerWidget` base/registry, promoted `ChatMessage.citations`, the
single `CanvasIntent` union, single `ViewerStepKind`, the shared `Citation`/`ContentScope` contracts).
What remains are behavior-preserving refactors and cleanup: a large file to split, a duplicated error
hierarchy, hand-rolled CRUD plumbing, leftover type duplication / loose typing, the recurrence
drift-guards that prevent the whole class of debt from coming back, and a deploy-gated DB drop. None of
it adds user-facing capability and none has an external blocker — except the DB drop, which must soak
one release after the `templates` migration before it can land.

This change is the single tracked home for those still-open items so none reverts to a silent
placeholder/hack. Each lands behind green tests with no user-visible regression.

## What Changes

1. **Split `chatRouter.ts` (1637 lines) into modules** — wire types, the deterministic classifier,
   `searchGroundX`+`composeFilters`, the RAG pipeline (`runRagPipeline`/`callGroundedLlm`/
   `parseGroundedAnswer`/`buildSnippetBlock`), and the mocks. Behavior-preserving; tests green.
2. **Shared `ApiError` base + the 7-error refactor** — a base `ApiError extends Error` (`status`,
   `detail`); refactor app `ExtractFieldApiError`/`TemplateApiError`/`ChatApiError` and middleware
   `ChatHandlerError`/`ChatRouteNotImplementedError`/`UpstreamHttpError`/`UpstreamTimeoutError` onto it.
3. **Entity CRUD factory + 8-context factory + `SdkActionResult<T>` union** — pair `createEntityClient<T>()`
   (api) with `createEntityContext<T>()` (context) over an `SdkActionResult<T>` discriminated union
   (`{isSuccess:true;response} | {isSuccess:false;error}`, routing `AuthProvider`'s two-boolean twin
   through it); collapse the ~30 `api/entities/*` wrappers and the 8 hand-rolled CRUD contexts onto them.
4. **Type-unification + row-mapper validation + a shared wire-types module + illegal-states unions** —
   the field-type union (#12) and `ExtractFieldResult`/3rd `SuggestedAction` (#13) onto `@groundx/shared`;
   row→object mapper union-validation for the bare-`VARCHAR` DB columns; the `/api/chat/*` envelope twins
   + remaining inline wire-twins (debug-scope, `IntentSource`/`Source`, X-Ray shape) folded onto one shared
   wire-types module with a description-level drift guard; the orchestrator `dispatch()` `switch`+`never`
   conformance (#14, delete dead `registerAdapter`); the `selectActiveStep` selector (#16); session-auth
   and `LoginReqCallback`/`SchemaFieldExtractionResult` flat→discriminated-union illegal-states (#20);
   plus the LOW UI cleanups (scenario capability flag, `PasswordField` primitive); plus
   `assertChatSessionOwnership` (#19) and the round-trip/dead-plumbing closeout (#17).
5. **Recurrence drift-guards + reconciliation matrix** — authored AFTER the bases they guard: the
   `components/_template/` scaffold update, the cross-layer reconciliation matrix in `data-model.md`, the
   5 drift guards (viewer-widget-without-base, duplicate-exported-type-name, `Record<string,unknown>`
   placeholder, `*Error`-not-extending-`ApiError`, persisted-column-without-in-memory-field), and the
   "before you add a widget/type/tool/context" checklist.
6. **Deferred DB sweep — drop `extraction_schemas`** — SOAK-GATED: must soak one release after the
   `templates` migration before the table + the boot copy-migration `INSERT…SELECT … FROM
   extraction_schemas` + the orphan `CREATE TABLE` can be removed. Marked gated, not ready.

## Out of scope

- New product behavior — this is structural. Each item must land behind green tests with no
  user-visible regression.
- The tool **role/`availableIn`** migration (owned by `widget-role-access`); the shared Template
  lifecycle + its `templates` table (archived `2026-05-29-shared-template-lifecycle`); the
  `chat_session_entities` RAG-scope round-trip (its own change `2026-05-30-entity-rag-scope-roundtrip`).

## Affected

- App: `api/entities/*` (CRUD factory), `contexts/*` (entity contexts, `CanvasOrchestratorContext`
  `dispatch`, ChatStore selector + illegal-states), `components/primitives/PasswordField`,
  `widgets/` + `components/_template/` (drift guards), the app error classes.
- Middleware: `services/chatRouter.ts` (split), the middleware error classes, `mysqlRepository.ts`
  (row-mapper validation), `@groundx/shared` (field-type/wire-type/`SdkActionResult` schemas).
- Specs: `app-architecture` (the durable structural contracts: shared `ApiError` base, entity CRUD
  factory, single wire-types module + drift guards, illegal-states unions, `dispatch` exhaustiveness);
  `data-tier` (the soak-gated `extraction_schemas` drop).

## Conformance to core architectural decisions

- **Composable, not forked** — each fix unifies a duplicated shape onto one shared object/type (one
  `ApiError` base, one entity factory, one wire-types module, one `Source` union). It removes forks; it
  does not add parallel implementations.
- **Reuse `@groundx/shared`** — shared wire types are defined once and imported by both sides.
- **Done-able** — every item is behavior-preserving behind green tests; each is a tracked task, not a
  silent TODO. The one externally-gated item (the DB drop) is explicitly marked soak-gated, not ready.
