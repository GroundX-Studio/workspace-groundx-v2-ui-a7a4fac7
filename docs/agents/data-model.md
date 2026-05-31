# Data model — reference (facts only)

Running list of the data structures that power the app: inheritance/composition, key properties,
where used. **Facts only — no assessment** (design critique lives in the `core-data-model-hardening`
OpenSpec change, not here). Keep simple; append as the model grows.

## Before you add a widget / type / tool / context (READ THIS FIRST)

Reuse the shared base; do not fork or placeholder. The codebase's good patterns to follow:
`AppRepository` (interface + `implements`), `SdkActionResult<T>`, `WidgetTool` (`tools/types.ts`),
the planned `Template` / `ScopedViewerWidget` / `ApiError` / `Catalog<T>` bases.

- **New data catalog** (looked up by id + enumerated) → satisfy the shared `Catalog<T>` read contract (`all(): readonly T[]`, `byId(id): T | undefined` — never a `resolve(context)` dispatcher, never a state store); enforce id uniqueness with `assertUniqueIds(items, idOf, sourceOf?)`. Contract + helper land via `registry-catalog-consistency` (in `@groundx/shared` if isomorphic, else `app/src/lib/catalog`) — NOT yet shipped; build NEW catalogs against it. Targets: `toolRegistry`, `ScenarioRegistry`, `chatExperienceRegistry`. (A mutable state store is NOT a catalog — see `EntitySessionStore`.)

- **New viewer surface** → build on `ScopedViewerWidget` (props `{scope: WidgetScope (required), role: WidgetRole}` + a `show_*` tool + registry); copy `components/_template/`. NOTE: code TODAY ships `mode` (not `role`) and `scope` is not yet required everywhere (`PdfViewerWidget` still takes a raw `documentId`); `scope`-required + `role` are the migration target via `widget-role-access` — build NEW work against `{scope, role}`.
- **New widget** → copy `components/_template/`; ship README + sibling test + `role` prop (today `mode` — migrating via `widget-role-access`) + a `*.tools.ts` (or `no-llm.md`).
- **New "questions+output" feature** → instantiate the shared `Template` lifecycle; do NOT make a new schema/template object or table.
- **New scope need** → extend `ContentScope` (filter is composable); never hardcode a shape.
- **New API error** → extend the base `ApiError`; don't hand-roll `extends Error`.
- **New type** → check it isn't a dup (e.g. `Citation`); no `Record<string,unknown>` placeholder in typed state.
- **New tool** → mirror app `*.tools.ts` + middleware `SERVER_TOOL_CATALOG`, allowlisted verb, drift guard green.
- **Always** update this file in the same change (closeout step). Unfinished → a backlog task, never a stub.

## Domain value types — `app/src/types/`

| Object | Inheritance / composes | Key properties | Where used |
|---|---|---|---|
| `ContentScope` | re-exports `@groundx/shared` | `{type:"bucket";bucketId;filter?}` \| `{type:"group";groupId;filter?}` \| `{type:"documents";documentIds[];filter?}` | ✅ B1 inc.3 — shared union, composable `filter` on every shape; search, Extract, Report, `CanvasIntent` |
| `Citation` / `CitationTier` | re-exports `@groundx/shared` (`types/onboarding.ts`) | `documentId, page, bbox?, snippet?, confidence?, tier?, answerSpan?` | `CiteChip`, chat, extract, report |
| ~~`ScenarioCitation`~~ → `Citation` | alias REMOVED 2026-05-29 | `ExtractedFieldValue`/`SampleChatTurn` use shared `Citation` directly | (no alias) |
| `CitationTier` | union | `"exact"\|"paraphrase"\|"ambient"` | `Citation`, highlight precision |
| `AppMode`/`Scenario`/`FFrame`/`GateTrigger`/`AuthState` | unions | literal sets | shell, session, nav |
| `ScenarioConfig` | composes `ScenarioManifest`, `ScenarioDocument[]` | `id, order, documents[], manifest` | `ScenarioRegistry` |
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
| `_template/` scaffold | files to copy | `Template.tsx/.test.tsx/.tools.ts/README` | starting point for every new widget |
| `WidgetTool<TSchema>` | generic | `name, description, input(Zod), category, handler` | `tools/types.ts`; registry auto-discovers; `availableIn?: ToolMode[]` (migrating to `WidgetRole[]`) |
| `ToolCategory` / `ToolMode` | unions | `read\|mutate` / `onboarding\|steady` | tool confirmation model. Code TODAY ships `ToolMode` + `availableIn?: ToolMode[]` (`tools/types.ts:20,71`); these migrate to `WidgetRole` + `availableIn?: WidgetRole[]` (a source-of-truth Zod enum in `@groundx/shared`, tool visibility gated by `availableIn` only) via `widget-role-access` — NOT shipped. Build NEW tools against `WidgetRole`. |
| App tool decl | `*.tools.ts` → `WidgetTool[]` | per widget | auto-discovered glob → `registry.ts` |
| `ServerTool<TSchema>` | — | `name, schema, …` | `SERVER_TOOL_CATALOG[]` |
| `ViewerStepKind` | string union | same kinds as `ViewerStep` | server mirror |
| `ALLOWED_VERBS` | const | verb prefixes | `check-tool-quality.mjs` |

## API result / error — `contexts/sdkContextTypes.ts`, `api/`

| Object | Inheritance | Key properties | Where used |
|---|---|---|---|
| `SdkActionResult<T>` | generic | `isSuccess, response:T\|null, error` | all SDK contexts |
| `SaveExtractionSchemaInput`/`Result` | — | `id, name, schema` / `id, name, updatedAt` | save-schema API |
| `ExtractionSchemaApiError`, `ExtractFieldApiError`, `ChatApiError` | each **extends `Error`** (no shared base) | `status, detail` | app API clients |
| `ChatHandlerError`, `ChatRouteNotImplementedError`, `UpstreamHttpError`, `UpstreamTimeoutError` | each **extends `Error`** | ad-hoc | middleware services |
| `SdkListResponse<T>` / `SdkMessageResponse` + GroundX domain types (`Bucket`, `GroundXApiKey`, …) | interfaces | list/message envelopes + entity shapes | `api/entities/sdkTypes.ts`, **16** entity wrappers (more if root `api/*.ts` counted) |

## Middleware persistence — `middleware/src/db/`

| Object | Inheritance | Properties / tables | Where used |
|---|---|---|---|
| `AppRepository` | interface | persistence methods | the contract |
| `MySqlAppRepository`, `MemoryAppRepository` | **implement `AppRepository`** | — | prod / mock |
| DB tables | SQL | `sessions, app_user_metadata, chat_sessions, chat_messages, conversation_summaries, chat_session_entities, viewer_events, intent_log, extraction_schemas, templates` | `templates` (shared-template-lifecycle Phase 2): `id,kind,groundx_username,name,body_json,created_at,updated_at` (no `version`). Idempotent copy from `extraction_schemas` (kind='extract') at startup; legacy table kept (deprecated). Repo: `saveTemplate`/`getTemplate`/`listTemplates(user,kind)` + `TemplateRecord`; `rowToTemplate` guards `kind` via shared `templateKindSchema`. **Phase 3 (DONE):** `POST /api/templates` (owner from session), `saved_schemas` reader + client `templates.ts`/`saveTemplate` all cut over; the legacy `extraction_schemas` repo methods + `ExtractionSchemaRecord` were removed (table kept, read only by the copy-migration). |
| `chat_messages` cols | SQL | `citations_json` + `tool_calls_json` are **persisted AND projected** to the client on hydrate (`chatHandler.ts:454-455`, `app.ts:487-504`); `attachments_json` is the **only dead write column** (always null). Gap is **client-side**: `ChatMessage` type omits the `citations` the server already sends | + `llm_provider/model_id/latency_ms/tokens` |
| `chat_session_entities` cols | SQL | `bucket_id`, `project_ids_json`, `group_id`, `document_ids_json`, `extracted_values_json`, `scan_progress_json`, `completed_frames_json`, `last_frame` | The four scope columns (`bucket_id`/`project_ids_json`/`group_id`/`document_ids_json`) **exist and are READ** by `deriveRagContentScope` (`chatHandler.ts:528`) but have **no producer yet** — the only writer (`app.ts:803-810`) preserves them as `existing?.X ?? null`. For anon onboarding all four are NULL by design → samples-bucket fallback (not a bug). The steady-mode/BYO producer that writes a real customer scope is **future** (sequence with `cf19`/CF-15, which thread these columns into the reader). |
| `MessageResponse` / `SdkMessageResponse` | interfaces | `{message}` (dup) | `api/common.ts` + `api/entities/sdkTypes.ts` |
| citations hydrate projection | code | **VALIDATED (B1, 2026-05-29):** `app.ts` messages-hydrate now runs `citations_json` through `parseCitations` (`@groundx/shared`) — drops malformed, strips unknown keys; no longer ships `unknown[]` | guarded boundary |
| union-typed DB columns | SQL | `role`, `last_frame`, `entity_key`, `action`, `source`, `intent_kind` are bare `VARCHAR` (no CHECK/ENUM); row mappers use `as`/`Array.isArray` | no DB-level union guard |
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
