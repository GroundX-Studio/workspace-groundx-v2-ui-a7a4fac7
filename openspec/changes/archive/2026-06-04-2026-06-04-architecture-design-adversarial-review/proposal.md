# Comprehensive Architecture And Design Adversarial Review

## Why

The scaffold has accumulated several serious architecture decisions: production
widget reuse across onboarding and steady mode, `ContentScope` as the data-org
axis, `Template + Scope + Results`, injected frontend API clients, middleware
tool-catalog ownership, and OpenSpec/GitHub as the planning/backlog split.

After recent onboarding and e2e work, we need a fresh, hostile review of the app
as shipped. The review should answer whether the app actually follows the
scaffold philosophy in `AGENTS.md` and `docs/agents/*`: composable architecture,
TDD, adversarial task gates, user-visible done, one source of truth, real
round-trips, and design intent from the wireframes.

## Scope

This is a review-only architecture/design audit. It SHALL inspect code, tests,
OpenSpec specs, archived plans, agent reference docs, wireframes, GitHub issues,
and runtime behavior where needed. It SHALL NOT make product-code fixes while
reviewing.

In scope:

- Composition roots, provider tree, routing, shell/layout architecture, and
  onboarding/steady reuse.
- Component tiering, widget contract conformance, design-system/token usage,
  wireframe intent, responsive/accessibility posture, and user-visible UX flow.
- TDD and test posture: failing-test-first evidence where observable, coverage
  by layer, drift guards, browser/e2e proof, and seam-only tests.
- App/middleware/shared boundaries: `@groundx/shared` schemas, frontend `Api`
  injection, server DI, repository round-trips, RBAC/scope filters, templates,
  tools, telemetry, and security.
- OpenSpec/GitHub hygiene: active changes, archived deferred tasks, backlog
  issue coverage, and no orphaned TODOs or dormant plumbing.
- Runtime claims that require Chrome DevTools MCP measurement: DOM dimensions,
  accessibility, console/network state, and persisted/read state.

Out of scope:

- Fixing product defects found by the audit.
- Refactoring components, routes, contexts, API clients, middleware services, or
  shared types during the audit.
- Changing the scaffold philosophy itself.
- Creating duplicate planning trackers outside OpenSpec and GitHub Issues.

## Deliverables

- `evidence/conformance-report.md`: human-readable verdict by audit axis, with
  strengths, risks, and recommended next decisions.
- `evidence/finding-register.md`: finding table with severity, axis, evidence,
  user-visible impact, expected model, and handoff state.
- `evidence/issue-handoff.md`: existing/new GitHub Issue mapping for every
  confirmed finding that needs follow-up.
- `evidence/adversarial-reviews.md`: one passed or failed adversarial review
  entry after every task.
- `evidence/tool-availability.md`: available/fallback tools for Chrome DevTools
  MCP, GitHub, GroundX Studio, and dependency/call-graph inspection.

## Closure Gates

- Every confirmed finding has an existing issue URL, a newly-created issue URL,
  a blocked issue draft with exact title/body/labels, or a no-action rationale.
- No product code, generated runtime files, tests, or agent docs outside this
  OpenSpec change are modified.
- `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-04-architecture-design-adversarial-review --strict`
- `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
- `git diff --check`
- If all handoff/validation gates pass, commit the audit artifacts and archive
  this OpenSpec change.

## Conformance to Core Architectural Decisions

- **Composable-not-forked:** The audit evaluates whether the app uses explicit
  axes (`ContentScope`, role/mode, route ownership, experience, widget kind,
  catalog id) instead of multiplying structure per onboarding/steady/frame.
  The audit itself adds no product abstraction.
- **Done-able:** The deliverable is a visible evidence-backed report and issue
  handoff, not a vague recommendation list. A seam is not marked conforming
  unless it reaches real user-visible behavior or is explicitly tracked.
- **One source of truth:** The plan lives in OpenSpec; deferred work lives in
  GitHub Issues. The audit checks shared schemas and catalog mirrors instead of
  inventing parallel reference files.
