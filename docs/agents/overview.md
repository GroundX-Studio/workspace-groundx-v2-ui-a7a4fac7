# Overview

## What this project is

A chat-driven onboarding UI for **GroundX**. First production
surface for GroundX Studio. The user picks a sample document (or
brings their own), watches GroundX parse it, sees the extracted
structured values with citations, then chats about the document
or moves on to integrate.

Frame sequence (F-series):

| Frame | What | Status |
|---|---|---|
| F1 | Ingest — sample picker + BYO tiles | Real |
| F2 | Understand — scan animation + thinking-notes streaming in chat + live chat input | Real |
| F3 | Extract — schema-driven fields panel + citation chips that jump the viewer | Real |
| F3a | Edit schema — schema-agent loop (inline editor, ProposeCard, save → sign-in gate) | Real (was a stub pre-2026-05-27) |
| F4 | (retired — folded into F3a) | — |
| F5 | Interact — chat with sources, citation chips → PDF viewer with bbox highlight | Real |
| F6 | Gate — sign-up via real Partner API register + claim (renamed from "magic-link" 2026-05-25). Renders as a `sign-up` overlay z-stacked on the canvas (master-viewer-session); doesn't replace the chat column | Real |
| F7 | Integrate — copy-paste API snippet + download agent plugins | Stub |

## What's deliberately NOT done yet

- **Steady-mode multi-session shell.** SteadyShell at `/c/:sessionId`
  mounts the canonical AppShell with `ChatColumn mode="steady"` +
  `PdfViewerWidget` (when the active ViewerStep is `doc-viewer`),
  but the full steady-mode chrome (session switcher polish, BYO
  upload flow, multi-doc carousel) is UI-05/06+ work.
- **F4 SchemaView as a standalone frame.** Retired; the
  schema-agent loop is now F3a, reached from F3's fields-panel
  hamburger.
- **F7 IntegrateView.** Still a stub. UI-02 (connectors catalog +
  copy-paste API snippet + agent-plugin downloads) is the
  product surface; not started.
- **Streaming chat responses.** `routeChat` returns a full envelope
  on completion. Streaming (SSE / WebSocket) is CF-11 — deferred
  until the live RAG path stabilizes.
- **Tool-call wiring.** `chat-with-sources` widget contract names
  8 agent tools per `project_dev_contracts.md`; the chat router
  doesn't dispatch tool calls yet (TL-01..TL-08).
- **MySQL in every environment.** Schema + repository methods + BFF
  endpoints all exist. MySQL is the ONLY runtime repository
  (retire-memory-repository-mode, 2026-06-11): `MYSQL_*` env vars are
  required everywhere — dev points at the shared dev database via
  `middleware/.env.local`. The idempotent migration
  (`ensureChatSessionsViewerColumns`) handles ALTER for existing
  deployments.

### What HAS shipped (don't re-do)

- **Live GroundX search** (chatRouter `searchGroundX` → real
  `/v1/search/{bucket|group}` endpoints; ContentScope-aware
  routing; CF-15).
- **Live LLM** (`FetchLlmClient` + grounded prompt + structured /
  hybrid handlers; OpenAI + Anthropic providers supported).
- **Compression chain** (leaf summaries + meta-compaction; no
  telephone-game decay).
- **Server-side persistence + RT hydrate** (every chat turn +
  viewer event + active entity + viewer history persists; UI
  rehydrates on mount).
- **Clickable citations end-to-end** (chip → orchestrator →
  `gotoDocViewer` ViewerStep → PdfViewerWidget with controlled
  `targetPage` + `highlightBbox` overlay).

## Stack

```
┌─────────────────────────────────────────────────────────┐
│  Browser                                                │
│  - Vite + React + MUI v5 + Emotion                      │
│  - React Router v6                                      │
│  - Framer Motion + CSS @keyframes for animations        │
│  - localStorage for anonymous content                   │
└─────────────────────────────────────────────────────────┘
                          │
                          │ same-origin /api/*
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Middleware (Express + TypeScript)                      │
│  - pino + helmet + rate-limit + prom-client + OTel + Sentry │
│  - MemoryAppRepository (dev) | MySqlAppRepository (prod) │
│  - FetchGroundXPartnerClient + FetchGroundXClient + FetchLlmClient │
│  - GroundX-Studio MCP integration for managed projects  │
└─────────────────────────────────────────────────────────┘
                          │
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        GroundX API   Partner API   LLM provider
        (search,      (customers,   (Claude /
         ingest,       projects,     OpenAI /
         workflows)    auth)         self-hosted)
```

Deploy: GitHub Actions builds two Docker images (frontend nginx,
middleware Node) → Helm chart on AWS EKS → optional AWS ALB
Ingress for public exposure.

## Two-mode model

The codebase ships as one app but operates in two modes:

- **Onboarding mode** (`/onboarding`, `/onboarding/<bucketId>/<scenarioId>`,
  `/onboarding/signup`): the F1–F7 flow above. Anonymous user, content
  in localStorage, signed-in transition gated at F6.
- **Steady mode** (`/c/:sessionId`): authenticated user's chat
  session. Content in DB. Multi-session navigation. UI is stubbed
  today; routing + the SessionSwitcher component are in place.

App mode flips at sign-in (F6 commit) via the auth state machine.
Memory rule: SDR / agent skills load as remote plugins, not in-app
folders — there's no `middleware/src/skills/` directory.

## Where things live

```
scaffold/
├── app/                     # Frontend (Vite + React)
│   ├── src/
│   │   ├── api/             # Client SDK (entity fetchers, claimAnonymousChat, axios)
│   │   ├── constants/       # Generated tokens + chrome constants
│   │   ├── contexts/        # AppMode, ChatStore, EntityRegistry, OnboardingSession, ScenarioRegistry, ...
│   │   ├── router/          # routerPaths + router config
│   │   ├── shared/components/  # CapabilityBadge, OnboardingNav, SessionSwitcher, StepStrip, ...
│   │   ├── test/            # Test harnesses (renderWithOnboardingProviders, scenarioFixtures)
│   │   ├── theme.ts         # MUI theme
│   │   ├── types/           # ScenarioConfig, onboarding frame types, ...
│   │   └── views/Onboarding/  # F1–F7 view components + OnboardingShell
│   └── e2e/                 # Playwright specs (onboarding-utility, onboarding-loan)
├── middleware/              # Backend (Express + TypeScript)
│   ├── src/
│   │   ├── app.ts           # Express app composition + middleware wiring
│   │   ├── index.ts         # Boot
│   │   ├── config/env.ts    # Zod schema for env vars
│   │   ├── db/              # MemoryAppRepository, MySqlAppRepository
│   │   ├── lib/             # logger, telemetry, pii, metrics, crypto
│   │   ├── middleware/      # session, requireAuthenticatedUser, rate-limiter wiring
│   │   ├── scenarios/       # ScenarioRegistry (loads from GroundX samples bucket)
│   │   ├── services/        # GroundX/Partner/LLM clients, chatRouter, contextBundler
│   │   └── types.ts         # AppRepository, GroundXClient, ChatSessionRecord, ...
├── deploy/
│   ├── helm/groundx-web-ui/ # Helm chart (deploy/helm/groundx-web-ui/templates/*.yaml)
│   └── nginx/               # Frontend nginx config template
├── scripts/                 # test-deploy-assets, scan-secrets, setup-local-env, ...
└── .github/workflows/       # deploy.yml, diagnose.yml, uninstall.yml
```
