# ARCHITECTURE_NOTES — groundx-web-ui-scaffold

> External onboarding notes (kept OUTSIDE the repo). Branch: `workspace/groundx-v2-ui`.
> Lens: general new-engineer orientation. Started 2026-06-18.

## System summary

GroundX Studio web UI scaffold — a chat-driven document-onboarding + knowledge UI.
Users converse with an assistant that ingests/organizes documents (buckets, projects,
groups) and drives "viewer widgets" (PdfViewer, Extract, SmartReport, Integrate) over a
typed **scope**. Two-mode model: **Onboarding** (guided F1–F7 flow) and **Steady**
(everyday use). This repo is the canonical template that managed workspace projects are
cloned from, edited, and deployed (EKS via Helm).

## Tech stack

- npm-workspaces monorepo: `shared` · `app` · `middleware`
- Frontend (`app/`): Vite + React + TS + MUI/Emotion, react-router v7, formik/yup/zod,
  pdfjs-dist, framer-motion, react-markdown; Sentry + PostHog
- Middleware (`middleware/`): Express + TS, MySQL (mysql2), pdf-lib, helmet, rate-limit;
  pino + OpenTelemetry + Sentry + prom-client
- Shared (`@groundx/shared`): cross-cutting types + intent catalog
- Infra: Docker (frontend+middleware), Helm/EKS/ALB, GitHub Actions
- Planning: OpenSpec (`openspec/`); tests = Vitest + Playwright + contract tests

## Directory map

- `app/` — Vite/React frontend (contexts, conversation engine, 5-tier components, tools, views F1–F7, widgets)
- `middleware/` — Express API (DB persistence, GroundX/LLM service clients, scenarios, observability)
- `shared/` — shared types + intent catalog
- `openspec/` — planning source of truth: capability specs + active changes + wireframes
- `docs/agents/` — the real, maintained documentation (architecture, data-model, widget-contract, discipline)
- `deploy/` — Helm chart + nginx config
- `scripts/` — env setup, secret scan, smoke tests, deploy-asset checks

## Entry points

- Frontend: `app/src/main.tsx` → `app/src/App.tsx` (boots Sentry once, StrictMode)
- Middleware: `middleware/src/index.ts` → `middleware/src/app.ts`
- Shared: `shared/src/index.ts`

## How to run / test

```bash
npm install
PARTNER_API_KEY=... LLM_SERVICE=... LLM_MODEL_ID=... LLM_API_KEY=... npm run setup:env
npm run dev            # app :5173, middleware :3001 (frontend /api proxies to middleware)
npm run verify:preview # smoke (== smoke:dev)
npm test               # shared build + alias/env/deploy checks + app + middleware unit/contract
npm run test:e2e       # Playwright
```

## Top files to understand first (ranked, general lens)

1. `docs/agents/overview.md` — project's own summary, two-mode model
2. `docs/agents/architecture.md` — Shell + contexts skeleton
3. `app/src/App.tsx` — React tree, providers, routing (DONE — see below)
4. `docs/agents/data-model.md` — cross-layer reconciliation matrix
5. `middleware/src/app.ts` — Express wiring
6. `docs/agents/widget-contract.md` + `template-scope-results.md` — locked contracts
7. `docs/agents/discipline.md` — TDD / round-trip / OpenSpec / adversarial review rules

---

## Core data flow — a chat message, end to end (traced 2026-06-18)

The system's spine. Numbered hops with real files/functions:

**FRONTEND**
1. `conversation/ConversationFlow.tsx` (the one chat view) → `useConversation.ts`
   `send()` (`app/src/conversation/useConversation.ts:474`): optimistic user bubble,
   then calls `api.chat.streamChatMessage(...)` with `onToken`/`onActivity` callbacks.
2. `api` comes from `useApi()` (the injected client). `realApi.chat.streamChatMessage`
   → `api/chatSessions.ts:410`. First it `ensureChatSessionForSend` (idempotent
   `POST /api/chat-sessions` to guarantee a server row exists), then `POST /api/chat/messages`
   with `Accept: text/event-stream` + a client `turnKey` (idempotency key) + optional
   `Last-Event-ID` for reconnect. Consumes SSE frames via `api/sseFrames.ts`:
   `meta` → onMeta, `token` → onToken (append delta), `activity` → onActivity,
   `envelope` → final `SendChatMessageResult`, `error` → terminal throw. Reconnect logic:
   bare network drop retries (backoff ×attempt) and replays from `lastSeq`; HTTP error /
   error-frame / abort are terminal. 404 → invalidate ensure-cache so next send recreates row.

**MIDDLEWARE — route (`middleware/src/app.ts:1484`, `POST /api/chat/messages`)**
3. `apiLimiter` + `requireSession` → parse body → load chat-session row →
   `assertChatSessionOwnership` (403 on non-owner — closes the IDOR). Resolve
   `groundxApiKey` (session key OR partner key for anon) and the RBAC project set
   (`authorizedProjectIds`).
4. `chatTurnRegistry.getOrCreate(chatSessionId, turnKey, …)` → a `TurnRunner`
   (`services/turnRunner.ts`) wraps `handleChatMessage`. ONE engine drives both
   transports. Idempotent per `(chatSessionId, turnKey)`: a reconnect ATTACHES instead of
   re-generating. If runner is gone (evicted), a `Last-Event-ID` reconnect replays the
   PERSISTED answer from `getAssistantMessageByTurnKey` as a single envelope (no re-gen).
5. Streaming: `writeHead(200, text/event-stream)` + `pumpFramesToResponse(runner.buffer, …)`
   (`services/streamPump.ts`) drains frames honoring backpressure, 15s heartbeat; the
   runner keeps generating + persists even if the socket drops. JSON branch: `await runner.completion`.

**MIDDLEWARE — handler (`services/chatHandler.ts:228`, `handleChatMessage`)**
6. validate → load session (404 if missing).
7. Persist USER message first (durable even if LLM fails) → `repository.appendChatMessage`.
8. Build the **3-axis context bundle** (`contextBundler.bundleChatContext`): axis 1
   conversation (active summaries + live tail), axis 2 current entity (activeStepKind →
   journeyStage projection + extractedValues), axis 3 recent viewer events (last 10).
9. **Compression pre-flight** (two independent triggers, each fires ≤1×/turn):
   L1 `shouldCompress` (tail > ratio×context window) → `runCompression` folds oldest chunk
   into a leaf summary; L2 (active summaries > cap) → `runMetaCompaction` super-summary.
   Uses the LIGHT llm client when wired (`conversationCompressor.ts`).
10. **Route** (`chatRouter.routeChat`, `chatRouter.ts:92`): mode = UI intent hint (free) →
    else planner `planTurn` (light LLM) appState×documentSearch → else keyword
    `classifyChatMode`. Modes: `rag` | `structured` | `hybrid`.
    - `rag` → `ragPipeline.runRagPipeline`: derive `ContentScope` (`deriveRagContentScope`:
      documents → group → bucket(+projectId filter) → env samples bucket → null),
      `searchGroundX` (RBAC filter `$and`-composed) → `callGroundedLlm` (grounded answer +
      verified/tiered citations via `attribution`/`quoteEmbedder`).
    - `structured`/`hybrid` → `structuredHandler` (pages_remaining, onboarding_state, etc.).
11. Persist ASSISTANT message (answer + `citations_json` + provider/model + latency +
    turnKey). Persist each dispatched tool intent into `intent_log` (source `agent`,
    fire-and-forget). On router failure: persist an error-coded assistant row, throw a
    `ChatHandlerError` mapped to 501/504/502 (or 409 `superseded` if a newer turn aborted this one).
12. Return `{userMessageId, assistantMessageId, reply, compressionRan}` → becomes the SSE
    `envelope` frame → `useConversation` finalizes the assistant bubble.

**Persistence**: `AppRepository` interface (`middleware/src/db/`) — `mysqlRepository.ts`
(prod) or `memoryRepository.ts` (tests). Tables: `chat_sessions`, `chat_messages`,
`conversation_summaries`, `chat_session_entities`, `viewer_events`, `intent_log`,
`project_grants`, templates. DB is source of truth for both anon & authed; localStorage
is a cache.

## Key abstractions

- **Dependency injection at the seam (both sides)**: middleware `createApp({env, repository,
  partnerClient, groundxClient, llmClient, ...})` (`app.ts:222`) — real clients in prod,
  fakes injected in tests. Frontend mirrors it: `realApi` singleton via `ApiProvider`,
  `makeFakeApi` in tests. NO mock mode — real clients always; tests swap at the seam.
- **One generation engine, two transports (`TurnRunner`)**: streaming SSE and plain JSON
  both drive the same `handleChatMessage`; idempotent per `(chatSessionId, turnKey)` so a
  reconnect attaches/replays instead of double-generating. This is the key seam that makes
  streaming resumable.
- **3-axis context bundle**: every chat turn assembles (1) conversation history
  (compressed summaries + live tail), (2) current entity/viewer step, (3) recent viewer
  events — the LLM's situational awareness. Compression is a 2-level leaf+meta scheme.
- **ContentScope + scope derivation**: a typed union (documents/group/bucket(+filter)) that
  flows from the active entity → GroundX search. `deriveRagContentScope` is the precedence
  ladder; env samples bucket is the anon fallback.
- **DB is source of truth** (anon and authed); localStorage is a cache. Anon `chat_sessions`
  get a server row from day one; F6 sign-up re-keys via `/api/chat-sessions/claim`.
- **Ownership/IDOR discipline**: every mutating route loads the row and calls
  `assertChatSessionOwnership` (authed→ownerUserId, anon→cookie ownerAnonId; mutually
  exclusive). Server-derived role/RBAC (`callerRole`, `rbacFilter`) NEVER trusted from client.
- **Two-mode model**: Onboarding (F1–F7) vs Steady. URL is the source of truth for which
  surface mounts.
- **Scope / Template / Results**: Result = Template (questions) + Scope + answers. Extract &
  Report share the meta-pattern. (Docs read, not yet code-verified.)
- **5-tier component tree** + widget contract (drift-guarded). (Not yet deep-dived.)

---

## Per-module notes

### `app/src/App.tsx` (+ `main.tsx`, `router/router.tsx`, `api/client.ts`) — deep dive 2026-06-18

**Single responsibility:** compose the production provider stack and mount the router.
Tiny (106 lines), heavily self-documenting.

**Two exports:**
- `AppProviders` — the full provider stack, factored out so tests can mount it around any
  probe without the router. Takes an optional `apiClient` prop (defaults to `realApi`).
- `App` (default) — wraps `AppProviders` around `<RouterProvider>` + `<DebugOverlay>`.

**`main.tsx`:** `initSentry(VITE_SENTRY_DSN)` (no-op when DSN unset → dev/CI/preview), then
renders `<App/>` in `React.StrictMode`.

**Provider order (outer → inner) — ORDER IS LOAD-BEARING:**
```
ApiProvider                 (outermost — others read useApi())
 └ AppErrorBoundary         (captureException from injected client)
  └ GxThemeProvider
   └ MotionRoot             (global MotionConfig, honors prefers-reduced-motion; 80ms floor)
    └ WireframeFilters      (global SVG defs for wireframe edges; sibling, not a provider)
    └ AnalyticsConsentProvider
     └ LoadingProvider
      └ MessageBarProvider
       └ DocumentsProvider  (deliberately above AuthProvider — every widget can read it)
        └ AuthProvider
         └ AppModeProvider
          └ ScenarioRegistryProviderWithDemoHooks
           └ OnboardingSessionProvider     (** see ChatStore note below **)
            └ CanvasOrchestratorProvider
             └ OnboardingSkillProvider
              └ HelmetProvider
               └ children
```

**Router (`router/router.tsx`)** — `createBrowserRouter`, future flag `v7_startTransition`
only (intentionally NOT `v7_relativeSplatPath` — would change splat-route link resolution).
Routes:
- `/` → `AppInitialization` + Outlet; `""` redirects to HOME; `Home` is an auth-aware
  redirect (anon → /onboarding; signed-in → /c/<lastSessionId> or /onboarding), NOT marketing.
- Auth: `/login`, `/register`, `/reset-password`; `/health` (k8s probe, under `views/_scaffold/`);
  `/banned` (load-bearing for axios 403-on-archived-customer + Login banned branch).
- `PublicOnboardingLayout` → onboarding surfaces. URL is source of truth; `OnboardingShell`
  reads params/location and dispatches. A `/:bucketId/:scenarioId/*` splat catches unknown
  sub-paths so they don't trip the error boundary.
- `ProductRouteLayout` (`AppInitialization` → `ProductRouteModeBoundary` (forces signed-in +
  steady) → `OnboardingProvider` → Outlet) → `SteadyShell` (`/c/:sessionId`),
  `WorkspacesView`, `ProjectsView` (scoped conversations via shared `ConversationFlow` +
  looked-up `ChatExperience`).

**`api/client.ts` — the network composition root:** `realApi` is a module singleton (STABLE
ref — safe in useEffect deps). Grouped members: `auth`, `session`, `chat`, `viewerEvents`,
`intent`, `scenario`, `workflow`, `template`, `telemetry`, `report`, `extract`, plus spread
`legacyApiMembers` (partner*/groundx* entity modules). New API fns are added HERE + to
`makeFakeApi`, never imported at call sites. `useApi()` is the only consumer entry. Notable
internal wiring: anon-session lazy-issue (`ensureAnonSession`) + `chatSessionEnsure` injected
into chat/patch/viewerEvent/report/extract calls so server-row creation is guaranteed before
dependent writes.

**Non-obvious / load-bearing:**
- Provider order MUST equal the runtime mount; `App.test.tsx` smoke-verifies the chain.
  A 2026-05-25 prod crash (`useDocumentsContext` missing) came from a test helper having
  `DocumentsProvider` while App didn't — documented in the file as a burned-in lesson.
- `ApiProvider` is outermost on purpose: consumer providers read the injected client.
- `DocumentsProvider` is above `AuthProvider` on purpose.
- `DebugOverlay` mounts beside the router (reads `window.location.search`), gated on
  `?debug=true`; renders null otherwise. Single dev menu (includes intent-firing panel).

**RESOLVED contradiction — where ChatStore mounts:** The router comment claims
`ScenarioRegistry` + `ChatStore` are "provided app-wide by AppProviders," but there is NO
`<ChatStoreProvider>` in `App.tsx`. Verified the real chain:
`OnboardingSessionProvider` (in AppProviders) → renders `EntitySessionStoreProvider`
(`OnboardingSessionContext.tsx:482`) → renders `<ChatStoreProvider>`
(`EntitySessionStoreContext.tsx:119`). So ChatStore IS app-wide, but the nesting is hidden
inside `OnboardingSessionContext`, not spelled out in `App.tsx`. `CanvasOrchestrator` has
opt-in ChatStore wiring (`CanvasOrchestratorContext.tsx:79`).

---

## Open questions / things I don't understand yet

RESOLVED in Phase 2 (2026-06-18):
- ✅ End-to-end chat flow traced (see "Core data flow"). SSE path, TurnRunner, handler,
  router, RAG pipeline, persistence all confirmed against code.
- ✅ Middleware route/middleware stack mapped (`app.ts` — helmet/CSP, metrics, pino, cors,
  session, csrf, rate-limit; ~25 routes; ownership-checked mutating routes).

STILL OPEN:
- Why `OnboardingSessionProvider` owns the ChatStore/EntitySessionStore mount (vs. a
  dedicated provider in App.tsx) — design intent unclear; likely a migration artifact
  (docs mention `EntityRegistry` → `EntitySessionStore` rename). Even in Steady mode the
  ChatStore comes through OnboardingSessionProvider — verify that's intentional.
- `ScenarioRegistryProviderWithDemoHooks` — what the "DemoHooks" wrapper adds vs. plain
  ScenarioRegistryProvider. Not yet read.
- Streaming/resume machinery internals: `TurnRunner` + `streamPump` + `turnEventBuffer` +
  `streamSink` (supersede-cancel via ambient AbortSignal) — traced the contract, not the impl.
- RAG + citation core: `searchGroundX`, `callGroundedLlm`, `attribution`/`quoteEmbedder`
  verify+tier logic, `parseGroundedAnswer` — the citation philosophy is heavily speced
  (locked 2026-06-14) but the impl is unread.
- Persistence layer: `AppRepository` interface + `mysqlRepository` schema/migrations and
  the round-trip drift guards (`persistedColumnPolicy.test.ts`, recurrence-drift-guards).
- The Template/Scope/Results lifecycle and the 5-tier widget contract — read the docs but
  not verified against code.
- OpenSpec workflow in practice: how active `changes/` map to shipped code; the locked
  active set (8 changes / 21 steps) referenced in AGENTS.md.

## How to resume

Re-read this file first. Strong next deep-dive targets (Phase 3), in priority order:
1. `TurnRunner` + `streamPump` (streaming/resume — the cleverest machinery here)
2. `ragPipeline` + grounded-answer/citations (the RAG + citation-verify core)
3. `AppRepository` + MySQL schema (persistence + the round-trip contract docs stress)
