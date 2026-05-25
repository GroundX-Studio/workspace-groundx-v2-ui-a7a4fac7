# AGENTS.md

Table of contents. Read what's relevant. This is the connective
tissue between external specs (design bundle, GroundX APIs, harness
skills) and this codebase.

- [**Backlog (single source of truth)**](docs/agents/backlog.md) — every pending item across 14 epics with stable `<EPIC>-N` ids + a discovery checklist for the next audit pass. Inline `TODO(<id>)` markers in source resolve here. **Read the Rules of Engagement at the top before opening new work.**
- [**Discipline rules**](docs/agents/discipline.md) — failing test first, never commit `.env*` or Partner API `*username` fields, tight responses, **definition of done = user-visible test (not seam test)**, **single backlog (no tombstones)**, **verify before flagging not-started**, WIP cap = 3 per epic, closure deletes inline TODOs.
- [**Project overview + stack**](docs/agents/overview.md) — chat-driven GroundX onboarding UI on Vite + React + MUI + Express + MySQL + EKS. Two-mode model (Onboarding + Steady).
- [**Getting started — first day**](docs/agents/getting-started.md) — clone → local preview → test loop → deploy loop → MCP tool usage.
- [**Architecture**](docs/agents/architecture.md) — Shell, contexts (ChatStore root, EntityRegistry derived facade, OnboardingSession), views (F1–F7), Helm chart. Where things go when you add a feature.
- [**Onboarding flow (F1–F7)**](docs/agents/onboarding-flow.md) — frame-by-frame, transitions, chat-column narrative, F6 gate, per-scenario behavior (Utility / Loan / Solar).
- [**Chat session model**](docs/agents/chat-session-model.md) — ChatSession as parent of entity state. **Storage rule (updated 2026-05-25):** DB is source of truth for both anon and authed; localStorage is a cache. Anon `chat_sessions` get a server row from day one (ownerAnonId = cookie session.id); F6 sign-up is a single UPDATE re-key. Compression chain = leaf summaries + meta-compaction (no telephone-game decay).
- [**Design bundle**](docs/agents/design-bundle.md) — where the wireframes + spec JSX live. How to compare a frame's implementation against its source.
- [**Deploy + Helm + EKS**](docs/agents/deploy.md) — workflow inputs, per-env vars/secrets cascade, Helm chart, image tagging, ALB Ingress, MCP `publish` / `deploy_config` / `commit_push`. Single-tag scheme + `pullPolicy: Always`. Ops workflows (`diagnose.yml`, `uninstall.yml`, `alb-alarms.yml`).
- [**Observability + security**](docs/agents/observability.md) — pino + OpenTelemetry + Sentry + PostHog + helmet + rate-limit. Where each lives, how to add a metric/span/event, PII scrubbing, log-noise suppression.
- [**Testing layers**](docs/agents/testing.md) — Vitest unit, apiRouteContract integration, Playwright e2e, contract tests. TDD discipline per layer.
- [**MCP tool surface**](docs/agents/mcp-tools.md) — `groundx-studio` MCP tools. When to use `publish` vs `commit_push` vs `deploy_config`. Where the Partner API key lives, why `.env.local` is the wrong home for it, how to recover it after a session compact.
- [**Common gotchas**](docs/agents/gotchas.md) — mistakes already made: the Partner API `*username`-is-actually-the-key trap, the Partner-key persistence trap (`.env.local` is a workaround, not canonical home), GitHub vars precedence, ClusterIP under AWS ALB, MOCK_MODE vs live.

## Conventions for additions

New top-level concern → new file under `docs/agents/` + a one-line entry here. Keep this file a strict ToC. Anything that needs more than one line of explanation goes in the linked file.
