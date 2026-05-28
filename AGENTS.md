# AGENTS.md

Table of contents. Read what's relevant. This is the connective
tissue between external specs (design bundle, GroundX APIs, harness
skills) and this codebase.

- **Planning + pending work** — managed via OpenSpec at `../openspec/`. Run `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list` for active changes and `… list --specs` for durable capability contracts. Capability specs live at `openspec/specs/<capability>/spec.md`; in-flight proposals live at `openspec/changes/<change-id>/`. Validate with `… validate --all --strict`.
- [**Discipline rules**](docs/agents/discipline.md) — failing test first, never commit `.env*` or Partner API `*username` fields, tight responses, **definition of done = user-visible test (not seam test)**, **planning via OpenSpec (no tombstones; verify before flagging not-started)**, WIP cap = 3 per epic, closure deletes inline TODOs, **round-trip contract** (Rule 9 — every persisted byte gets a read site, dead-column / dead-endpoint / dead-context checks before closure, `seam-only` status for write-only work).
- [**Project overview + stack**](docs/agents/overview.md) — chat-driven GroundX onboarding UI on Vite + React + MUI + Express + MySQL + EKS. Two-mode model (Onboarding + Steady).
- [**Getting started — first day**](docs/agents/getting-started.md) — clone → local preview → test loop → deploy loop → MCP tool usage.
- [**Architecture**](docs/agents/architecture.md) — Shell, contexts (ChatStore root with paired ViewerSession, EntityRegistry derived facade, OnboardingSession, CanvasOrchestrator), views (F1–F7), Helm chart. Where things go when you add a feature.
- [**Widget contract**](docs/agents/widget-contract.md) — locked. The 5-tier component tree (`primitives/brand/layout/chat-widgets/viewer-widgets/`), the per-widget README + sibling test + `mode` prop requirement, and the drift-guard test (`widget-contract.test.ts`) that enforces it. Read before adding any component under `app/src/components/`.
- [**Onboarding flow (F1–F7)**](docs/agents/onboarding-flow.md) — frame-by-frame, transitions, chat-column narrative, F6 gate, per-scenario behavior (Utility / Loan / Solar).
- [**Chat session model**](docs/agents/chat-session-model.md) — ChatSession as parent of entity state. **Storage rule (updated 2026-05-25):** DB is source of truth for both anon and authed; localStorage is a cache. Anon `chat_sessions` get a server row from day one (ownerAnonId = cookie session.id); F6 sign-up is a single UPDATE re-key. Compression chain = leaf summaries + meta-compaction (no telephone-game decay).
- [**Design bundle**](docs/agents/design-bundle.md) — where the wireframes + spec JSX live. How to compare a frame's implementation against its source.
- [**Deploy + Helm + EKS**](docs/agents/deploy.md) — workflow inputs, per-env vars/secrets cascade, Helm chart, image tagging, ALB Ingress, MCP `publish` / `deploy_config` / `commit_push`. Single-tag scheme + `pullPolicy: Always`. Ops workflows (`diagnose.yml`, `uninstall.yml`, `alb-alarms.yml`).
- [**Observability + security**](docs/agents/observability.md) — pino + OpenTelemetry + Sentry + PostHog + helmet + rate-limit. Where each lives, how to add a metric/span/event, PII scrubbing, log-noise suppression.
- [**Testing layers**](docs/agents/testing.md) — Vitest unit, apiRouteContract integration, Playwright e2e, contract tests. TDD discipline per layer.
- [**MCP tool surface**](docs/agents/mcp-tools.md) — `groundx-studio` MCP tools. When to use `publish` vs `commit_push` vs `deploy_config`. Where the Partner API key lives, why `.env.local` is the wrong home for it, how to recover it after a session compact.
- [**Common gotchas**](docs/agents/gotchas.md) — mistakes already made: the Partner API `*username`-is-actually-the-key trap, the Partner-key persistence trap (`.env.local` is a workaround, not canonical home), GitHub vars precedence, ClusterIP under AWS ALB, MOCK_MODE vs live.
- [**Air-gap / on-prem audit**](docs/agents/airgap-audit.md) — OPS-04 deliverable. Every external host the runtime contacts in production, with a "seam" column showing whether the host is env-var-overridable. Reference when adding new external deps.
- [**Real-data rewire plan**](docs/agents/real-data-rewire-gap.md) — the no-onboarding-duplicates rule + the concrete plan to fold per-frame views (`UnderstandView`/`ExtractView`/`InteractView`/`IntegrateView`) into thin shells around production widgets. Read before building "onboarding-specific" variants.

## Conventions for additions

New top-level concern → new file under `docs/agents/` + a one-line entry here. Keep this file a strict ToC. Anything that needs more than one line of explanation goes in the linked file.
