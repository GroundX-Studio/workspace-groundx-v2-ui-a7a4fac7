# Core data-model hardening — turn the data structures into real, shared classes/objects

> **DISPOSITION (2026-05-31): umbrella inventory — being decomposed, not executed as one change.**
> This was the pass-1 inventory of structural debts. Its live work was largely delivered via the
> archived `2026-05-31-core-data-followups` (§1–§5 + security), and the remaining wide folds were
> extracted into focused changes: `2026-05-31-chat-wire-types-shared`,
> `2026-05-31-canvas-intent-schema-shared`, `2026-05-31-session-auth-subshapes`,
> `2026-05-31-viewer-history-column-drop` (see `docs/agents/phase-3-execution-order.md`). This change
> is NOT auto-closed: it needs a reconciliation pass to mark delivered items done, extract any
> genuinely-uncovered item (e.g. the `ExtractedFieldValue` ↔ `RenderedSection` "generated result"
> unification, item #2) into its own focused change, and then retire. Do not execute it as-is.

## Why

A pass-1 inventory (`docs/agents/data-model.md`) surfaced 11 structural debts: duplicate types,
placeholder/loose typing left over from foundation phases, hand-mirrored unions, Extract-specific
one-offs that Report must reuse, and "contracts" enforced only by tests instead of being real
classes/objects. These are foundations a production app must get right; left as-is they force hacks
(e.g., InteractView polling because `ChatMessage.citations` is commented out). This change is the
single tracked home for fixing them — **each is a task, not a silent TODO**.

## What changes (each item is a tracked task in `tasks.md`)

1. **Shared `Template` lifecycle** — ✅ **DONE, shipped via the archived `2026-05-29-shared-template-lifecycle`**
   (Template carries NO version + NO scope; `templates` table is `id,kind,groundx_username,name,body_json,…`).
   Listed for inventory completeness + numbering; **not active work in this change**.
2. **Shared "generated result"** — unify `ExtractedFieldValue` ↔ report `RenderedSection`.
3. **`ContentScope` + composable `filter`** — ✅ **DONE** (shared `ContentScope` + `filter` on every shape + `compileScopeFilter` landed).
4. **One `CanvasIntent`** — replace ChatStore's `Record<string,unknown>\|null` placeholder with the
   real Orchestrator union (type-only re-export of the orchestrator's leaf types module; erased at
   runtime, so no circular dep).
5. **`ScopedViewerWidget` as a real base class/object** — not just a props interface + test: a base
   the four main viewer widgets extend, carrying `scope` handling + `show_*` tool registration +
   registry membership.
6. **Promote `ChatMessage.citations`** — real field; ChatColumn writes citations on append; consumers
   (InteractView litRegions, `CiteChip`, report-pin) read from ChatStore (removes the poll hack).
7. **`ScopedViewerWidget`/widget/tool base objects** — widgets and tools become real base
   classes/objects with a registry, replacing test-only convention.
8. **`ContentScope.filter`** wiring into Extract + search (consistency).
9. **`ScenarioCitation` → `Citation`** — drop the duplicate (re-export or replace usages).
10. **Single `ViewerStepKind` source** — stop hand-mirroring the server copy of `ViewerStep`'s kinds.
11. **SDK/entity context factory** — collapse the 8 hand-rolled CRUD contexts onto a
    `createEntityContext<T>()` factory over `SdkActionResult<T>`.

### Added 2026-05-30 (philosophy audit — further structural debts)

12. **Field-type union → shared.** The union `"STRING"|"NUMBER"|"DATE"|"BOOLEAN"` is re-spelled ~10×
    (`api/extractField.ts` `ExtractFieldType`, mw `fieldExtractor.ts` `SchemaFieldType`, + 8 inline). It
    ALREADY exists in `@groundx/shared` as `TemplateFieldType` — import it everywhere (pure dedup).
13. **`ExtractFieldResult` → shared.** The `POST /api/extract-field` request/response body is typed
    independently app-side + mw-side (a boundary twin). Define once in `@groundx/shared`. Also fold the
    **3rd `SuggestedAction` copy** (`SuggestedActionChips.tsx:43`, beyond the chatSessions↔chatRouter
    pair item 9-area already notes) onto one shared type.
14. **Orchestrator `dispatch()` conforms to its durable spec.** Replace the 9-branch `if`-chain in
    `CanvasOrchestratorContext` with a single `switch (intent.kind)` + `never` exhaustiveness (so a new
    `CanvasIntent` kind fails type-check instead of silently no-op), and **delete the retired-but-live
    `registerAdapter`** (zero callers) — `app-architecture/spec.md:249-253` already mandates exactly this.
15. **`SdkActionResult<T>` → discriminated union.** `{ isSuccess: true; response: T } | { isSuccess: false; error }`
    so the `{ isSuccess:false, response:null, error:null }` limbo is unrepresentable; route `AuthProvider`'s
    `{ isSuccess, error }` two-boolean twin through it. Do this AS PART OF item 11 (the factory builds on it).
16. **`selectActiveStep(session)` selector.** One ChatStore selector replaces the
    `stepIndex >= 0 ? history[stepIndex] : null` idiom hand-rolled 9× across 6 files.

**LOW (UI-layer; could split to their own change):**
- **Scenario-capability flag, not a hardcoded id** — `ExtractView.tsx:476` `supportsJsonRender = scenarioId === "loan"`
  → a `ScenarioConfig` capability flag (read data, don't branch on an id). Same shape as the
  `IntegrateView`/`InteractView` hardcoded-id reads (those are TODO/WF-05 tracked).
- **`PasswordField` primitive** — the show/hide toggle is copy-pasted across the 3 auth forms; extract a
  `components/primitives/PasswordField`.

### Added 2026-05-30 (multi-round sweep — clusters)

17. **Round-trip / dead-plumbing closeout (§9).** Each persist chain gets a reader+writer or is dropped
    (the `attachments_json` precedent): `chat_sessions` `viewer_history/overlays/workspace` cols (persist
    chain ships but the ViewerSession mutators issue no PATCH → NULL on reload); `chat_messages`
    telemetry cols (`llm_provider/llm_model_id/latency_ms/error_code/tool_calls_json`, written never read);
    `intent_log` (write-only at runtime — `listIntentLog` only in tests). *(The worst case — the
    `chat_session_entities` RAG-scope columns — is its own change `2026-05-30-entity-rag-scope-roundtrip`.)*
18. **Shared wire-types module + a real drift test.** Fold the app↔middleware wire twins onto `@groundx/shared`
    `z.infer` schemas: the whole `/api/chat/*` envelope (`ChatReply`/`ChatReplyDebug`/`ChatDispatchedIntent`/
    `ChatToolFailure` ↔ `ChatRouterResponse`/…, inline `_debug.scope`, `CreateChatSessionResult`, `scopeHint`),
    `AppUserMetadata`, the 7× `eventSource` enum (diverged from `IntentSource`), the WF-03 page-dim shape,
    `SchemaFieldExtractionResult`, the two customer-auth client modules. **Upgrade the tool-catalog drift
    guard from name-set to DESCRIPTION-level** (`toolCatalog.test.ts` — 6/8 mirrored descriptions already drifted).
19. **`assertChatSessionOwnership` helper.** Collapse the 6-way copy-pasted ownership/403 guard
    (`app.ts:670/769/897/971/1105` + the already-drifted twin at `:472` returning a different error code)
    into one helper — a security-critical fork.
20. **Illegal-states (extends #15).** Session auth state as a discriminated union
    (`{kind:"anon"} | {kind:"authed";groundxUsername;groundxApiKey}`) replacing the empty-string
    `groundxUsername` sentinel + ~12 empty-string checks; `LoginReqCallback`/`SchemaFieldExtractionResult`
    flat-record→union; a `parseChatStoreSnapshot(unknown)` validator on the localStorage rehydration
    (currently the version check is the only guard).

## Relationship to other changes

- **`smart-report` depends on** items 1, 2, 3, 5, 6 (shared Template, generated result, scope filter,
  ScopedViewerWidget base, promoted citations). Items **1 & 3 are already shipped** (archived / done);
  the still-active prerequisites are **2, 5, 6** — sequence those before/with smart-report.
- Items 4, 9, 10, 11 are independent cleanups; do under the WIP cap as capacity allows.

## Out of scope

- New product behavior — this is structural. Each item must land behind green tests with no
  user-visible regression.

## Affected

- App: `types/onboarding.ts` (`ContentScope`, `Citation`), `types/scenarios.ts`, `contexts/*`
  (`ChatStoreContext` types, `CanvasOrchestratorContext`, SDK contexts), `components/` (widget bases),
  `app/scripts/check-tool-quality.mjs`.
- Middleware: `services/toolCatalog.ts` (`ViewerStepKind`).
- Specs: `app-architecture` (the durable contracts: single CanvasIntent, ScopedViewerWidget base,
  `ChatMessage.citations`, single ViewerStepKind); `agent-tools` is touched only for the ViewerStepKind
  axis here — the tool **role/`availableIn`** migration (`mode`→`WidgetRole`, category-doesn't-gate-visibility,
  the middleware `SERVER_TOOL_CATALOG` role axis) is owned by **widget-role-access**, NOT this change.
  The shared Template lifecycle + its `templates` table live in the archived
  `2026-05-29-shared-template-lifecycle` change, not here.

## Conformance to core architectural decisions

- **Composable, not forked** — each fix unifies a duplicated shape onto one shared object/type
  (one `CanvasIntent`, one `ViewerStepKind`, one `Citation`, one entity-context factory). It removes
  forks; it does not add parallel implementations.
- **Reuse `@groundx/shared`** — shared wire types (`Citation`, `ContentScope`) are defined once in
  `@groundx/shared` and imported by both app and middleware; this change reuses that boundary rather
  than re-declaring types per side.
- **Done-able** — every item is behavior-preserving and lands behind green tests with no user-visible
  regression; each is a tracked task in `tasks.md`, not a silent TODO.
