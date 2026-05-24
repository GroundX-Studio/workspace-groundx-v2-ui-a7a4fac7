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
| F2 | Understand — scan animation + thinking-notes streaming in chat | Real |
| F3 | Extract — fields panel + citation peek | Real (schema-driven) |
| F3a | Edit schema | Stub |
| F4 | (collapsed into F3) | — |
| F5 | Interact — chat with sources | Stub-ish |
| F6 | Gate — sign-up (magic link / SSO / book a call) | Real, takes over chat column when active |
| F7 | Integrate — copy-paste API snippet + download agent plugins | Stub |

## What's deliberately NOT done yet

- **Live GroundX search.** All scenario data (extracted values,
  citations, chat scripts) comes from manifest fixtures in
  `middleware/src/scenarios`. The chatRouter scaffold lands in
  `services/chatRouter.ts` with a MOCK_MODE responder; live mode
  throws "not yet wired" intentionally.
- **Live LLM.** Same. The `FetchLlmClient` exists and forwards to
  whichever provider's API base URL is configured, but the
  router that decides which prompt to send doesn't actually call
  it yet.
- **MySQL chat-session tables in production use.** Schema +
  repository methods + BFF endpoint all exist. We default
  `APP_REPOSITORY_MODE=memory` on dev so MySQL is bypassed; flip
  to `mysql` when ready + provide `MYSQL_*` env vars.
- **The extraction-workbench widget integration.** F3 uses a
  schema-driven flat list today; the full widget pattern (PDF
  rendering with citation region overlays via pdfjs-dist) is
  Phase-7 work.
- **Steady mode UI.** Routing exists (`/c/:sessionId` → SteadyShell)
  but the actual multi-session app shell is a placeholder.

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
