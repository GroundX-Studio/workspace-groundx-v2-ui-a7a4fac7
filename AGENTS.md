# AGENTS.md

Table of contents for any AI agent (or new human contributor)
picking up this project. Each entry below points at a focused
reference under `docs/agents/`. Read what's relevant; you don't
need to read every file before doing anything.

This file is the equivalent of a "what would my notes look like if
I worked on this for two weeks" handoff. It's intentionally not
exhaustive — the canonical specs (design bundle, GroundX API docs,
harness skill references) are external. This is the connective
tissue between those and the codebase.

## Read me first

- [**Discipline rules — TDD, secrets, response style**](docs/agents/discipline.md) —
  Hard-locked behaviors. TDD failing-test-first is mandatory. Never
  commit `.env*` values or Partner API `*username` fields. Tight
  responses, ask before novels. Read this before writing code.
- [**Project overview + stack**](docs/agents/overview.md) — What
  this project is (chat-driven GroundX onboarding UI), what's in
  scope vs out, the target stack (Vite + React + MUI + Express +
  MySQL on EKS), and the two-mode model (Onboarding + Steady).
- [**Getting started — first day**](docs/agents/getting-started.md) —
  The shortest path from clone to "I can make a change". Local
  preview, test loop, deploy loop, MCP tool usage.

## Architecture + spec

- [**Architecture**](docs/agents/architecture.md) — Shell, contexts
  (ChatStore root, EntityRegistry derived facade, OnboardingSession),
  views (F1–F7), Helm chart. Where things go when you add a feature.
- [**Onboarding flow (F1–F7)**](docs/agents/onboarding-flow.md) —
  Frame-by-frame, transitions, the chat-column narrative model, the
  gate (F6), per-scenario behavior (Utility / Loan / Solar).
- [**Chat session model**](docs/agents/chat-session-model.md) —
  ChatSession as the parent of entity state. Storage split:
  anonymous content in localStorage, signed-in content in DB,
  telemetry always in DB. Login-claim flow.
- [**Design bundle**](docs/agents/design-bundle.md) — Where the
  wireframes + spec JSX live. How to compare a frame's
  implementation against its source.

## Operations

- [**Deploy + Helm + EKS**](docs/agents/deploy.md) — How a deploy
  actually works. Workflow inputs, per-env vars/secrets cascade,
  Helm chart, image tagging, ALB Ingress, MCP `publish` /
  `deploy_config` / `commit_push` usage. The one-tag-per-env scheme
  + `pullPolicy: Always` rationale.
- [**Observability + security**](docs/agents/observability.md) —
  pino + OpenTelemetry + Sentry + PostHog + helmet + rate-limit.
  Where each lives, how to add a metric / span / event, PII
  scrubbing, log-noise suppression (kube-probe + Prometheus).
- [**Testing layers**](docs/agents/testing.md) — Vitest unit,
  apiRouteContract integration, Playwright e2e, contract tests
  (test-deploy-assets.mjs, scan-secrets.mjs). How fixtures work.
  TDD discipline applied per layer.
- [**MCP tool surface**](docs/agents/mcp-tools.md) — The
  `groundx-studio` MCP tools used for managed-project lifecycle.
  When to use `publish` vs `commit_push` vs `deploy_config`. How
  the Partner API key flows through.

## Cross-cutting

- [**Common gotchas**](docs/agents/gotchas.md) — Mistakes already
  made on this project so you don't repeat them. The Partner API
  `*username`-is-actually-the-key trap. GitHub vars precedence.
  Why the Service stays ClusterIP under AWS ALB. MOCK_MODE vs live.
- [**Open work + deferred tracks**](docs/agents/open-work.md) —
  What's pending. The live LLM router + real GroundX search wiring.
  Compression chain. Multi-session steady-mode UI. Things to know
  before picking up one of these.

## Where the spec is, where the memory is

- The wireframes + design system: see `docs/agents/design-bundle.md`.
- The harness skill (project pattern, scaffolds, widget contracts):
  `groundx-studio-harness:harness-web-ui` and its references.
- The GroundX API + Partner API: separate harness skills, separate
  docs. Don't memorize their endpoint behavior — re-read on each
  task.
- The user's local memory (in `~/.claude/...`) is a different,
  user-specific notebook. Anything important from there that
  another agent needs is here in `docs/agents/`.

## Conventions for additions

When you discover something an agent should know, add or extend the
relevant reference under `docs/agents/`. Don't bloat AGENTS.md
itself — it stays a table of contents. New top-level concerns get
a new file + a new entry here.
