# Tasks: Scaffold Philosophy Conformance Audit

This is a review-only plan. Product code fixes are out of scope. Use
`superpowers:executing-plans` or `superpowers:subagent-driven-development` when
executing. Every task is SEQUENTIAL and MUST be followed by its adversarial
review before starting the next task.

## Task 1 — SEQUENTIAL: Create Audit Acceptance Artifacts

- [ ] Failing user-visible check: run
      `test -f openspec/changes/2026-06-03-scaffold-philosophy-conformance-audit/evidence/conformance-report.md`
      and confirm it fails because the audit report has not been written yet.
- [ ] Create `evidence/conformance-report.md` with sections for executive
      summary, axis scores, confirmed strengths, confirmed gaps, and next
      decisions.
- [ ] Create `evidence/finding-register.md` with columns for id, severity,
      axis, evidence, impact, status, and handoff.
- [ ] Create `evidence/issue-handoff.md` with sections for existing issue
      matches, new issues to create, and no-action findings.
- [ ] Re-run the file-existence check and confirm all three audit artifacts now
      exist.
- [ ] Adversarial review: verify the artifacts are review deliverables, not
      product fixes; scan for placeholders; confirm every later task has a
      location to record evidence.

## Task 2 — SEQUENTIAL: Reconstruct The Philosophy Baseline

- [ ] Re-read `AGENTS.md`, `docs/agents/principles.md`,
      `docs/agents/discipline.md`, `docs/agents/hacking-vs-solving.md`,
      `docs/agents/real-data-rewire-gap.md`,
      `docs/agents/template-scope-results.md`,
      `docs/agents/data-model.md`, `docs/agents/widget-contract.md`, and
      `docs/agents/testing.md`.
- [ ] Extract the audit rubric into the conformance report using the axes from
      `design.md`.
- [ ] Record any tension between current docs and shipped code as a finding only
      when the docs claim the behavior is shipped or required.
- [ ] Adversarial review: challenge whether the rubric smuggles in new product
      requirements; remove or downgrade anything that is only a future target.

## Task 3 — SEQUENTIAL: Audit Planning And Backlog Hygiene

- [ ] Run `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list` and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list --specs`.
- [ ] Inspect open GitHub Issues for the managed scaffold repository and map
      non-backlog versus backlog work.
- [ ] Review archived OpenSpec changes from 2026-06-01 through 2026-06-03 for
      deferred unchecked tasks that should have GitHub issue handoff.
- [ ] Record whether OpenSpec is only in-flight work and GitHub Issues are the
      backlog, per discipline Rule 8.
- [ ] Adversarial review: verify no active work is missed because it is archived,
      untracked, or only present in an inline source task marker.

## Task 4 — SEQUENTIAL: Audit Composition Versus Forking

- [ ] Inspect `app/src/components/chat-widgets/ChatColumn/`,
      `app/src/components/layout/AppShell/`,
      `app/src/components/layout/ScopedCanvas/`,
      `app/src/views/Onboarding/`, and `app/src/views/Steady/` or the current
      steady route implementation.
- [ ] Search for onboarding-only forks of production surfaces using:
      `rg -n "mode=|surface|onboarding|steady|documentId|ContentScope|ChatExperience|ScopedCanvas|ConversationFlow" app/src`.
- [ ] If `codegraphcontext` MCP is available, map the dependency graph for
      `ChatColumn`, `AppShell`, `ScopedCanvas`, onboarding views, steady views,
      and viewer/chat widgets before finalizing fork findings.
- [ ] Compare the implementation to `real-data-rewire-gap.md`: onboarding-specific
      surfaces should be limited to sign-up/gate, nav, and F1 ingest picker.
- [ ] Record confirmed forks, acceptable context-specific shells, and already
      conforming composition points.
- [ ] Adversarial review: challenge every fork finding against actual mount
      sites so legitimate shell/context differences are not mislabeled defects.

## Task 5 — SEQUENTIAL: Audit Real Data And Round-Trip Done

- [ ] Inspect frontend API clients, `ApiProvider`, scenario registry, chat
      session hydration, viewer history, and entity persistence paths.
- [ ] Inspect middleware routes and repository methods for write/read/render
      pairs, especially chat sessions, viewer events, entities, templates,
      scenarios, GroundX proxy, LLM routing, and auth claim.
- [ ] Search for mock or manifest-only data paths using:
      `rg -n "mock|fixture|manifest|sampleExtractionValues|sampleChatScript|localStorage|APP_REPOSITORY_MODE|MemoryAppRepository" app middleware shared`.
- [ ] Record each candidate as conforming, transitional, or a confirmed
      user-visible gap.
- [ ] Adversarial review: require a write site, read site, and rendered consumer
      before calling a round-trip complete; require live-data evidence before
      calling mock drift a defect.

## Task 6 — SEQUENTIAL: Audit Template, Scope, Result, Widget, And Tool Contracts

- [ ] Inspect shared template/scope/result types and their app/middleware
      consumers.
- [ ] If `codegraphcontext` MCP is available, use it to map shared
      `Template`, `ContentScope`, generated-result, and tool-catalog imports
      across app, middleware, and shared packages.
- [ ] Inspect Extract and SmartReport widget, route, DB, and tool surfaces for
      shared lifecycle conformance.
- [ ] Inspect widget directories for README/test/slot/token/style contract
      compliance.
- [ ] Inspect app tool catalogs and middleware `SERVER_TOOL_CATALOG` equivalents
      for mirrored tool definitions and allowed verbs.
- [ ] Run focused existing contract tests if practical:
      `npm --workspace app test -- --run app/src/test/widget-contract.test.ts`
      and any catalog parity tests named by the source tree.
- [ ] Adversarial review: distinguish missing future SmartReport scope from
      regressions in shipped Extract/template behavior; verify tool findings
      against both app and middleware catalogs.

## Task 7 — SEQUENTIAL: Audit Wireframe And Runtime Evidence

- [ ] Read the relevant wireframe JSX for F1-F7 and widget anatomy:
      `openspec/wireframes/source/spec-flow.jsx`,
      `spec-chapters.jsx`, `spec-nav-v2.jsx`, and `spec-widgets.jsx`.
- [ ] Compare wireframe intent to current code for each user-visible surface,
      noting production-token differences that are intentional.
- [ ] If Chrome DevTools MCP is available, run a read-only browser sweep of the
      main onboarding and steady surfaces needed to confirm runtime claims.
- [ ] For runtime findings, capture measured evidence: DOM dimensions,
      visibility, console/network state, a11y snapshot, or response body.
- [ ] Adversarial review: reject screenshot-only claims; verify that live-data or
      LLM variance is not being counted as a design conformance defect.

## Task 8 — SEQUENTIAL: Audit Test And Verification Posture

- [ ] Inspect app, middleware, contract, and Playwright test coverage against the
      axes in the conformance report.
- [ ] Run validation commands that are practical for the audit window, preferring:
      `npm test`, `npm run test:e2e`, `npm run scan:secrets`, and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] If a command is unavailable or too slow, record it explicitly with the
      reason and the residual risk.
- [ ] Identify seam-only tests that claim shipped behavior without user-visible
      coverage.
- [ ] Adversarial review: verify the audit does not overstate test failures as
      product defects or overstate passing unit tests as end-to-end conformance.

## Task 9 — SEQUENTIAL: Produce Issue Handoff

- [ ] For every confirmed finding, search existing GitHub Issues first.
- [ ] Link existing issues where they already cover the finding.
- [ ] For untracked confirmed findings, create or draft GitHub Issues with:
      severity, area label, reproduction/evidence, expected model, and proposed
      OpenSpec follow-up boundary.
- [ ] Mark findings with no action when they are acceptable context differences
      or already tracked future work.
- [ ] Adversarial review: verify every confirmed gap is either linked to an
      issue, explicitly no-action, or marked needs-runtime-check; no finding may
      live only in the report.

## Task 10 — SEQUENTIAL: Final Review, Validation, And Closeout

- [ ] Re-read `evidence/conformance-report.md`, `finding-register.md`, and
      `issue-handoff.md` as if seeing them for the first time.
- [ ] Verify every high/critical claim has source evidence and user-visible
      impact.
- [ ] Run `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] Run `git diff --check`.
- [ ] Commit only the audit artifacts, OpenSpec updates, and any issue-handoff
      notes. Do not commit product fixes.
- [ ] Final adversarial review: confirm this change remained review-only, no
      product files were modified, deferred work is in GitHub Issues, and the
      summary states what conforms, what does not, and what remains open.
