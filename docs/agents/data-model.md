# Data model — reference (facts only)

Running list of the data structures that power the app: inheritance/composition, key properties,
where used. **Facts only — no assessment** (design critique lives in the `core-data-model-hardening`
OpenSpec change, not here). Keep simple; append as the model grows.

## Before you add a widget / type / tool / context (READ THIS FIRST)

Reuse the shared base; do not fork or placeholder. The codebase's good patterns to follow:
`AppRepository` (interface + `implements`), `SdkActionResult<T>` (`@groundx/shared`), `WidgetTool`
(`tools/types.ts`), the SHIPPED `ApiError` (`@groundx/shared`) / `ScopedViewerWidget`
(`widgets/scopedViewerWidget.ts`) / `Catalog<T>` (`@groundx/shared`) bases, and the planned shared
`Template` lifecycle. **Each bullet below is backed by a recurrence drift guard — adding the debt back
turns a test RED** (see the §5 guards: `app/src/test/recurrence-drift-guards.test.ts` (a/b/c/d) +
`middleware/src/db/persistedColumnPolicy.test.ts` (e) + the reachability guard in
`app/src/tools/catalog-parity.test.ts`).

- **New data catalog** (looked up by id + enumerated) → satisfy the shared `Catalog<T>` read contract (`all(): readonly T[]`, `byId(id): T | undefined` — never a `resolve(context)` dispatcher, never a state store); enforce id uniqueness with `assertUniqueIds(items, idOf, sourceOf?)` (`@groundx/shared`). Targets already on it: `scopedViewerWidgetRegistry`, `chatExperienceRegistry`. (A mutable state store is NOT a catalog — see `EntitySessionStore`.)

- **New viewer surface** → build on `ScopedViewerWidget` (props `{scope: ContentScope (required, non-`none`), role: WidgetRole}` + a canvas-dispatch tool + `defineScopedViewerWidget(...)` descriptor registered in `widgets/scopedViewerWidgetRegistryProduction.ts`); copy `components/_template/ScopedViewerTemplate.*`. Drive the data fetch from `scope` via `useScopeAdapter`; never take a raw `documentId`/`bucketId`/`projectId`. **Guard: §5(a)** fails a `viewer-widgets/<Name>/` with no `defineScopedViewerWidget` call.
- **New chat widget** → copy `components/_template/Template.*`; ship README + sibling test + `role` + required `scope` props + a `*.tools.ts` (or `no-llm.md`). If it's a TOOL-triggered card (not always-on), give its triggering tool a `rendersWidget: "chat-widgets/<Name>"` binding on BOTH the app `*.tools.ts` and the `SERVER_TOOL_CATALOG` mirror. **Guard: the reachability test** in `catalog-parity.test.ts` fails a dangling binding.
- **New "questions+output" feature** → instantiate the shared `Template` lifecycle; do NOT make a new schema/template object or table.
- **New scope need** → extend `ContentScope` (filter is composable); never hardcode a shape. **Never scope by `documentIds` to dodge a filter** — the filter (`{projectId}`) is the locked data-org/RBAC mechanism (`project_projects_rbac_filter`).
- **Scenario manifests live app-side** (`middleware/src/scenarios/sampleScenarios.ts`, 2026-06-02-flatten-document-filter) — the `ScenarioRegistry` reads manifests there and joins bucket docs to a scenario by `filter.projectId`; the GroundX doc `filter` is the FLAT `{projectId, workflow_id}` (no `manifest`/`scenarioId`/`kind`). Don't put app/UI metadata in the GroundX filter; stamp docs via `services/documentFilter.ts` `stampDocumentFilter`.
- **New project / RBAC / sharing need** → the app-owned `projects` + `project_grants` tables (middleware) are the ONLY place data-org + access live; GroundX owns customers/buckets/groups/docs/Partner-Projects (don't mirror; principal = GroundX **username**). RAG access is resolved server-side: `authorizedProjectIds(repo, username)` → `rbacFilterForProjects` → `searchGroundX` `options.rbacFilter` (`$and` with the scope filter). RBAC stays server-side; the FE only builds a `ContentScope`. Don't add a FE `Project`/grant/`DocumentFilter`/`Role` type until a real FE consumer exists (dead-stub guard). See `project_projects_rbac_filter`.
- **New frontend network function** → add it to the injected `Api` client (`app/src/api/client.ts`) and let tests override it through `makeFakeApi` / render-harness `api` options. Runtime consumers use `useApi()`; tests do not add per-file `vi.mock("@/api/...")` for migrated boundaries. Rendered-runtime error capture uses `api.telemetry.captureException`; do not import or mock `@/lib/sentry` from components, contexts, hooks, widgets, views, or their tests. This mirrors middleware DI (`createApp({ repository, partnerClient, groundxClient, llmClient, scenarioRegistry })`). **Guard: `frontend-api-injection-guard.test.ts`** fails direct imports or per-file mocks for all migrated frontend API and telemetry boundaries.
- **New API error** → extend the base `ApiError` (`@groundx/shared`); don't hand-roll `extends Error`. **Guard: §5(d)** (both sides) fails any `class XError extends Error`.
- **New type** → check it isn't a dup (e.g. `Citation`); no `Record<string,unknown>` placeholder in a context `*State` field. **Guards: §5(b)** (duplicate exported type name across files) + **§5(c)** (`Record<string,unknown>` in a `*State` interface).
- **New tool** → mirror app declarative `*.tools.ts` metadata + middleware `SERVER_TOOL_CATALOG`, allowlisted verb, NAME+DESCRIPTION parity. The middleware server catalog owns executable `intentBuilder` behavior; app metadata must not add runtime handlers. **Guards: `catalog-parity.test.ts` + `appToolMetadata.test.ts`.**
- **New persisted DB column** → give it an in-memory record field + a read site in the row→object mapper, or DROP it (no write-only / dead column). **Guard: §5(e)** fails a guarded-table column with no `row.<col>` read in its mapper.
- **Always** update this file (incl. the reconciliation matrix below) in the same change (closeout step). Unfinished → a backlog task, never a stub.

## Cross-layer reconciliation matrix (concept × layer — assert agreement)

The one table that says "this concept is THE SAME shape at every layer it crosses." When a concept
spans app type · wire/middleware type · DB column · persisted JSON, all four must agree (the §5 guards
above keep them honest). `—` = the concept does not reach that layer. Append a row when a new concept
crosses ≥2 layers.

| Concept | App type | Wire / middleware type | DB column(s) | Persisted JSON | Reconciled by |
|---|---|---|---|---|---|
| Citation | `Citation` (re-export `@groundx/shared`) | `Citation` (re-export `@groundx/shared`) | `chat_messages.citations_json` | array of `Citation` | one shared Zod schema; `parseCitations` sanitizes the hydrate boundary |
| ContentScope | `ContentScope` (re-export) | `ContentScope` (`deriveRagContentScope` returns it) | `chat_session_entities.bucket_id` + `project_ids_json` + `group_id` + `document_ids_json` (decomposed) | — (columns, not a blob) | one shared Zod union; `compileScopeFilter` materializes the filter |
| Template (Extract schema / Report template) | `Template` (re-export) + `api/templates.ts` | `Template` (re-export); `POST /api/templates` | `templates.{id,kind,body_json,…}` | `body_json` = `ExtractBody`\|`ReportBody` | one shared Zod schema; `parseTemplate` row-mapper sanitizer; `rowToTemplate` guards `kind` via `templateKindSchema` |
| GeneratedResult (Extract value / Report section) | `ExtractedFieldValue` / `RenderedSection` (both `@groundx/shared`) | same | — (computed at render) | — | shared `GeneratedResult` base + `parseGeneratedResult` |
| ViewerStepKind | `ViewerStep["kind"]` | `ViewerStepKind` (re-export `@groundx/shared`) | — | — | one shared `viewerStepKindSchema`; `ViewerStepKind.contract.test` locks app==shared |
| CanvasIntent | `CanvasIntent` union (orchestrator) + ChatStore `currentIntent` (type-only re-export) | intentBuilder `Record<string,unknown>` shapes | `intent_log.intent_json` (+ `intent_kind`) | a `CanvasIntent` | ONE union (B1); §5(c) guards the ChatStore `currentIntent` doesn't regress to a placeholder |
| ViewerEvent | `ViewerEvent` (ChatStore) | `ViewerEventRecord` | `viewer_events.{id,chat_session_id,ts_ms,entity_key,action,source,detail_json}` | `detail_json` (`CanvasIntent`\|JSON bag) | `action`/`source` Zod-enum-coerced in `rowToViewerEvent` (§4c); §5(e) guards every column round-trips |
| ApiError | `ExtractFieldApiError` / `TemplateApiError` / `ChatApiError` / `SmartReportApiError` (all `extends ApiError`) | `ChatHandlerError` / `ChatRouteNotImplementedError` / `UpstreamHttpError` / `UpstreamTimeoutError` (all `extends ApiError`) | — | — (envelope: `{status,detail}`) | one shared `ApiError` base (§2); §5(d) guards no subclass forks back to `extends Error` |
| SuggestedAction | `SuggestedAction` (re-export `@groundx/shared`) + `ChatSuggestedAction` alias | `SuggestedAction` (re-export) | — | on `reply.suggestedActions[]` | one shared `suggestedActionSchema` (§4) |
| Tool (LLM) | `WidgetTool` declarative metadata (`tools/types.ts`); `rendersWidget?` binding; no handler | `ServerTool` (`SERVER_TOOL_CATALOG`); `intentBuilder`; `rendersWidget?` mirror | — | — | `catalog-parity.test.ts` — NAME+DESCRIPTION parity + reachability (§5); `appToolMetadata.test.ts` forbids app runtime handlers/registry |

## Domain value types — `app/src/types/`

| Object | Inheritance / composes | Key properties | Where used |
|---|---|---|---|
| `ContentScope` | re-exports `@groundx/shared` | `{type:"bucket";bucketId;filter?}` \| `{type:"group";groupId;filter?}` \| `{type:"documents";documentIds[];filter?}` | ✅ B1 inc.3 — shared union, composable `filter` on every shape; search, Extract, Report, `CanvasIntent` |
| `Citation` / `CitationTier` | re-exports `@groundx/shared` (`types/onboarding.ts`) | `documentId, page, bbox?, snippet?, confidence?, tier?, answerSpan?` | `CiteChip`, chat, extract, report |
| ~~`ScenarioCitation`~~ → `Citation` | alias REMOVED 2026-05-29 | `ExtractedFieldValue`/`SampleChatTurn` use shared `Citation` directly | (no alias) |
| `CitationTier` | union | `"exact"\|"paraphrase"\|"ambient"` | `Citation`, highlight precision |
| `AppMode`/`Scenario`/`FFrame`/`GateTrigger`/`AuthState` | unions | literal sets | shell, session, nav |
| `ScenarioConfig` | composes `ScenarioManifest`, `ScenarioDocument[]` | `id, order, projectId, documents[], manifest` | `ScenarioRegistry`; `/projects` uses `projectId` for `ContentScope.filter.projectId` |
| `ScenarioManifest` | composes `ScenarioHero` | `id, hero, thinkingScript[], chatSeeds[], sampleChatScript[], extractionSchema?` (+ `sampleExtractionValues`) | scenario fixtures. NOTE: `extractionSchema` / `sampleExtractionValues` / `sampleChatScript` are the mock-data path; superseded by real-data retrieval via `getGroundXWorkflow(filter.workflow_id)` (schema) + `getGroundXDocumentExtract(id)` (values) — see `docs/agents/real-data-rewire-gap.md`. |
| `ScenarioHero` | — | `title, shortDesc, demonstrates, badges[], chapters{extract,interact,report}, docCount` | F1 cards, chapter gating |
| `ExtractionSchemaDef` | composes `SchemaCategoryDef`→`SchemaFieldDef` | `categories[]` | Extract template |
| `SchemaFieldDef` | — | `id, name, type, description` | schema rows |
| `ExtractedFieldValue` | re-exports `@groundx/shared`; Extract specialization of `GeneratedResult` | `fieldId, value(body), citations[], confidence?, warnings?` | Extract results |
| `GeneratedResult` | `@groundx/shared` — Result half of Template+Scope+Results | `body, citations[], confidence?, warnings?` (+ `parseGeneratedResult`) | shared by Extract (`ExtractedFieldValue`) + Report (`RenderedSection`) |
| `RenderedSection` | `@groundx/shared`; Report specialization of `GeneratedResult` | `sectionId, body(markdown), citations[], confidence?, warnings?` | Report sections (smart-report) |

## ChatStore object graph — `contexts/ChatStoreContext/types.ts`

| Object | Inheritance / composes | Key properties | Where used |
|---|---|---|---|
| `ChatSession` | composes messages/summaries/entities/viewer | `id, title, createdAt, updatedAt, messages[], summaries[]` + paired `ViewerSession` | root aggregate |
| `ChatMessage` | — | `id, role, content, timestamp, compressedIntoSummaryId?` (+`citations?` planned) | chat thread |
| `ConversationSummary` | — | `id, fromMessageId, toMessageId, generation, absorbedSummaryIds[], content, model, tokensIn, tokensOut, createdAt` | compression chain |
| `ViewerEvent` | — | `id, timestamp, entityKey, action, source, detail?` | LLM context bundling |
| `ViewerSession` | composes `ViewerStep[]`,`ViewerOverlay[]`,`ViewerWorkspace` | `history[], currentStep{stepIndex}, overlays[], workspace` | paired 1:1 w/ `ChatSession` |
| `ViewerStep` | union | `doc-viewer{documentId,page?,highlight?}` · `extract-workbench{scenarioId,focusedCategoryId?}` · `interact-chat{scenarioId}` · `report` · `integrate` · `ingest-picker` | canvas surface |
| `ViewerOverlay` | union | `sign-up{state,cause?}` · `citation-peek{documentId,page,bbox?}` · `book-call` | z-stack overlays |
| `ViewerWorkspace` | composes `PendingSchemaOverlay` | `schemaOverlay` | sticky workspace state |
| `PendingTemplateOverlay<TItem,TEdit,TProposal>` | GENERIC shell | `addedFields[], removedFieldIds, editedFields, pendingFieldProposals, pinnedSamples, focusedCategoryId` | the one editing-overlay shell — mechanism; item shape varies by kind (smart-report Phase 4) |
| `PendingSchemaOverlay` | = `PendingTemplateOverlay<SchemaFieldAddition,SchemaFieldEdit,SchemaFieldProposal>` | (alias) | Extract builder overlay (`pendingSchemaOverlay` slot) — non-breaking alias post-generalization |
| `PendingReportOverlay` | = `PendingTemplateOverlay<ReportSectionItem,ReportSectionEdit,ReportSectionProposal>` | (alias) | Report builder overlay (`reportOverlay` slot); `addReportSection`/`editReportSection`/`removeReportSection` actions; SmartReportBuilder (f4a) |
| `SchemaFieldProposal` / `SchemaFieldAddition` / `SchemaFieldEdit` / `SchemaFieldExtractionResult` | — | field draft/edit/result shapes | propose-cards, F3a |
| `ReportSectionItem` / `ReportSectionEdit` / `ReportSectionProposal` | — | section draft/edit/proposal shapes (`name+renderAs+question+instructions+variables`, NO per-section scope) | SmartReportBuilder (f4a/S3a) |
| `CanvasIntent` (here) | re-exports the orchestrator union | ChatStore `currentIntent: CanvasIntent \| null` | ✅ B1 — placeholder removed; ONE union (type-only re-export from `CanvasOrchestratorContext/types`, cycle-free); contract test locks it |
| `ChatStoreState` / `ChatStoreApi` | — | sessions map, activeSessionId, actions | the store |

## Contexts — `contexts/*/`

| Context | State | Key properties | Notes |
|---|---|---|---|
| CanvasOrchestrator | `CanvasIntent` (real union) | ~16 kinds: `showSample, openDocument, highlightCitation, jumpToPage, showExtract{scope,schemaId}, editSchema, showReport{templateId,scope}, editTemplate, openGate, switchFrame, proposeSchemaField, accept/rejectSchemaField, commitGate, dismissGate, openBookCall` | + `StampedIntent{intent,source,intentId}`, `CanvasAdapter<K>{kind,apply}` |
| EntityRegistry | `EntityRegistryState` | `entities: Map<EntityKey,EntitySession>, activeKey` | `EntityKey`=branded `${kind}:${id}`; `EntityKind="sample"` (future project/document/schema/report). Being renamed to `EntitySessionStore` (context/provider/`useEntitySessionStore`) by `registry-catalog-consistency` because it is a mutable state store, not a read catalog — NOT yet shipped. The `EntitySession` data-type interface (below) is deliberately KEPT (the "Store" suffix avoids the name collision). |
| `EntitySession` | — | `kind, id, lastFrame, completedFrames, createdAt, lastVisitedAt` | per-entity journey |
| OnboardingSession | `OnboardingSessionState` | `currentFrame, gate{status,trigger,cause?}, scenario` | gate lifecycle (LC3) |
| AppMode | `AppModeState` | `mode, scenario, authState` | |
| ScenarioRegistry / OnboardingSkill / Loading / MessageBar | states | — | plumbing |
| SDK/entity contexts (Buckets, Documents, Groups, Projects, Workflows, ApiKeys, Search, Health, Auth) | each | CRUD returning `SdkActionResult<T>` | wrap GroundX entities |

## Widget / tool layer

| Object | Inheritance / composes | Key properties | Where used |
|---|---|---|---|
| Widget contract | test-enforced (no class) | folder + README + sibling test + `role` prop + required `scope` | `widget-contract.test.ts`. Code TODAY enforces a `mode` prop (`"onboarding"\|"steady"`); `role` prop + required `scope: WidgetScope` are the migration target via `widget-role-access` (`mode`→`role`, `scope` made required), not yet shipped |
| `_template/` scaffold | files to copy | `Template.*` (chat card / overlay — `scope:{type:"none"}`) + `ScopedViewerTemplate.*` (ScopedViewerWidget — required `ContentScope` + `defineScopedViewerWidget` descriptor + `useScopeAdapter`) + README | starting point for every new widget; copy the variant matching the slot |
| `WidgetTool<TSchema>` | generic declarative metadata | `name, description, input(Zod), category, availableIn?, availableSteps?, rendersWidget?` | `tools/types.ts`; collected only for parity/quality/reference checks and widget descriptors; app declarations do not execute handlers; `availableIn?: ToolMode[]` (migrating to `WidgetRole[]`); `rendersWidget?: "<slot>/<Name>"` (§5) binds a TOOL-triggered chat card to its mounted widget (reachability guard) |
| `ToolCategory` / `ToolMode` | unions | `read\|mutate` / `onboarding\|steady` | tool confirmation model. Code TODAY ships `ToolMode` + `availableIn?: ToolMode[]` (`tools/types.ts:20,71`); these migrate to `WidgetRole` + `availableIn?: WidgetRole[]` (a source-of-truth Zod enum in `@groundx/shared`, tool visibility gated by `availableIn` only) via `widget-role-access` — NOT shipped. Build NEW tools against `WidgetRole`. |
| App tool decl | `*.tools.ts` → `WidgetTool[]` | per widget | declarative metadata collected by tests/scripts; no production app registry |
| `ServerTool<TSchema>` | — | `name, description, inputSchema, intentBuilder, availableIn?, rendersWidget?` | `SERVER_TOOL_CATALOG[]`; `rendersWidget?` mirrors the app binding (§5 reachability) |
| `ViewerStepKind` | string union | same kinds as `ViewerStep` | server mirror |
| `ALLOWED_VERBS` | const | verb prefixes | `check-tool-quality.mjs` |

## API result / error — `contexts/sdkContextTypes.ts`, `api/`

| Object | Inheritance | Key properties | Where used |
|---|---|---|---|
| `SdkActionResult<T>` | generic | `isSuccess, response:T\|null, error` | all SDK contexts |
| `SaveExtractionSchemaInput`/`Result` | — | `id, name, schema` / `id, name, updatedAt` | save-schema API |
| `ExtractFieldApiError`, `TemplateApiError`, `ChatApiError`, `SmartReportApiError` | each **extends shared `ApiError`** (§2, 2026-05-31) | `status, detail` (from the base) | app API clients. §5(d) drift guard forbids reverting to `extends Error`. |
| `ChatHandlerError`, `ChatRouteNotImplementedError`, `UpstreamHttpError`, `UpstreamTimeoutError` | each **extends shared `ApiError`** (§2) | base `status`/`detail` + mirrors (`statusCode`/`upstreamStatus`/`mode`) | middleware services. §5(d) drift guard (middleware half) forbids `extends Error`. |
| `ApiError` (base) | `@groundx/shared`, **extends `Error`** | `readonly status, detail?` | the ONE error base both sides extend (isomorphic; `instanceof` survives transpile) |
| `SdkListResponse<T>` / `SdkMessageResponse` + GroundX domain types (`Bucket`, `GroundXApiKey`, …) | interfaces | list/message envelopes + entity shapes | `api/entities/sdkTypes.ts`, **16** entity wrappers (more if root `api/*.ts` counted) |

## Middleware persistence — `middleware/src/db/`

| Object | Inheritance | Properties / tables | Where used |
|---|---|---|---|
| `AppRepository` | interface | persistence methods | the contract |
| `MySqlAppRepository`, `MemoryAppRepository` | **implement `AppRepository`** | — | prod / mock |
| `projects` + `project_grants` | SQL | `projects(project_id PK 'proj_<uuid>', bucket_id, name, owner_username, is_sample, ts)` · `project_grants(project_id, principal_type 'public\|user', principal_username '' = public, role 'owner\|editor\|viewer', PK(project_id,principal_type,principal_username))` | 2026-06-01-projects-rbac-scope-filter. App-owned data-org + RBAC ONLY (no GroundX-concept mirror; principal = GroundX username). Repo: `insertProject`/`getProject`/`listProjectsForBucket`/`insertProjectGrant`/`listGrantsForPrincipal(username\|null)`; `rowToProject`/`rowToProjectGrant`. Seed: `db/seedSampleProject.ts` (the public `SAMPLE_PROJECT_ID` proj_c7701da7-… + `public/viewer` grant, on boot). Access resolver + WRITERS: `services/projectAccess.ts` (`authorizedProjectIds`→`rbacFilterForProjects`→`searchGroundX.options.rbacFilter`; `createProjectWithOwner`/`writeUserGrant`/`roleOnProject`/`newProjectId`). **Writer endpoints (2026-06-01-authed-project-create-grant):** `POST /api/projects` (authed → project + `user/owner` grant) and `POST /api/projects/:projectId/grants` (owner-only → another GroundX username at `viewer\|editor`; target validated via Partner `getCustomer`; self-share 400; non-owner 403). Reuse the existing repo methods (no new ones) so MySQL + in-memory stay in lockstep. `account`/teams DEFERRED; **BYO doc `filter.projectId` stamping DEFERRED** (no app-owned ingest endpoint yet; seam = `documentFilter.stampDocumentFilter`). Guard: both tables in `persistedColumnPolicy`. |
| DB tables | SQL | `sessions, app_user_metadata, chat_sessions, chat_messages, conversation_summaries, chat_session_entities, viewer_events, intent_log, templates, projects, project_grants` | `templates` (shared-template-lifecycle Phase 2): `id,kind,groundx_username,name,body_json,created_at,updated_at` (no `version`). Repo: `saveTemplate`/`getTemplate`/`listTemplates(user,kind)` + `TemplateRecord`; `rowToTemplate` guards `kind` via shared `templateKindSchema`. **`extraction_schemas` DROPPED** (2026-05-31-extraction-schemas-table-drop): the legacy table + its boot copy-INSERT…SELECT into `templates` are gone after `templates` soaked one prod release; `createSchema` now emits `DROP TABLE IF EXISTS extraction_schemas` (idempotent) to shed it from provisioned DBs. |
| `chat_messages` cols | SQL | `citations_json` is **persisted AND projected** to the client on hydrate. `tool_calls_json` + `attachments_json` were **DROPPED** (§4e, 2026-05-31): both were write-only/dead (no reader) — column + INSERT + SELECT + record field removed, with a dead-column grep guard in `mysqlRepository.test.ts`. Remaining telemetry cols (`llm_provider/model_id/latency_ms/tokens`) are written-not-read by design (telemetry sink) | §5(e) guards round-trip on `viewer_events`/`intent_log` |
| `chat_session_entities` cols | SQL | `bucket_id`, `project_ids_json`, `group_id`, `document_ids_json`, `extracted_values_json`, `scan_progress_json`, `completed_frames_json`, `last_frame` | The four scope columns are READ by `deriveRagContentScope` (`chatHandler.ts`). **Producer (2026-05-31-steady-scope-producer, DONE):** `bucket_id` + `project_ids_json` are **produced by `entityScopeProducer.produceEntityScope`**, wired at the entity-write seam (PUT `/api/chat-sessions/:id/entities/:entityKey`, `app.ts`). For the existing `sample` EntityKind, `sample:<scenarioId>` → `{bucketId: <samplesBucket>, projectIdsJson: [scenarioId]}` (the demo scope), so `deriveRagContentScope` resolves `{type:"bucket", bucketId, filter:{projectId:[scenarioId]}}` — the real persisted scope, NOT the bare samples-bucket fallback. Producer is idempotent (first write only) and fires only when a samples bucket is configured + the key is a recognized `sample:*`; otherwise columns stay NULL → anon-onboarding samples-bucket fallback (unchanged, by design). **§9 column-drop outcome: NO column dropped.** `group_id` is KEPT as `cf19`'s multi-bucket→group substrate (backlogged, tracked); `document_ids_json` is KEPT as the single-doc-viewer / wf05b substrate (tracked) — both have a tracked future consumer, so dropping them would break that rework. Drift guard `entityScopeColumnPolicy.test.ts` enforces "every read column has a producer OR a tracked-keep reason — no read-only column." BYO upload producer is **deferred** (its upload path does not exist yet). |
| `MessageResponse` / `SdkMessageResponse` | interfaces | `{message}` (dup) | `api/common.ts` + `api/entities/sdkTypes.ts` |
| citations hydrate projection | code | **VALIDATED (B1, 2026-05-29):** `app.ts` messages-hydrate now runs `citations_json` through `parseCitations` (`@groundx/shared`) — drops malformed, strips unknown keys; no longer ships `unknown[]` | guarded boundary |
| union-typed DB columns | SQL | the 3 genuinely-closed unions — `chat_messages.role`, `viewer_events.action`/`source`, `intent_log.source` — are bare `VARCHAR` at the DB but **Zod-enum-COERCED** in the row mappers via `coerceEnum(schema, value, fallback)` (§4c, 2026-05-31): a corrupt value coerces to a safe in-union default, not blind-cast. `last_frame`/`entity_key`/`intent_kind` are FREE strings (open discriminators), correctly NOT coerced | row-mapper coercion is the union guard (no DB CHECK) |
| bbox rectangle | shared `NormalizedBbox` | ✅ 2026-05-29 — all ~10 inline `{x,y,w,h}` app-side annotations (7 files) replaced with the shared `@groundx/shared` `NormalizedBbox`; mw `citationGeometry` re-exports it | single named type |
| Services | functions | `chatRouter (1637 lines — overloaded), chatHandler, conversationCompressor, contextBundler, fieldExtractor, attribution, citationGeometry, toolCatalog, structuredHandler, zodToJsonSchema` | middleware |

## Shared wire contracts — `shared/` (`@groundx/shared`, B1 2026-05-29)

| Object | Kind | Key properties | Notes |
|---|---|---|---|
| `Citation` / `CitationTier` / `NormalizedBbox` | zod schema → `z.infer` type | canonical Citation (schema is source of truth) | both sides import; built to `dist`, symlinked |
| `parseCitations(input): Citation[]` | fn | validates each entry, drops malformed, strips unknown | used by the hydrate boundary; the wire sanitizer |
| `ContentScope` / `ScopeFilter` | zod schema → `z.infer` type | `{type:"bucket";bucketId;filter?}` \| `{type:"group";groupId;filter?}` \| `{type:"documents";documentIds;filter?}`; `ScopeFilter` = `Record<field, string\|string[]>` | B1 inc. 3 — one scope across the boundary; `filter` composable on every shape; discriminant `type` |
| `compileScopeFilter(filter): Record\|null` | fn | single→`{field:v}`, multi→`{field:{$in}}`, multi-field→`$and` | single materialization of the filter-field mechanism; composed with RBAC via `$and` in `searchGroundX` |
| `Template` / `TemplateSaveInput` | zod schema → `z.infer` type | `{id,kind:"extract"\|"report",name,body,ownerUsername,createdAt,updatedAt}`; save input = `{id,kind,name,body}` (NO owner/timestamps) | shared-template-lifecycle Phase 1 (2026-05-29). One artifact for Extract schema + Report template. `body` kind-discriminated; known core props validated, **default strip** (extras dropped not rejected → additions free; clean types — Phase-3 dropped `.passthrough()`); `category.type` free string. 🔒 owner server-assigned — save input strips it. Client: `app/src/api/templates.ts` (`saveTemplate`/`TemplateApiError`). |
| `TemplateField` / `TemplateCategory` / `ExtractBody` / `ReportBody` | zod schema → type | field `{id,name,type:STRING\|NUMBER\|DATE\|BOOLEAN,description,required?,instructions?,format?,identifiers?}` | app-facing strict types; `report` `sections` reserved (owned by `smart-report`) |
| `parseTemplate(input): Template\|null` | fn | validates + drops malformed | the Template boundary sanitizer (parallels `parseCitations`); used by the repo row-mapper + wire boundaries, no `as` cast |
| `ViewerStepKind` / `viewerStepKindSchema` | zod enum → `z.infer` | `ingest-picker\|doc-viewer\|extract-workbench\|interact-chat\|report\|integrate` | shared 2026-05-29 — middleware `toolCatalog` imports it (was a hand-typed cross-workspace mirror); app `ViewerStep["kind"]` compile-time-guarded equal via `ViewerStepKind.contract.test`; `chatRouter` validates wire `activeStepKind` with the schema (no `as` cast) |

> ✅ Citation collapsed (B1 inc. 2) + **aliases removed 2026-05-29**: app/mw now use shared `Citation`/`CitationTier`/`NormalizedBbox` **directly** — the intermediary aliases `ScenarioCitation`, `ChatCitation`, `AttributionTier` are GONE (per "I don't like aliases"); only same-name re-exports (e.g. `onboarding.ts` re-exporting `Citation`) remain. **`StructuredCitation` stays distinct** (LLM-verification shape: `{documentId,page,quote,answerSpan}`); `CitationLike`/`WireCitation` are intentional subsets.

## App ↔ middleware wire types — `middleware/src/services/chatRouter.ts` (Citation now shared; envelopes still local)

| Object | Mirrors (app) | Key properties | Note |
|---|---|---|---|
| `Citation` (middleware) | re-exports `@groundx/shared` | documentId,page,snippet?,bbox?(`NormalizedBbox`),tier?(`CitationTier`),confidence?,answerSpan? | ✅ single source (was 6× — collapsed B1 inc. 2) |
| `StructuredCitation` | — | `{documentId,page,quote,answerSpan}` | LLM verification shape; `quote→`render Citation mapping not traced (gap) |
| ~~`RagContentScope`~~ → shared `ContentScope` | re-exports `@groundx/shared` | `{type:"bucket";bucketId;filter?}` \| `group` \| `documents` | ✅ unified B1 inc. 3 (`kind`→`type`; `projectIds`→`filter.projectId`; `unknown`→explicit `null`); `deriveRagContentScope` (fn name kept) returns `ContentScope \| null` |
| ~~`AttributionTier`~~ → `CitationTier` | alias REMOVED 2026-05-29 | `assignTier` returns shared `CitationTier` directly | (no alias) |
| `ChatRouterRequest`/`Response`, `SuggestedAction`, `ProposedSchemaField`, `ProposalEnvelope` | partial app mirrors | wire envelopes | hand-duplicated; **no `shared/` contract package exists** |
