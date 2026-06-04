# Tasks: Comprehensive Architecture And Design Adversarial Review

This is a review-only plan. Product fixes are out of scope. Use
`superpowers:executing-plans` or `superpowers:subagent-driven-development` when
executing. Every task is SEQUENTIAL and MUST be followed by its adversarial
review before the next task starts.

## Execution Plan

1. Create audit acceptance artifacts and record tool availability.
2. Reconstruct the intended architecture/design philosophy baseline.
3. Map the shipped architecture and composition roots.
4. Audit composition, production reuse, and onboarding/steady forks.
5. Audit data contracts, state ownership, and round-trip completeness.
6. Audit TDD, test quality, drift guards, and user-visible proof.
7. Audit widget/tool contracts and app/middleware catalog ownership.
8. Audit design fidelity, accessibility, responsive behavior, and runtime claims.
9. Audit security, RBAC, observability, and operational seams.
10. Audit planning hygiene, source TODOs, and GitHub issue coverage.
11. Synthesize findings and create issue handoff.
12. Final adversarial review, validation, commit, archive, and summary.

## Between-Task Adversarial Review Protocol

After each task, append an entry to
`evidence/adversarial-reviews.md` with:

- task number and title
- claims made by the completed task
- counterevidence searched
- files, commands, browser evidence, or issue state checked
- verdict: `passed` or `failed`
- required correction before the next task

If the verdict is `failed`, correct the audit artifact or issue handoff and
rerun the adversarial review before advancing.

## Task 1 — SEQUENTIAL: Create Audit Acceptance Artifacts

- [ ] Failing user-visible check: run
      `test -f openspec/changes/2026-06-04-architecture-design-adversarial-review/evidence/conformance-report.md`
      and confirm it fails because the review report has not been written yet.
- [ ] Create `evidence/conformance-report.md` with sections for executive
      verdict, axis scorecard, conforming strengths, confirmed gaps,
      not-a-defect judgments, and recommended next decisions.
- [ ] Create `evidence/finding-register.md` with the table schema from
      `design.md`.
- [ ] Create `evidence/issue-handoff.md` with sections for existing issues,
      new issues, blocked issue drafts, and no-action findings.
- [ ] Create `evidence/adversarial-reviews.md` with the between-task review
      template from this file.
- [ ] Create `evidence/tool-availability.md` and record whether Chrome DevTools
      MCP, GitHub, GroundX Studio, and context-graph/dependency tools are
      available; include fallback commands for unavailable tools.
- [ ] Re-run file-existence checks for all evidence artifacts and confirm they
      now pass.
- [ ] Adversarial review: verify the artifacts are review deliverables, not
      product fixes; scan for placeholders; confirm every later task has a place
      to record evidence.

## Task 2 — SEQUENTIAL: Reconstruct The Baseline

- [ ] Re-read `AGENTS.md`, `docs/agents/principles.md`,
      `docs/agents/discipline.md`, `docs/agents/architecture.md`,
      `docs/agents/data-model.md`, `docs/agents/template-scope-results.md`,
      `docs/agents/widget-contract.md`, `docs/agents/testing.md`,
      `docs/agents/hacking-vs-solving.md`,
      `docs/agents/design-bundle.md`, and
      `docs/agents/real-data-rewire-gap.md`.
- [ ] Re-read `openspec/specs/app-architecture/spec.md`,
      `openspec/specs/testing-suite/spec.md`,
      `openspec/specs/data-tier/spec.md`,
      `openspec/specs/security-and-privacy/spec.md`, and
      `openspec/specs/ui-views/spec.md`.
- [ ] Extract the expected model into `evidence/conformance-report.md` as a
      scorecard rubric using the axes in `design.md`.
- [ ] Record any doc/spec tension as a finding only when the current docs or
      specs claim the behavior is required or shipped.
- [ ] Adversarial review: challenge whether the rubric introduces new product
      requirements; downgrade future targets to no-action or already-tracked.

## Task 3 — SEQUENTIAL: Map The Shipped Architecture

- [ ] Inventory the composition roots and provider tree:
      `app/src/App.tsx`, `app/src/router/router.tsx`,
      `app/src/contexts/**`, and route layouts.
- [ ] Inventory app/middleware/shared boundaries:
      `app/src/api/**`, `shared/src/**`, `middleware/src/app.ts`,
      `middleware/src/types.ts`, `middleware/src/db/**`,
      `middleware/src/services/**`.
- [ ] Run source discovery:
      `rg -n "Provider|createContext|useApi|ContentScope|Template|ViewerSession|ChatSession|CanvasIntent|SERVER_TOOL_CATALOG|defineScopedViewerWidget|Catalog<" app/src middleware/src shared/src`.
- [ ] If a graph tool is available, map dependency/call edges for
      `ChatColumn`, `AppShell`, `OnboardingShell`, steady routes,
      `ChatStoreContext`, `CanvasOrchestratorContext`, frontend `Api`, and
      `SERVER_TOOL_CATALOG`.
- [ ] Record the architecture map in `evidence/conformance-report.md` and any
      surprising dependency direction in `evidence/finding-register.md`.
- [ ] Adversarial review: falsify the map against actual imports and mount
      sites; reject claims based only on file names or stale docs.

## Task 4 — SEQUENTIAL: Audit Composition And Production Reuse

- [ ] Inspect onboarding/steady route surfaces:
      `app/src/views/Onboarding/**`, `app/src/views/Steady/**`,
      `app/src/components/layout/AppShell/**`,
      `app/src/components/chat-widgets/ChatColumn/**`, and
      `app/src/components/viewer-widgets/**`.
- [ ] Search for fork indicators:
      `rg -n "onboarding|steady|mode|role|scope|documentId|bucketId|projectId|ChatExperience|ConversationFlow|ScopedCanvas|clone|duplicate" app/src`.
- [ ] Compare each candidate fork to the allowed context-specific shells:
      sign-up/gate, F1 ingest picker, nav/step strip, and public/auth route
      ownership.
- [ ] Record conforming reuse points and confirmed fork risks in the report.
- [ ] Adversarial review: challenge every fork finding against actual callers
      and user-visible behavior; mark legitimate shells as not-a-defect.

## Task 5 — SEQUENTIAL: Audit Data Contracts And Round-Trips

- [ ] Inspect shared schemas and contract consumers in `shared/src/**`,
      `app/src/types/**`, `app/src/api/**`, `middleware/src/services/**`, and
      `middleware/src/db/**`.
- [ ] Apply Rule 9 checks to high-risk persisted state: chat sessions, chat
      messages, viewer events, entities, metadata, templates, projects, grants,
      and intent logs.
- [ ] For each high-risk persisted concept, record write site, read site,
      rendered/consumer site, and test evidence.
- [ ] Search for drift-prone shortcuts:
      `rg -n "Record<string, unknown>|as unknown|as any|localStorage|TODO|stub|not implemented|mock|fixture|sampleExtractionValues|sampleChatScript" app/src middleware/src shared/src`.
- [ ] Record every seam-only or write-only candidate in the finding register.
- [ ] Adversarial review: require write/read/render/test proof before calling a
      round-trip complete; reject defects caused only by test fixtures or
      intentionally-deferred backlog work.

## Task 6 — SEQUENTIAL: Audit TDD And Test Evidence

- [ ] Inspect recent architecture/design changes through archived OpenSpec
      tasks and recent commits:
      `git log --oneline --decorate -20`.
- [ ] Inspect test layers and drift guards:
      `app/src/**/*.test.ts*`, `app/e2e/*.spec.ts`,
      `middleware/src/**/*.test.ts`, `app/src/test/*guard*.test.ts`,
      `app/src/test/widget-contract.test.ts`, and catalog parity tests.
- [ ] Run practical focused validation:
      `npm --prefix app run test -- app/src/test/widget-contract.test.ts`
      and any discovered catalog/API injection guard tests.
- [ ] Record whether tests assert user-visible behavior, round-trip behavior, or
      only seams.
- [ ] Record missing or weak TDD evidence as posture findings, not product bugs,
      unless shipped behavior is unprotected and user-visible risk is clear.
- [ ] Adversarial review: verify the audit does not infer failing-test-first
      discipline from passing tests alone, and does not call a seam test
      user-visible proof.

## Task 7 — SEQUENTIAL: Audit Widget And Tool Contracts

- [ ] Inspect widget directories under `app/src/components/chat-widgets/` and
      `app/src/components/viewer-widgets/` for README, sibling test,
      slot boundaries, role/mode/scope props, and `*.tools.ts` or `no-llm.md`.
- [ ] Inspect app declarative tool metadata and middleware
      `SERVER_TOOL_CATALOG` for name/description parity, `rendersWidget`
      reachability, allowed verbs, and handler ownership.
- [ ] Run focused contract/parity tests discovered in the source tree.
- [ ] Record every contract violation, already-tracked migration target, and
      not-a-defect legacy allowance.
- [ ] Adversarial review: verify findings against both app metadata and
      middleware executable catalog; reject app-side runtime-handler claims
      unless code proves the handler is production-used.

## Task 8 — SEQUENTIAL: Audit Design Fidelity And Runtime Behavior

- [ ] Read relevant wireframes:
      `openspec/wireframes/source/spec-flow.jsx`,
      `openspec/wireframes/source/spec-layout.jsx`,
      `openspec/wireframes/source/spec-nav-v2.jsx`,
      `openspec/wireframes/source/spec-widgets.jsx`,
      `openspec/wireframes/source/spec-responsive.jsx`, and
      `openspec/wireframes/source/spec-workspace.jsx`.
- [ ] Compare wireframe intent to current implementation for onboarding,
      authenticated onboarding, steady route shells, workspaces/projects,
      chat column, viewer widgets, gates, and nav.
- [ ] Use Chrome DevTools MCP for runtime claims when servers are available;
      capture DOM dimensions, visible state, console/network state, and a11y
      state rather than screenshot-only evidence.
- [ ] Check design-system posture with source searches for hardcoded colors,
      one-off layout forks, overlapping text risks, and token drift.
- [ ] Record design gaps separately from architecture gaps.
- [ ] Adversarial review: reject pixel-perfect wireframe copying as a goal;
      verify each design finding ties to user intent, accessibility, or
      composable architecture.

## Task 9 — SEQUENTIAL: Audit Security, RBAC, Observability, And Ops Seams

- [ ] Re-read `docs/agents/observability.md`, `docs/agents/gotchas.md`,
      `docs/agents/deploy.md`, `docs/agents/mcp-tools.md`, and
      `docs/agents/airgap-audit.md`.
- [ ] Inspect auth/session ownership, project RBAC filters, public versus
      authenticated routes, secrets handling, telemetry capture, logging, and
      environment seams.
- [ ] Run or record why not running:
      `npm run scan:secrets`, `npm --prefix middleware run test`, and
      deploy/alias/setup-env checks if implicated by findings.
- [ ] Record security/ops findings with concrete impact and references.
- [ ] Adversarial review: distinguish real security defects from missing future
      hardening; verify every claim against code and configured tests.

## Task 10 — SEQUENTIAL: Audit Planning Hygiene

- [ ] Run:
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list`
      and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list --specs`.
- [ ] Query open GitHub Issues for
      `GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7`, separating backlog
      from non-backlog work.
- [ ] Search source and archived changes for orphaned deferred work:
      `rg -n "TODO|FIXME|backlog|deferred|follow-up|seam-only|not-started|unchecked" app middleware shared openspec docs`.
- [ ] Verify every confirmed deferred item has issue handoff or a no-action
      rationale.
- [ ] Adversarial review: verify no active work is missed because it is archived,
      unlabeled, or only present as an inline source marker.

## Task 11 — SEQUENTIAL: Synthesize Findings And Issue Handoff

- [ ] Normalize the finding register: merge duplicates, assign severities,
      separate confirmed findings from not-a-defect and already-tracked items.
- [ ] Search GitHub Issues before creating any new issue.
- [ ] For each untracked confirmed finding, create a GitHub Issue or record a
      blocked draft with exact title, body, labels, and reproduction/evidence.
- [ ] Update `evidence/issue-handoff.md` so every confirmed finding has one of:
      existing issue URL, new issue URL, blocked draft, or no-action rationale.
- [ ] Adversarial review: verify no confirmed finding exists only in prose, and
      every issue body is actionable, scoped, and tied to evidence.

## Task 12 — SEQUENTIAL: Final Review, Validation, Commit, Archive, Summary

- [ ] Re-read all evidence artifacts as if seeing them for the first time.
- [ ] Verify every critical/high finding has source evidence, user-visible
      impact, and issue handoff.
- [ ] Run:
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-04-architecture-design-adversarial-review --strict`.
- [ ] Run:
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] Run `git diff --check`.
- [ ] Commit only this review's OpenSpec files and evidence artifacts.
- [ ] If successful and no handoff blocker remains, archive the change:
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 archive 2026-06-04-architecture-design-adversarial-review --yes`.
- [ ] Run post-archive validation:
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
      and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list`.
- [ ] Commit the archive cleanup separately.
- [ ] Final adversarial review: confirm this stayed review-only, all findings
      have issue handoff/no-action rationale, OpenSpec is clean, and the final
      summary states what conforms, what does not, what was archived, and what
      remains open.
