# Tasks: Scaffold Philosophy Conformance Audit

This is a review-only plan. Product code fixes are out of scope. Use
`superpowers:executing-plans` or `superpowers:subagent-driven-development` when
executing. Every task is SEQUENTIAL and MUST be followed by its adversarial
review before starting the next task.

## Execution Plan

1. Create acceptance artifacts and record tool availability.
2. Reconstruct the scaffold philosophy baseline.
3. Audit OpenSpec and GitHub backlog hygiene.
4. Audit composition versus onboarding/steady forks.
5. Audit real-data paths and round-trip done.
6. Audit Template + Scope + Results, widget contracts, and tool contracts.
7. Audit wireframe and runtime evidence.
8. Audit test and verification posture.
9. Produce GitHub issue handoff.
10. Final review, validation, commit, and closeout.
11. If successful, archive the OpenSpec change and validate the post-archive
    state.

## Between-Task Adversarial Review Protocol

After each task, append an entry to `evidence/adversarial-reviews.md` with:

- task number and title
- claims made by the completed task
- counterevidence searched
- files, commands, or browser evidence checked
- verdict: `passed` or `failed`
- required correction before the next task

If the verdict is `failed`, fix the audit artifact or issue handoff and rerun
the adversarial review before advancing. Do not mark a task complete until its
review entry is `passed`.

## Task 1 — SEQUENTIAL: Create Audit Acceptance Artifacts

- [x] Failing user-visible check: run
      `test -f openspec/changes/2026-06-03-scaffold-philosophy-conformance-audit/evidence/conformance-report.md`
      and confirm it fails because the audit report has not been written yet.
- [x] Create `evidence/conformance-report.md` with sections for executive
      summary, axis scores, confirmed strengths, confirmed gaps, and next
      decisions.
- [x] Create `evidence/finding-register.md` with columns for id, severity,
      axis, evidence, impact, status, and handoff.
- [x] Create `evidence/issue-handoff.md` with sections for existing issue
      matches, new issues to create, and no-action findings.
- [x] Create `evidence/adversarial-reviews.md` with the between-task review
      template from this file.
- [x] Create `evidence/tool-availability.md` and record whether
      `codegraphcontext`, Chrome DevTools MCP, GitHub, and GroundX Studio tools
      are exposed in the current session; include fallback commands for any
      unavailable tool.
- [x] Re-run the file-existence check and confirm all three audit artifacts now
      exist, plus `adversarial-reviews.md` and `tool-availability.md`.
- [x] Adversarial review: verify the artifacts are review deliverables, not
      product fixes; scan for placeholders; confirm every later task has a
      location to record evidence.

## Task 2 — SEQUENTIAL: Reconstruct The Philosophy Baseline

- [x] Re-read `AGENTS.md`, `docs/agents/principles.md`,
      `docs/agents/discipline.md`, `docs/agents/hacking-vs-solving.md`,
      `docs/agents/real-data-rewire-gap.md`,
      `docs/agents/template-scope-results.md`,
      `docs/agents/data-model.md`, `docs/agents/widget-contract.md`, and
      `docs/agents/testing.md`.
- [x] Extract the audit rubric into the conformance report using the axes from
      `design.md`.
- [x] Record any tension between current docs and shipped code as a finding only
      when the docs claim the behavior is shipped or required.
- [x] Adversarial review: challenge whether the rubric smuggles in new product
      requirements; remove or downgrade anything that is only a future target.

## Task 3 — SEQUENTIAL: Audit Planning And Backlog Hygiene

- [x] Run `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list` and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list --specs`.
- [x] Inspect open GitHub Issues for the managed scaffold repository and map
      non-backlog versus backlog work.
- [x] Review archived OpenSpec changes from 2026-06-01 through 2026-06-03 for
      deferred unchecked tasks that should have GitHub issue handoff.
- [x] Record whether OpenSpec is only in-flight work and GitHub Issues are the
      backlog, per discipline Rule 8.
- [x] Adversarial review: verify no active work is missed because it is archived,
      untracked, or only present in an inline source task marker.

## Task 4 — SEQUENTIAL: Audit Composition Versus Forking

- [x] Inspect `app/src/components/chat-widgets/ChatColumn/`,
      `app/src/components/layout/AppShell/`,
      `app/src/components/layout/ScopedCanvas/`,
      `app/src/views/Onboarding/`, and `app/src/views/Steady/` or the current
      steady route implementation.
- [x] Search for onboarding-only forks of production surfaces using:
      `rg -n "mode=|surface|onboarding|steady|documentId|ContentScope|ChatExperience|ScopedCanvas|ConversationFlow" app/src`.
- [x] If `codegraphcontext` MCP is available, map the dependency graph for
      `ChatColumn`, `AppShell`, `ScopedCanvas`, onboarding views, steady views,
      and viewer/chat widgets before finalizing fork findings.
- [x] Compare the implementation to `real-data-rewire-gap.md`: onboarding-specific
      surfaces should be limited to sign-up/gate, nav, and F1 ingest picker.
- [x] Record confirmed forks, acceptable context-specific shells, and already
      conforming composition points.
- [x] Adversarial review: challenge every fork finding against actual mount
      sites so legitimate shell/context differences are not mislabeled defects.

## Task 5 — SEQUENTIAL: Audit Real Data And Round-Trip Done

- [x] Inspect frontend API clients, `ApiProvider`, scenario registry, chat
      session hydration, viewer history, and entity persistence paths.
- [x] Inspect middleware routes and repository methods for write/read/render
      pairs, especially chat sessions, viewer events, entities, templates,
      scenarios, GroundX proxy, LLM routing, and auth claim.
- [x] Search for mock or manifest-only data paths using:
      `rg -n "mock|fixture|manifest|sampleExtractionValues|sampleChatScript|localStorage|APP_REPOSITORY_MODE|MemoryAppRepository" app middleware shared`.
- [x] Record each candidate as conforming, transitional, or a confirmed
      user-visible gap.
- [x] Adversarial review: require a write site, read site, and rendered consumer
      before calling a round-trip complete; require live-data evidence before
      calling mock drift a defect.

## Task 6 — SEQUENTIAL: Audit Template, Scope, Result, Widget, And Tool Contracts

- [x] Inspect shared template/scope/result types and their app/middleware
      consumers.
- [x] If `codegraphcontext` MCP is available, use it to map shared
      `Template`, `ContentScope`, generated-result, and tool-catalog imports
      across app, middleware, and shared packages.
- [x] Inspect Extract and SmartReport widget, route, DB, and tool surfaces for
      shared lifecycle conformance.
- [x] Inspect widget directories for README/test/slot/token/style contract
      compliance.
- [x] Inspect app tool catalogs and middleware `SERVER_TOOL_CATALOG` equivalents
      for mirrored tool definitions and allowed verbs.
- [x] Run focused existing contract tests if practical:
      `npm --workspace app test -- --run app/src/test/widget-contract.test.ts`
      and any catalog parity tests named by the source tree.
- [x] Adversarial review: distinguish missing future SmartReport scope from
      regressions in shipped Extract/template behavior; verify tool findings
      against both app and middleware catalogs.

## Task 7 — SEQUENTIAL: Audit Wireframe And Runtime Evidence

- [x] Read the relevant wireframe JSX for F1-F7 and widget anatomy:
      `openspec/wireframes/source/spec-flow.jsx`,
      `spec-chapters.jsx`, `spec-nav-v2.jsx`, and `spec-widgets.jsx`.
- [x] Compare wireframe intent to current code for each user-visible surface,
      noting production-token differences that are intentional.
- [x] If Chrome DevTools MCP is available, run a read-only browser sweep of the
      main onboarding and steady surfaces needed to confirm runtime claims.
- [x] For runtime findings, capture measured evidence: DOM dimensions,
      visibility, console/network state, a11y snapshot, or response body.
- [x] Adversarial review: reject screenshot-only claims; verify that live-data or
      LLM variance is not being counted as a design conformance defect.

## Task 8 — SEQUENTIAL: Audit Test And Verification Posture

- [x] Inspect app, middleware, contract, and Playwright test coverage against the
      axes in the conformance report.
- [x] Run validation commands that are practical for the audit window, preferring:
      `npm test`, `npm run test:e2e`, `npm run scan:secrets`, and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] If a command is unavailable or too slow, record it explicitly with the
      reason and the residual risk.
- [x] Identify seam-only tests that claim shipped behavior without user-visible
      coverage.
- [x] Adversarial review: verify the audit does not overstate test failures as
      product defects or overstate passing unit tests as end-to-end conformance.

## Task 9 — SEQUENTIAL: Produce Issue Handoff

- [x] For every confirmed finding, search existing GitHub Issues first.
- [x] Link existing issues where they already cover the finding.
- [x] For untracked confirmed findings, create or draft GitHub Issues with:
      severity, area label, reproduction/evidence, expected model, and proposed
      OpenSpec follow-up boundary.
- [x] If a confirmed finding cannot be filed because GitHub permissions are
      unavailable, record the exact issue title/body/labels and mark the audit
      blocked for user action before archive.
- [x] Mark findings with no action when they are acceptable context differences
      or already tracked future work.
- [x] Adversarial review: verify every confirmed gap has an issue URL, a
      blocked-draft entry caused by permission failure, or an explicit no-action
      rationale; no confirmed finding may live only in the report.

## Task 10 — SEQUENTIAL: Final Review, Validation, And Closeout

- [x] Re-read `evidence/conformance-report.md`, `finding-register.md`, and
      `issue-handoff.md` as if seeing them for the first time.
- [x] Verify every high/critical claim has source evidence and user-visible
      impact.
- [x] Run `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] Run `git diff --check`.
- [x] Commit only the audit artifacts, OpenSpec updates, and any issue-handoff
      notes. Do not commit product fixes.
- [x] If every confirmed gap has GitHub issue handoff and no closeout blocker
      remains, archive this OpenSpec change with
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 archive 2026-06-03-scaffold-philosophy-conformance-audit --yes`.
- [x] After archive, run
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`,
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list`, and
      `git diff --check`.
- [x] Commit the archive cleanup separately with a message that states the audit
      was archived after issue handoff.
- [x] Confirmed no gap lacked issue handoff and final validation did not fail;
      no active blocker entry was needed.
- [x] Final adversarial review: confirm this change remained review-only, no
      product files were modified, deferred work is in GitHub Issues, and the
      summary states what conforms, what does not, what was archived, and what
      remains open.
