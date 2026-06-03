# Tasks - Required E2E gap closure after Chrome DevTools audit

Sequential. A task is not complete until its adversarial review passes against
the linked GitHub issue(s), this plan, the real code, and Chrome DevTools MCP
evidence. Every code-changing task starts with a failing user-visible regression.

## T0 - Fresh blocker audit and plan hygiene

- [ ] Re-read `AGENTS.md`, `docs/agents/discipline.md`,
      `docs/agents/testing.md`, `docs/agents/template-scope-results.md`,
      `docs/agents/real-data-rewire-gap.md`, the prior Chrome DevTools audit
      evidence, and the linked GitHub issues `#4`, `#5`, `#6`, `#11`, and
      `#12`.
- [ ] For each linked issue, grep/read the current source and tests first. Mark
      whether the issue is still real, partially shipped, stale, or blocked on
      external data.
- [ ] Ensure the original Chrome DevTools audit change remains active/blocked
      until this plan closes all required-surface gaps. Do not archive it at T0.
- [ ] Add comments or updates to the linked GitHub issues if T0 proves any issue
      is stale, duplicated, or needs narrowed acceptance criteria.
- **Adversarial review:** Reject T0 if it accepts old evidence without checking
  current code, creates duplicate GitHub issues for already-tracked gaps, leaves
  the original audit change looking complete, or starts implementation before the
  blocker map is current.

## T1 - SmartReport Utility rendered sections (`#11`)

- [ ] Write a failing regression that drives the Utility Report flow through the
      public UI/API path and proves at least one rendered SmartReport section is
      visible with section controls. If the current `no_template` response is
      expected, the test must fail for that exact reason.
- [ ] Implement the smallest fix that gives Utility a real report template/render
      path without forking report behavior away from the shared
      Template/Scope/Result architecture.
- [ ] Run focused SmartReport/app/middleware tests and a Chrome DevTools replay
      of the visible Report flow: render sections, click/edit section controls,
      inspect network response bodies, and check console state.
- [ ] Update or close GitHub `#11` with the regression, live replay evidence, and
      remaining risk.
- **Adversarial review:** Reject T1 if rendered sections are only endpoint-tested,
  if builder-local rows are counted as rendered report sections, if the fix adds a
  Utility-only fork instead of a reusable template path, or if section controls
  cannot be driven in the browser.

## T2 - F7 Integrate real surface (`#4`)

- [ ] Write a failing regression for the user-visible gate-commit to Integrate
      flow: an anonymous Utility user commits the gate, continues to Integrate,
      and sees the production Integrate surface rather than the value-prop panel
      or a disabled placeholder.
- [ ] Implement the smallest fix using the existing `Integrate`
      ScopedViewerWidget, `show_integrate` intent, and onboarding frame/state
      machinery. Do not recreate an onboarding-only Integrate view.
- [ ] Re-run focused gate/onboarding/Integrate tests and Chrome DevTools replay:
      gate commit, Continue to Integrate, connector/API/plugin controls, copy or
      download affordances where implemented, network/console proof.
- [ ] Update or close GitHub `#4`.
- **Adversarial review:** Reject T2 if clicking through only mutates state without
  mounting the production Integrate widget, if the evidence stops at a unit test,
  if anonymous/member gating is blurred, or if a blocked F7 control is silently
  ignored instead of tracked.

## T3 - Steady parity and per-entry sessions (`#5` / `#6`)

- [ ] Freshly verify `/workspaces`, `/projects`, and `/c/:sessionId` current
      behavior from source, tests, and Chrome DevTools. Determine whether `#6`
      is stale because per-scope session selection already shipped, or whether
      there is still a visible session-selection defect.
- [ ] Write failing user-visible regressions for any still-real steady defects:
      per-entry session selection, non-document widget parity, citation
      round-trip, Extract, SmartReport, and Integrate availability.
- [ ] Implement fixes using the shared `ConversationFlow`, scoped experiences,
      `ScopedCanvas`, and production viewer widgets. Split additional GitHub
      tickets before editing if T3 finds independent blockers outside this task.
- [ ] Re-run focused steady tests and Chrome DevTools replay for Workspaces,
      Projects, and `/c/:sessionId`, with DOM dimensions, app-owned network
      responses, session/message evidence, and console state.
- [ ] Update or close GitHub `#5` and `#6` as supported by evidence.
- **Adversarial review:** Reject T3 if onboarding is used as a proxy for steady
  parity, if generic unavailable canvas states are counted as widget parity, if
  session rows are not checked through user-visible navigation and network/DOM
  evidence, or if stale issues remain open without comment.

## T4 - Lighthouse metadata cleanup (`#12`)

- [ ] Write the smallest structural regression or executable check for the
      metadata failures: meta description, valid `robots.txt`, and `llms.txt`
      recommendation compliance.
- [ ] Implement metadata changes without introducing browser-visible secrets or
      deploy-specific hardcoding.
- [ ] Run the focused metadata check and a Chrome DevTools Lighthouse snapshot or
      navigation audit proving the failures are gone.
- [ ] Update or close GitHub `#12`.
- **Adversarial review:** Reject T4 if the check is snapshot-only, if metadata is
  hardcoded to a deployment host that is not true locally, if Lighthouse still
  reports the same failures, or if the fix changes product flow behavior.

## T5 - Final required-surface replay and cleanup

- [ ] Run `npm test`, targeted Playwright/E2E for touched paths,
      `npm run scan:secrets`, and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] Use Chrome DevTools MCP to replay all previously blocked required surfaces:
      SmartReport rendered sections, F7 Integrate, steady Workspaces/Projects
      parity, and metadata/Lighthouse.
- [ ] Close or accurately relabel linked GitHub issues. Any remaining deferred
      work must be backlog-labeled and must not be counted as sign-off.
- [ ] Archive the original Chrome DevTools audit change only when its blocked
      archive gate is genuinely satisfied. Then archive this change.
- [ ] Commit and push through GroundX Studio Harness lifecycle when available, or
      document the fallback used.
- **Adversarial review:** Reject closeout if any required surface remains
  unexercised, if any linked issue is stale or mislabeled, if the original audit
  is archived before evidence exists, if validation is stale, or if the summary
  hides skipped surfaces.
