# Tasks - Chrome DevTools MCP end-to-end experience audit

Sequential. A task is not complete until its adversarial review passes against
the plan, the live browser state, and the relevant OpenSpec/agent guidance.
Screenshots are supporting artifacts only; every pass/fail verdict needs measured
evidence from Chrome DevTools MCP.

## T0 - Scope, tool, and environment preflight

- [x] Confirm Chrome DevTools MCP tool availability and record the evidence tools
      used by this audit: `new_page`, `navigate_page`, `take_snapshot`,
      `evaluate_script`, `list_console_messages`, `list_network_requests`,
      `get_network_request`, `resize_page`/`emulate`, `lighthouse_audit`, and
      `performance_start_trace`/`performance_stop_trace` where applicable.
- [x] Re-read `AGENTS.md`, `docs/agents/discipline.md`, `docs/agents/testing.md`,
      current `testing-suite`/`ui-views` specs, and the archived E2E plans so this
      pass reuses the scaffold discipline instead of inventing a parallel process.
- [x] Confirm active OpenSpec changes and current non-backlog GitHub issues before
      execution so audit findings are not duplicated.
- [x] Confirm known backlog issues that overlap required audit surfaces. At
      minimum map whether F7 Integrate and steady mode are blocked by existing
      backlog items; if they block required coverage, record that this change
      cannot archive/sign off until those surfaces are exercised.
- [x] Confirm canonical local boot path and port hygiene for the frontend and
      middleware without committing secrets or relying on mock mode. In this
      checkout, prefer `npm run dev` for local browser execution unless T0
      records a better route; use app `http://localhost:5173` or the configured
      Vite port, middleware `http://localhost:3001`, memory repository mode, and
      seeded live bucket `28454` unless the environment explicitly overrides it.
- [x] Lock the pass/fail taxonomy: clean-flow unexpected failure, deliberate
      negative/error probe, known live-data/LLM variance, in-scope defect,
      active non-backlog defect, deferred backlog defect, blocked required
      surface.
- **Adversarial review:** Reject the preflight if Chrome DevTools MCP is not the
  primary browser-inspection surface, if the plan relies on screenshots alone, if
  an existing open issue/change already covers the same work, or if boot/env
  state is ambiguous. Reject sign-off expectations if any required surface is
  known-blocked without an explicit blocked outcome.
  - **Passed:** evidence recorded in `evidence.md`; required backlog overlaps are
    mapped and do not block continuing the audit, but they block archive/sign-off
    if coverage remains unexercised.

## T1 - Evidence report and interaction inventory

- [x] Build the audit evidence template: route, viewport, browser context,
      interaction, expected user-visible effect, DOM/a11y proof, network
      proof, console proof, screenshot path when useful, and verdict.
- [x] Create the interaction inventory from live a11y snapshots and source/spec
      cross-checks: onboarding F1-F7, step strip, nav/compact chrome, PDF viewer
      controls, Extract controls, SmartReport controls, Integrate controls, chat,
      gates, auth routes, anonymous-to-authenticated claim flow where available,
      debug reset, steady-mode shell, workspaces/projects navigation, responsive
      breakpoints, and reduced-motion.
- [x] Define DOM measurement checks for rendered surfaces: nonzero dimensions,
      no horizontal overflow, no clipped/overlapping actionable controls, visible
      primary canvas/chat regions, and citation-highlight geometry where present.
- [x] Define network/console checks: app-owned fetch/XHR status, response-body
      spot checks for route-specific IDs/data, unexpected 4xx/5xx/failures, and
      console errors/warnings/issues since navigation.
- **Adversarial review:** Reject the inventory if another agent could not execute
  it from the file alone, if any required surface from `testing-suite` is absent,
  or if any verdict can pass without measured evidence.
  - **Passed:** evidence template, inventory, DOM checks, and network/console
    checks recorded in `evidence.md`; initial F1 live snapshot cross-checked
    against durable `testing-suite` coverage.

## T2 - Clean desktop first-time onboarding flow

- [x] Start the local app through the canonical scaffold boot path and open an
      isolated Chrome DevTools MCP context at `/onboarding`.
- [x] Verify the first-time F1 picker using `take_snapshot`, DOM measurements,
      and `/api/scenarios` network response bodies.
- [x] Select the seeded Utility sample and verify F2 thinking/PDF viewer render,
      F2-to-F3 transition, and chat/canvas layout using a11y, DOM, console, and
      network evidence.
- [x] Verify F3 Extract renders live field rows, citations/provenance, viewer
      dimensions, and expected app-owned requests without unexpected clean-flow
      console/network failures.
- **Adversarial review:** Reject the flow if the sample path is only endpoint-
  verified, if a blank/collapsed viewer could still pass, if response bodies do
  not match the visible scenario/document, or if clean-flow console/network
  failures are unexplained.
  - **Passed after in-scope fix:** evidence recorded in `evidence.md`; the
    anonymous chat bootstrap and chat input form issue were fixed and rechecked
    in a fresh isolated Chrome context.

## T3 - Production widget control audit

- [x] Exercise PdfViewer controls through the visible UI: page navigation,
      thumbnails or page affordances, zoom controls if present, citation chips,
      highlight geometry, rendered dimensions, and no overflow/collapsed panes.
- [x] Exercise Extract controls through the visible UI: field rows, provenance
      panel, category tabs, add/edit/schema-builder paths where present, rerun,
      save/export gated states, JSON/render toggle where present, and field
      geometry/network evidence.
- [x] Exercise SmartReport controls through the visible UI: render, section
      accept/reject, builder/editing affordances, pin/save/export gated states,
      citations, and request/response-body evidence.
- [x] Exercise Integrate controls through the visible UI where implemented:
      connector/API cards, plugin/download controls, unlock affordances, copy
      controls, and gated behavior. If blocked by known F7 backlog work, record
      the blocker and do not count Integrate as covered.
- **Adversarial review:** Reject the task if any required widget control is only
  listed but not driven, if before/after state is not measured, if onboarding
  widgets are used as a proxy for steady-mode parity, or if a blocked Integrate
  surface is counted as covered.
  - **Passed with tracked caveats:** PdfViewer, Extract, and visible
    SmartReport controls passed after in-scope fixes and live replay. Integrate
    was attempted and recorded as blocked by backlog `#4`, so it is not counted
    as covered. SmartReport rendered-section accept/reject controls were not
    available from the live Utility path because report render returned
    `reason: "no_template"`; T8 must dedupe or file that as tracked report
    seeding/render coverage work before closeout.

## T4 - Report, Interact/chat, and citation round trip

- [x] Navigate from the visible UI into Report and verify render/builder states,
      SmartReport requests, response bodies, and visible report/citation content
      or a clear user-facing empty/error state.
- [x] Navigate into Interact/chat, send a safe sample question, and verify message
      persistence, assistant response state, citation chips, and chat surface
      layout with DOM and network evidence.
- [x] Click citation chips from chat/report/extract where available and verify
      viewer navigation, page/highlight geometry, and telemetry/network side
      effects.
- [x] Separate LLM variance from deterministic defects by repeating or
      re-checking only the minimum needed prompts.
- **Adversarial review:** Reject the task if any surface was reached only by
  direct endpoint calls, if successful network responses are not reflected in the
  UI, if a citation chip does not prove the viewer round trip, or if LLM variance
  is misclassified as a product defect.
  - **Passed:** Report, Interact, pin-to-report, builder, and citation
    round-trip were driven through visible controls in fresh Chrome contexts;
    network responses matched the visible UI. The no-template report render
    limitation is classified separately for T8, not hidden as LLM variance.

## T5 - Gates, auth/error branches, and debug reset

- [x] Open the gate from the Extract unlock banner and from BYO
      `/onboarding/signup`; verify magic-link/SSO/book-call/keep-exploring paths,
      canvas swap/restore, and no unintended authed-only writes.
- [x] Exercise auth route negative branches, including invalid login/register
      behavior and password show/hide where applicable, while inspecting injected
      telemetry/error handling and app recovery.
- [x] Exercise anonymous-to-authenticated claim or continuation behavior where
      the local environment supports it; otherwise record the exact blocker and
      do not count the claim path as covered.
- [x] Exercise the debug reset path from `/auth/login?debug=true`; verify cookies,
      localStorage/session state, and visible first-time onboarding remount.
- [x] Label expected 4xx/negative-probe responses separately from clean-flow
      failures in the evidence report.
- **Adversarial review:** Reject the task if any deliberate negative probe leaves
  the app mounted in a broken state, if reset misses session-scoped state, if
  expected failures are mixed with clean-flow failures, or if console errors are
  left unexplained.
  - **Passed with blocked-surface caveat:** gate, auth negative branches, and
    reset were exercised through visible UI and Chrome DevTools evidence.
    Expected negative `404`/client-validation paths are separated from
    clean-flow failures. Magic-link continuation can enable Integrate from the
    active Utility session, but the actual F7 surface remains blocked by backlog
    `#4` and is not counted as covered.

## T6 - Steady-mode navigation and widget parity

- [x] Enter steady mode through the current supported route for an authenticated
      or seeded session and verify the shell mounts real production widgets, not
      onboarding-only stubs.
- [x] Exercise workspaces/projects navigation and any available steady-mode nav
      entries. If a nav path depends on account/project data unavailable locally,
      record the exact dependency and do not count that path as covered.
- [x] Exercise the steady-mode chat/viewer/widget loop: chat input, persisted
      messages, viewer dimensions, citation chips when present, citation
      round-trip, and app-owned session/message requests.
- [x] Re-drive the required production widget controls in steady mode where the
      surface is implemented: PdfViewer, Extract, SmartReport, and Integrate.
      If steady widget parity is blocked by known backlog work, record the
      blocker and do not archive/sign off.
- **Adversarial review:** Reject the task if steady mode is skipped without a
  concrete blocker, if onboarding is used as a proxy, if workspaces/projects nav
  is not attempted, if session/message persistence is not checked through network
  or DOM evidence, or if a blocked parity surface is counted as covered.
  - **Passed with blocked parity caveats:** `/c/:sessionId` mounted a known
    session, hydrated previous messages, accepted a typed chat turn, and mounted
    the production PdfViewer from citation clicks with measured dimensions.
    `/workspaces` and `/projects` mounted scoped shells and chat sessions, but
    non-document canvas/widget parity stayed on the generic unavailable canvas.
    Extract, SmartReport, and Integrate parity in steady mode remain covered by
    backlog `#5`/`#4` and are not counted as complete.

## T7 - Responsive, reduced-motion, accessibility, and performance checks

- [x] Re-run key states at desktop, tablet, and mobile breakpoints using
      `resize_page`/`emulate`; measure chat, nav, canvas, gate, and widget
      bounding boxes rather than relying on screenshots.
- [x] Verify compact-mode controls: nav drawer, view-swap behavior, step strip,
      active/locked states, focusable controls, and no horizontal overflow.
- [x] Run a11y snapshots on core states and Lighthouse snapshot/navigation audits
      where they add signal.
- [x] Run a short performance trace for the most important navigation or
      interaction if the local environment is stable enough to interpret it.
- **Adversarial review:** Reject the task if responsive checks use screenshots as
  primary proof, if mobile is approximated without noting the actual viewport, if
  a11y evidence does not name the relevant nodes, or if performance findings are
  reported without environmental caveats.
  - **Passed after in-scope fixes:** desktop/tablet/mobile states were measured
    with Chrome DevTools. Compact drawer Escape behavior and mobile F1 contrast
    failures were fixed with focused regressions and live rechecks. Lighthouse
    mobile snapshot improved from accessibility `96` to `100`; remaining
    failures are SEO/agentic metadata, not flow blockers. Performance trace is
    recorded as local lab evidence only.

## T8 - Findings triage, fixes, and regression coverage

- [x] Dedupe every candidate finding against existing OpenSpec changes and
      GitHub issues, including backlog issues that overlap required audit
      surfaces.
- [x] Classify each confirmed finding as in-scope fix, active non-backlog defect
      issue, deferred backlog issue, blocked required surface, or expected
      external/live-data limitation.
- [x] For each in-scope defect, add the smallest feasible failing regression
      check first, implement the fix, run the focused test, then re-verify live
      with Chrome DevTools MCP measured evidence before moving to the next defect.
- [x] For each active or deferred defect, create or update a GitHub issue with
      reproduction steps, evidence, labels, and explicit non-backlog/backlog
      status according to the repo label taxonomy.
- **Adversarial review:** Reject triage if any confirmed defect has no fix or
  tracking issue, if a fix lacks feasible regression coverage, if a deferred
  issue lacks browser evidence, if source TODOs are left without OpenSpec/GitHub
  tracking, or if backlog blockers are used to claim completion.
  - **Passed:** all in-scope defects have focused failing-first regressions and
    Chrome replays. Required but still-uncovered surfaces are tracked as backlog
    blockers: existing `#4`, `#5`, `#6`, plus new `#11` and `#12`. No backlog
    blocker is counted as completed coverage.

## T9 - Full validation, commit, GitHub/OpenSpec cleanup, and summary

- [x] Run the final validation set appropriate to the actual changes:
      `npm test`, targeted Playwright/E2E where touched, `npm run scan:secrets`,
      and `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [x] Re-run a Chrome DevTools MCP smoke on the fixed/critical paths and confirm
      the clean-flow evidence has no unexplained console or network failures.
- [x] Commit and push the completed work through the GroundX Studio Harness
      lifecycle when available, or document the fallback used.
- [ ] **Blocked:** Archive this OpenSpec change only after execution evidence, fixes/issues,
      validation, and review gates are complete. If any required surface remains
      blocked or unexercised, leave the change active/blocked and report the
      blocker instead of archiving.
- [x] Produce the human summary: tasks completed, defects fixed, issues filed or
      closed, validation results, remaining active OpenSpec changes/tasks, and
      remaining open non-backlog GitHub issues.
- **Adversarial review:** Reject closeout if the worktree is dirty without
  explanation, if the OpenSpec change is archived before evidence is complete, if
  any non-backlog GitHub issue created by this audit is unaccounted for, if any
  required surface is blocked but reported as complete, or if the summary hides
  skipped surfaces.
  - **Passed with blocked-active caveat:** validation and Chrome smoke evidence
    are recorded in `evidence.md`; GroundX Studio `commit_push` was unavailable
    because the attached GroundX MCP account reported `workspaceTools:false`, so
    ordinary git fallback is used for commit/push. The change is intentionally
    left active rather than archived because F7, steady non-document widget
    parity, and SmartReport rendered-section coverage remain blocked by backlog
    issues.
  - **Post-close adversarial review cleanup (2026-06-03):** the archive gate was
    previously checked even though the review verdict says blocked-active. That
    made `openspec list` report this change as complete while its required
    surfaces were still unexercised. The gate is now unchecked and a follow-up
    execution plan (`2026-06-03-required-e2e-gap-closure`) owns the remaining
    required-surface blockers.
