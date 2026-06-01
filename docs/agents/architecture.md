# Architecture

What the app actually looks like in code. Frontend first, then
middleware, then the contracts between them.

## Frontend shell

The canonical AppShell mounts on both onboarding and steady routes
(ARCH-06/07). Onboarding-only chrome (F1 picker overlay, sign-up
overlay) z-stacks on top.

```
OnboardingShell                               <- root, mounted at /onboarding/*
├── OnboardingNav                             <- shell-level, always mounted
│   - Labeled (180px) ↔ icon rail (48px), chevron toggle
│   - State persisted in localStorage via useOnboardingNavCollapsed
│   - Logged-out items: W/P (disabled), Book-a-call CTA, Docs
├── F1 IngestView overlay (when currentFrame === f1)
├── Sign-up overlay (when viewer.overlays carries a `sign-up` entry)
└── AppShell 3-pane
    ├── (nav slot empty; nav is shell-level above)
    ├── ChatColumn                            <- the chat-side narrative
    │   - F2..F5 + scenario → F2ConversationFlow (header + bubbles + thinking + Pick-a-view + live chat input + CiteChips)
    │   - F2 BYO no scenario → ByoChatPlaceholder
    │   - F1 idle → IdleChatPlaceholder
    │   - Gate active → GateChatPanel
    │   - `mode="steady"` (mounted by SteadyShell) → SteadyConversationFlow
    └── Canvas slot (driven by `viewer.currentStep.kind`)
        ├── `doc-viewer`         → UnderstandView (mounts PdfViewerWidget)
        ├── `extract-workbench`  → ExtractView (F3/F3a — schema-driven fields panel)
        ├── `interact-chat`      → InteractView (F5)
        ├── `integrate`          → IntegrateView (F7 — stub)
        └── `ingest-picker`      → null (IngestView lives in the overlay above)
```

SteadyShell at `/c/:sessionId` mounts the same AppShell with
`mode="steady"` widgets — ChatColumn + PdfViewerWidget (when
`viewer.currentStep.kind === "doc-viewer"`).

F1↔F2 transition: the nav doesn't animate (stable). Only the chat
+ canvas panes slide. The `SlideOverlay` carries the F2 chrome
during the leaving phase (via override props on `ChatColumn` and
`UnderstandView`) so the user sees content slide away, not blank
rectangles.

## Component tier (locked, ARCH-01/03/08/14/15/16/18)

Five-tier component tree under `app/src/components/`:

```
components/
├── primitives/        <- MUI-mirrored building blocks (Button, Dialog, Card, ...)
├── brand/             <- product-brand-locked semantics (CiteChip, Heading, BodyText, GxPill, ...)
├── layout/            <- shell + nav + step-strip (AppShell, OnboardingNav, StepStrip)
├── chat-widgets/      <- render inside the chat scroll body
└── viewer-widgets/    <- render inside the viewer pane
```

The contract is enforced by `app/src/test/widget-contract.test.ts`
(every chat-widget + viewer-widget MUST have a sibling README + test
+ `mode: "onboarding" | "steady"` prop). The no-hardcoded-styles
drift guard at `app/src/test/no-hardcoded-styles.test.ts` walks every
`.tsx` under `components/` + `views/`. Full contract:
[`widget-contract.md`](./widget-contract.md).

## Frontend contexts (top to bottom)

| Context | Lives in | What it owns |
|---|---|---|
| `AppModeContext` | provider mounts in `App.tsx` | App-wide mode (onboarding / steady), auth state, current scenario id |
| `ChatStoreContext` | **root state container** | `sessions: Map<id, ChatSession>` (each carries a paired `ViewerSession`). Actions: `appendMessage`, `appendViewerEvent`, `pushStep`, `pushOverlay`/`mutateOverlay`/`popOverlay`, `gotoDocViewer`, plus the schema-overlay mutators. DB-source-of-truth for anon + authed (since 2026-05-25); localStorage is a cache |
| `EntityRegistryContext` | thin facade | `useEntityRegistry()` reads from `ChatStore.activeSession.entities`. Mutation actions delegate to ChatStore. Provider auto-mounts ChatStoreProvider with seed-or-rehydrate |
| `OnboardingSessionContext` | façade | Exposes `state` (current frame, scenario, gate) + actions (`pickScenario`, `advanceFrame`, `openGate`, `dismissGate`, `commitGate`). Each action emits a ViewerEvent + pushes a ViewerStep via ChatStore |
| `ScenarioRegistryContext` | loads `/api/scenarios` | Scenarios + bucketId for canonical URLs |
| `CanvasOrchestratorContext` | **live (post-mvs-cleanup)** | Generic `dispatch`/`registerAdapter` surface for `CanvasIntent` union; named convenience channels `openCitation` (push citation-peek overlay) + `docOpened` (append assistant chat message). Built-in handler for `highlightCitation` routes to `ChatStore.gotoDocViewer`. Soft-degrade when no ChatStoreProvider is in the tree |
| `OnboardingSkillContext` | empty stub | Plugin-loaded skills; loader not yet implemented |

Order in the provider tree: `AppMode` → `ChatStore` (via
`EntityRegistryProvider`) → `OnboardingSession` → `ScenarioRegistry`
→ `CanvasOrchestrator` / `OnboardingSkill` → views.

`AgentToolBusContext` was retired in widget-llm-integration Phase 2
(2026-05-27). The architectural replacement is the declarative widget
tool registry (`app/src/tools/registry.ts`, Phase 3) — each widget
ships its own `<Name>.tools.ts`, the registry auto-discovers them at
boot, and the middleware emits tool calls via native LLM function
calling rather than via an in-app event bus. The retired bus had
zero production consumers.

## ChatSession + ViewerSession (master pairing)

Every `ChatSession` carries a paired `ViewerSession` — both are
**accumulating** (history never erased) and **persisted server-side**.

```
ChatSession {
  id, title, messages[], summaries[], entities[], activeEntityKey,
  pendingSchemaOverlay,                  // projected into viewer.workspace.schemaOverlay
  viewer: ViewerSession {
    history: ViewerStep[],               // accumulates; never erased
    currentStep: { stepIndex: number },  // index into history; -1 = empty
    overlays: ViewerOverlay[],           // transient, z-stacked on current step
    workspace: { schemaOverlay }
  }
}

ViewerStep =
  | { kind: "ingest-picker", attachedSchema? }
  | { kind: "doc-viewer", documentId, page?, highlight?: { page, bbox?, sourceCitationIndex? } }
  | { kind: "extract-workbench", scenarioId, focusedCategoryId? }
  | { kind: "interact-chat", scenarioId }
  | { kind: "report" }
  | { kind: "integrate" }

ViewerOverlay =
  | { kind: "sign-up", state: "pending" | "done" | "dismissed", cause? }
  | { kind: "citation-peek", documentId, page, bbox? }
  | { kind: "book-call" }
```

Persistence: 3 JSON columns on `chat_sessions` —
`viewer_history_json`, `viewer_overlays_json`, `viewer_workspace_json`.
Idempotent migration (`ensureChatSessionsViewerColumns`) ALTERs in
missing columns on existing deployments. RT-04 PATCH semantics merge
the three fields with null-preserving semantics.

The render path reads `viewer.currentStep.kind` (with a
`currentFrame`-derived fallback) to pick the canvas widget. The
overlay stack renders on top.

## Frontend routing

```text
/                              → Dashboard (scaffold)
/home                          → Home
/auth/login                    → Login
/auth/register                 → Register
/onboarding                    → OnboardingShell (F1 picker)
/onboarding/signup             → OnboardingShell (F1 → F2 BYO transition)
/onboarding/:bucketId/:scenarioId → OnboardingShell (active scenario)
/c/:sessionId                  → SteadyShell (placeholder)
/status, /health, /banned      → scaffold views
```

## Middleware shape

```
middleware/src/app.ts (createApp)
├── helmet + CSP
├── pino-http (kube-probe + /api/metrics suppressed)
├── cors + json + urlencoded + cookieParser
├── sessionMiddleware
├── auth-rate-limiter
├── /api/healthz
├── /api/metrics (Prometheus)
├── /api/auth/*       → register, login, logout, me, password reset/confirm
├── /api/me/metadata  → app_user_metadata round-trip
├── /api/onboarding/session  → anon session bootstrap
├── /api/chat-sessions/claim → login-claim BFF (Phase H — re-key by anon id)
├── /api/chat-sessions       → POST (create), GET (list, signed-in only — RT-05)
├── /api/chat-sessions/:id   → PATCH merge (RT-04: currentIntent, activeEntityKey, viewerHistory, viewerOverlays, viewerWorkspace)
├── /api/chat-sessions/:id/messages          → GET (RT-01 hydrate; citations parsed from citations_json)
├── /api/chat-sessions/:id/entities/:key     → PUT upsert + server-side merge (RT-03)
├── /api/viewer-events       → POST (RT-02 — citation-clicked, frame-advanced, intent-dispatched, ...)
├── /api/intent              → POST (UI-10b — canvas-orchestrator dispatch trail)
├── /api/chat/messages       → chatHandler: validate → persist user → context bundle → routeChat (mock OR live RAG/structured/hybrid) → persist assistant + citations_json
├── /api/extract-field       → focused per-field extraction for ProposeCard Accept
├── /api/extraction-schemas  → save schema-agent templates
├── /api/scenarios           → ScenarioRegistry list
├── /api/v1/*                → GroundX customer-scoped proxy (uses session's groundx-api-key)
├── /api/customer|apikey|bucket|group|project → Partner API proxy
├── /api/llm/*               → LlmClient proxy
└── error handler (5xx leaks no detail to client; full to logs)
```

## Repository interface

`middleware/src/types.ts` defines `AppRepository`:

```ts
interface AppRepository {
  createSchema(): Promise<void>;
  createSession / getSession / deleteSession   // server sessions
  upsertMetadata / getMetadata                  // app_user_metadata
  // Chat-session tables (Phase H):
  upsertChatSession / getChatSession / listChatSessionsForUser
  appendChatMessage / listChatMessages
  appendConversationSummary / listConversationSummaries
  upsertChatSessionEntity / listChatSessionEntities
  appendViewerEvent / listViewerEvents
  claimAnonymousChatPayload                     // login-claim
}
```

Two implementations: `MemoryAppRepository` (in-memory, used with
`APP_REPOSITORY_MODE=memory` + tests) and `MySqlAppRepository` (real
SQL + transactions + CREATE TABLE on `createSchema`).

## Where to add what (cheat sheet)

| Want to | Add to |
|---|---|
| A new chat widget | `app/src/components/chat-widgets/<Name>/<Name>.tsx` + sibling `README.md` + `.test.tsx` + `mode: "onboarding" \| "steady"` prop (widget-contract enforced) |
| A new viewer widget | `app/src/components/viewer-widgets/<Name>/<Name>.tsx` + sibling `README.md` + `.test.tsx` + `mode` prop |
| A new brand primitive | `app/src/components/brand/<Name>/<Name>.tsx` + test (no widget-contract; just no-hardcoded-styles) |
| A new ViewerStep kind | extend the discriminated union in `app/src/contexts/ChatStoreContext/types.ts` → wire into `OnboardingShell`'s canvas switch + `SteadyShell` if applicable → ensure the JSON round-trip carries it (no schema change needed; viewer_history_json is generic JSON) |
| A new CanvasIntent | extend the discriminated union in `contexts/CanvasOrchestratorContext/types.ts` → register an adapter via `registerAdapter` OR add a built-in handler in `dispatch` |
| A new frame view | `app/src/views/Onboarding/<View>.tsx` + test, wire into `OnboardingShell.canvasContent` switch (key off `effectiveStepKind`) |
| A new context | `app/src/contexts/<Name>Context/<Name>Context.tsx` + types + test; mount in provider tree (order: AppMode → ChatStore → OnboardingSession → ScenarioRegistry → CanvasOrchestrator → views) |
| A new middleware endpoint | `middleware/src/app.ts` + test in `apiRouteContract.test.ts` + a round-trip test in `app.test.ts` (Rule 9). Type the route generics: `app.get<{ id: string }>(...)` to narrow `req.params` past Express 5's `string \| string[]` |
| A new DB column on `chat_sessions` | extend `ChatSessionRecord` in `types.ts` → CREATE TABLE in `mysqlRepository.createSchema` → ADD COLUMN in the corresponding `ensureChatSessions*Columns` idempotent migration → write site in upsert → read site in `rowToChatSession` → server route + client read (Rule 9 closure) |
| A new DB table | extend `AppRepository` interface, implement in both `Memory` and `MySql` repos, add CREATE TABLE to MySql `createSchema`, tests |
| A new env var | `middleware/src/config/env.ts` Zod schema → add to `.env.example` → add to `scripts/setup-local-env.mjs` envLines → add to `summarizeEnvForLog` in `index.ts` → workflow `Apply middleware secret` block |
| A new chat surface | extend `ChatColumn`'s dispatch (F2ConversationFlow for onboarding, SteadyConversationFlow for steady) + ship the rendering branch |
| A new scenario | extend `app/src/test/scenarioFixtures.ts` + `middleware/src/scenarios/registry.ts` so it loads from the GroundX bucket manifest |
| Closure of any of the above | run the Rule 9 four-part checklist: round-trip test + dead-column + dead-endpoint + dead-context (see `discipline.md`) |

## Add-a-widget checklist

Per `widget-contract.md`. When adding a widget under
`components/chat-widgets/<Name>/` OR `components/viewer-widgets/<Name>/`:

1. Sibling `README.md` documenting slot, props, locked affordances, events.
2. Sibling `<Name>.test.tsx` covering mount in both modes + locked affordances absent under `mode="onboarding"`.
3. `mode: "onboarding" | "steady"` prop on the consumer entry point.
4. Inputs are typed props — no implicit context reads if avoidable.
5. Styling uses tokens from `@/constants` (no hex literals — `no-hardcoded-styles.test.ts` enforces).
6. `data-testid` on the wrapper for test targeting.
7. If the widget reads state, it reads from a context — never from
   the URL or localStorage directly. The context owner reads those.

`widget-contract.test.ts` auto-discovers every widget directory and
asserts (1)-(3) at test time. Skipping the contract → red test.
