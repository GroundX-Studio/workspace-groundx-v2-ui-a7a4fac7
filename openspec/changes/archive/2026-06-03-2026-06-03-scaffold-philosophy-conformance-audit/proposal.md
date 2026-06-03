# Scaffold Philosophy Conformance Audit

## Why

The scaffold now has a clear operating philosophy: solve to the product model,
compose production surfaces instead of forking onboarding variants, use real data
and round-trips as the definition of done, keep one source of truth, and defer
unfinished work into GitHub Issues rather than dormant code. We need a whole-repo
review that measures the current scaffold against that philosophy before choosing
the next implementation work.

## Scope

This is a review-only audit. It SHALL inspect code, docs, OpenSpec specs,
archived plans, tests, wireframes, runtime behavior where useful, and GitHub
issue coverage. It SHALL NOT make product-code fixes while auditing.

In scope:

- Conformance to `docs/agents/principles.md`, especially composable-not-forked,
  user-visible done, and one source of truth.
- Onboarding versus steady reuse across `AppShell`, `ChatColumn`,
  `ScopedCanvas`, production widgets, and frame views.
- Real-data and round-trip behavior across frontend API, middleware,
  persistence, GroundX/LLM paths, and scenario manifests.
- Template + Scope + Results conformance for Extract and SmartReport.
- Widget/tool contract conformance, including tool catalog mirroring.
- OpenSpec/GitHub backlog hygiene for deferred work.
- Wireframe fidelity at the level needed to identify architectural drift.
- Test/evidence posture, including browser-measured evidence where runtime
  claims are made.

Out of scope:

- Fixing product defects found during the audit.
- Refactoring components, APIs, or data models.
- Creating new implementation OpenSpec plans beyond issue handoff unless the
  user explicitly chooses a follow-up scope after the audit.
- Replacing the scaffold stack or changing the design philosophy itself.

## Affected Wireframes

- `openspec/wireframes/source/spec-flow.jsx` for F1-F6 and F3a.
- `openspec/wireframes/source/spec-chapters.jsx` for F2 processing detail.
- `openspec/wireframes/source/spec-nav-v2.jsx` for F1, F7, nav, and step strip.
- `openspec/wireframes/source/spec-widgets.jsx` for widget anatomy.
- Companion `groundx-wireframes` steady-mode references, if present locally,
  for `/c/:sessionId`, workspaces, and projects.

## Touched Scaffold Modules

The audit reads the whole scaffold but should only create audit artifacts under
this OpenSpec change:

- `openspec/changes/2026-06-03-scaffold-philosophy-conformance-audit/`
- Optional runtime screenshots or notes under that change's `evidence/` folder.

Product code under `app/`, `middleware/`, `shared/`, `deploy/`, and `docs/agents/`
is read-only for this change.

## Closure Gates

- `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-03-scaffold-philosophy-conformance-audit --strict`
- `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
- `git diff --check`
- Audit artifacts exist and contain no placeholder sections:
  - `evidence/conformance-report.md`
  - `evidence/finding-register.md`
  - `evidence/issue-handoff.md`
  - `evidence/adversarial-reviews.md`
  - `evidence/tool-availability.md`

## Conformance to Core Architectural Decisions

- **Composable-not-forked:** The audit evaluates whether the scaffold uses
  explicit axes (`ContentScope`, role/mode, `ChatExperience`, widget kind) rather
  than onboarding-specific forks. The audit itself adds no new product axis.
- **Done-able:** The deliverable is a user-visible audit report with evidence,
  severity, and issue handoff. It does not count a finding as closed merely
  because a seam exists.
- **One source of truth:** The audit uses OpenSpec as the active planning surface
  and GitHub Issues as the deferred-work backlog. It does not create a rival
  tracker outside OpenSpec.
