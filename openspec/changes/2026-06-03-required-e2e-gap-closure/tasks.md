# Tasks - Required E2E gap closure after Chrome DevTools audit

Sequential. A task is not complete until its adversarial review passes against
the linked GitHub issue(s), this plan, the real code, and Chrome DevTools MCP
evidence. Every code-changing task starts with a failing user-visible regression.

**Execution adjustment (2026-06-03):** Run `T0`, then verification-first passes
for `T2` and `T3` before attempting the larger SmartReport work in `T1`.
Current source/tests indicate `#4` and `#6` may already be stale or narrow and
`#5` may be partly closable by evidence. Closing stale issues with Chrome
DevTools proof is preferred over inventing code. `T1` remains the likely
substantive blocker because the server intentionally returns `reason:
"no_template"` when no report template row exists.

## T0 - Fresh blocker audit and plan hygiene

- [x] Re-read `AGENTS.md`, `docs/agents/discipline.md`,
      `docs/agents/testing.md`, `docs/agents/template-scope-results.md`,
      `docs/agents/real-data-rewire-gap.md`, the prior Chrome DevTools audit
      evidence, and the linked GitHub issues `#4`, `#5`, `#6`, `#11`, and
      `#12`.
- [x] For each linked issue, grep/read the current source and tests first. Mark
      whether the issue is still real, partially shipped, stale, or blocked on
      external data.
- [x] Ensure the original Chrome DevTools audit change remains active/blocked
      until this plan closes all required-surface gaps. Do not archive it at T0.
- [x] Add comments or updates to the linked GitHub issues if T0 proves any issue
      is stale, duplicated, or needs narrowed acceptance criteria.
- **Adversarial review:** Reject T0 if it accepts old evidence without checking
  current code, creates duplicate GitHub issues for already-tracked gaps, leaves
  the original audit change looking complete, or starts implementation before the
  blocker map is current.
  - **Passed:** current source, tests, GitHub, and Chrome evidence were
    refreshed. `#4` had a real post-gate F7 handoff bug, `#6` had a real
    duplicate same-scope session bug, `#5` remains a broader backlog wireframe
    audit, and `#11` remains blocked on persisted report template/render data.
    GitHub issues were closed or commented accordingly. See `evidence.md`.

## T1 - SmartReport Utility rendered sections (`#11`)

- [x] Start T1 only after the `#4/#5/#6` stale-issue verification pass is
      complete. Do not hide the `no_template` behavior behind a fixture-only
      shortcut.
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
  - **Deferred:** source inspection confirmed `reportRenderer` intentionally
    returns `reason: "no_template"` when no persisted template row exists. This
    is not a quick/no-refactor closeout item; GitHub `#11` remains the tracked
    backlog blocker.

## T2 - F7 Integrate real surface (`#4`)

- [x] Verification-first pass: inspect current source/tests and Chrome DevTools
      replay before writing code. If the real `Integrate` ScopedViewerWidget is
      already mounted through F7 with connector/API/plugin controls and no
      placeholder, close `#4` as stale with evidence rather than editing.
- [x] Write a failing regression for the user-visible gate-commit to Integrate
      flow: an anonymous Utility user commits the gate, continues to Integrate,
      and sees the production Integrate surface rather than the value-prop panel
      or a disabled placeholder.
- [x] Implement the smallest fix using the existing `Integrate`
      ScopedViewerWidget, `show_integrate` intent, and onboarding frame/state
      machinery. Do not recreate an onboarding-only Integrate view.
- [x] Re-run focused gate/onboarding/Integrate tests and Chrome DevTools replay:
      gate commit, Continue to Integrate, connector/API/plugin controls, copy or
      download affordances where implemented, network/console proof.
- [x] Update or close GitHub `#4`.
- **Adversarial review:** Reject T2 if clicking through only mutates state without
  mounting the production Integrate widget, if the evidence stops at a unit test,
  if anonymous/member gating is blurred, or if a blocked F7 control is silently
  ignored instead of tracked.
  - **Passed:** failing regression added for the gate-commit Continue path;
    `advanceFrame("f7")` now clears the completed sign-up overlay/gate handoff.
    Chrome DevTools replay in a fresh context proved
    `data-canvas-kind="integrate"`, Integrate visible, no gate surface, no
    console errors, and app-owned requests stayed 2xx. GitHub `#4` was closed
    with the evidence.

## T3 - Steady parity and per-entry sessions (`#5` / `#6`)

- [x] Verification-first pass: inspect current source/tests and Chrome DevTools
      replay before writing code. If `/workspaces` and `/projects` already
      resolve per-scope sessions via `resolveSessionForScope`, close `#6` as
      stale with evidence. Narrow or close `#5` based only on measured steady
      route behavior.
- [x] Freshly verify `/workspaces`, `/projects`, and `/c/:sessionId` current
      behavior from source, tests, and Chrome DevTools. Determine whether `#6`
      is stale because per-scope session selection already shipped, or whether
      there is still a visible session-selection defect.
- [x] Write failing user-visible regressions for any still-real steady defects:
      per-entry session selection, non-document widget parity, citation
      round-trip, Extract, SmartReport, and Integrate availability.
- [x] Implement fixes using the shared `ConversationFlow`, scoped experiences,
      `ScopedCanvas`, and production viewer widgets. Split additional GitHub
      tickets before editing if T3 finds independent blockers outside this task.
- [x] Re-run focused steady tests and Chrome DevTools replay for Workspaces,
      Projects, and `/c/:sessionId`, with DOM dimensions, app-owned network
      responses, session/message evidence, and console state.
- [x] Update or close GitHub `#5` and `#6` as supported by evidence.
- **Adversarial review:** Reject T3 if onboarding is used as a proxy for steady
  parity, if generic unavailable canvas states are counted as widget parity, if
  session rows are not checked through user-visible navigation and network/DOM
  evidence, or if stale issues remain open without comment.
  - **Passed for `#6`, deferred for `#5`:** live Workspace->Project navigation
    initially exposed duplicate same-scope sessions. A failing resolver test now
    covers same-tick duplicate resolution, and a fresh Chrome context proved one
    Workspace session plus one Project session with distinct scope keys. `#5`
    remains a backlog wireframe-fidelity audit and was not closed by this narrow
    pass. GitHub `#6` was closed; GitHub `#5` was left open with a fresh
    backlog/narrowing comment.

## T4 - Lighthouse metadata cleanup (`#12`)

- [x] Write the smallest structural regression or executable check for the
      metadata failures: meta description, valid `robots.txt`, and `llms.txt`
      recommendation compliance.
- [x] Implement metadata changes without introducing browser-visible secrets or
      deploy-specific hardcoding.
- [x] Run the focused metadata check and a Chrome DevTools Lighthouse snapshot or
      navigation audit proving the failures are gone.
- [x] Update or close GitHub `#12`.
- **Adversarial review:** Reject T4 if the check is snapshot-only, if metadata is
  hardcoded to a deployment host that is not true locally, if Lighthouse still
  reports the same failures, or if the fix changes product flow behavior.

**T4 execution note (2026-06-03):** User requested a small fix that could be
completed without the larger required-surface work, so T4 was executed early as a
standalone cleanup. Evidence: `app/src/test/static-metadata.test.ts` red -> green;
`npm --workspace app test` 191 files / 1553 tests passed; `npm --workspace app run
build` passed; `npm run scan:secrets` passed; Chrome DevTools Lighthouse on the
canonical dev path `http://localhost:5173/auth/login` scored Accessibility 100,
Best Practices 100, SEO 100, Agentic Browsing 100, with 50 passed and 0 failed
in the DevTools MCP navigation audit. Remaining T0-T3 and T5 work stays open.

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
