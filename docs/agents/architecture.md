# Architecture

What the app actually looks like in code. Frontend first, then
middleware, then the contracts between them.

## Frontend shell

```
OnboardingShell                               <- root, mounted at /onboarding/*
├── OnboardingNav                             <- shell-level, always mounted
│   - Labeled (180px) ↔ icon rail (48px), chevron toggle
│   - State persisted in localStorage via useOnboardingNavCollapsed
│   - Logged-out items: W/P (disabled), Book-a-call CTA, Docs
├── F1Layout (if isF1)                        <- full-width picker
│   ├── StepStrip
│   └── IngestView (sample picker + BYO)
└── AppShell-style 3-pane (if F2+)
    ├── (nav slot empty; nav is shell-level above)
    ├── OnboardingChatColumn                  <- the chat-side narrative
    │   - F2 + scenario → F2ConversationFlow (header + bubbles + thinking + Pick-a-view)
    │   - F2 BYO no scenario → ByoChatPlaceholder
    │   - F1 / F3+ idle → IdleChatPlaceholder
    │   - Gate active → GateChatPanel
    └── Canvas slot                           <- StepStrip + active frame view
        ├── UnderstandView (F2)
        ├── ExtractView (F3 / F3a / F4)
        ├── InteractView (F5 / F6)
        └── IntegrateView (F7)
```

F1↔F2 transition: the nav doesn't animate (stable). Only the chat
+ canvas panes slide. The `SlideOverlay` carries the F2 chrome
during the leaving phase (via override props on
`OnboardingChatColumn` and `UnderstandView`) so the user sees
content slide away, not blank rectangles.

## Frontend contexts (top to bottom)

| Context | Lives in | What it owns |
|---|---|---|
| `AppModeContext` | provider mounts in `App.tsx` | App-wide mode (onboarding / steady), auth state, current scenario id |
| `ChatStoreContext` | **root state container** | `sessions: Map<id, ChatSession>`, active session id, message + entity + viewer-event append. localStorage-backed for anonymous users. EntityRegistry is a derived facade over `ChatStore.activeSession.entities` — not its own state |
| `EntityRegistryContext` | thin facade | `useEntityRegistry()` reads from ChatStore. Mutation actions delegate. Provider auto-mounts ChatStoreProvider with seed-or-rehydrate |
| `OnboardingSessionContext` | façade | Exposes `state` (current frame, scenario, gate) + actions (`pickScenario`, `advanceFrame`, `openGate`, `dismissGate`, `commitGate`). Each action emits a ViewerEvent via ChatStore |
| `ScenarioRegistryContext` | loads `/api/scenarios` | Scenarios + bucketId for canonical URLs |
| `CanvasOrchestratorContext` | scaffolded | Intent dispatch (not yet wired to chat sessions) |
| `AgentToolBusContext` | scaffolded | Tool calls (not yet wired) |
| `OnboardingSkillContext` | empty stub | Plugin-loaded skills; loader not yet implemented |

Order in the provider tree: `AppMode` → `ChatStore` (via
`EntityRegistryProvider`) → `OnboardingSession` → `ScenarioRegistry`
→ `CanvasOrchestrator` / `AgentToolBus` / `OnboardingSkill` → views.

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
├── /api/chat-sessions/claim → login-claim BFF (Phase H)
├── /api/scenarios    → ScenarioRegistry list
├── /api/v1/*         → GroundX customer-scoped proxy (uses session's groundx-api-key)
├── /api/customer|apikey|bucket|group|project → Partner API proxy
├── /api/llm/*        → LlmClient proxy
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

Two implementations: `MemoryAppRepository` (in-memory, used in
MOCK_MODE + tests) and `MySqlAppRepository` (real SQL + transactions
+ CREATE TABLE on `createSchema`).

## Where to add what (cheat sheet)

| Want to | Add to |
|---|---|
| A new frame view | `app/src/views/Onboarding/<View>.tsx` + test, wire into `OnboardingShell.canvasContent` |
| A shared widget | `app/src/shared/components/<Component>.tsx` + test |
| A new context | `app/src/contexts/<Name>Context/<Name>Context.tsx` + types + test; mount in provider tree |
| A new middleware endpoint | `middleware/src/app.ts` + test in `apiRouteContract.test.ts` |
| A new DB table | extend `AppRepository` interface, implement in both `Memory` and `MySql` repos, add CREATE TABLE to MySql `createSchema`, tests |
| A new env var | `middleware/src/config/env.ts` Zod schema, add to workflow `Apply middleware secret`, add to `summarizeEnvForLog` in `index.ts` |
| A new chat surface | extend `OnboardingChatColumn`'s dispatch + ship the rendering branch (or, for steady mode, build into `SteadyShell`) |
| A new scenario | extend `app/src/test/scenarioFixtures.ts` + `middleware/src/scenarios/registry.ts` so it loads from the GroundX bucket manifest |

## Add-a-widget checklist

When adding a widget under `app/src/shared/components/`:

1. Inputs are typed props — no implicit context reads if avoidable.
2. Styling uses tokens from `@/constants` (no hex literals).
3. `data-testid` on the wrapper for test targeting.
4. Co-locate the `.test.tsx` next to the component.
5. If the widget reads state, it reads from a context — never from
   the URL or localStorage directly. The context owner reads those.
