# Chrome DevTools MCP end-to-end experience audit

## Why

The current testing contract already requires full interaction audits and measured
evidence, but the next execution pass needs a concrete, repeatable plan for
using Chrome DevTools MCP end to end. Prior E2E work found browser-only defects
that Playwright structure tests did not catch, including network failures,
collapsed rendered surfaces, and interaction paths that looked plausible in a
screenshot but failed under DOM/network inspection.

This change creates the active execution plan for a fresh end-to-end audit of the
running GroundX Studio experience using Chrome DevTools MCP as the primary
inspection surface.

## What Changes

- Define the Chrome DevTools MCP evidence protocol for this audit: isolated
  browser contexts, a11y snapshots, DOM measurements, console review, network
  request/response-body review, screenshots as corroboration only, and optional
  Lighthouse/performance traces.
- Execute the experience through the user-visible paths that matter before
  sign-off: first-time onboarding, sample selection, PDF/viewer rendering,
  Extract, Report, Interact/chat, gates, auth/error branches, debug reset,
  responsive breakpoints, reduced motion, and steady-mode smoke.
- Require every task to be followed by an adversarial review that checks the work
  against the plan, the live browser state, console/network evidence, and the
  existing OpenSpec/agent guidance before the next task starts.
- Close findings honestly: fix in-scope defects with regression coverage and live
  re-verification, file active non-backlog bug issues for defects that must stay
  visible, or file deferred backlog issues for future/backlog work according to
  the repo label taxonomy.
- Finish with validation, commit/push, OpenSpec cleanup/archive only when
  complete, and a human-readable closeout of completed work plus remaining open
  OpenSpec and GitHub items excluding backlog.

## Execution Premises

- Chrome DevTools MCP is the primary UI verification tool. It drives page
  navigation and interaction, and it is the source of measured evidence.
- The app runs through the canonical scaffold boot path. If a preview helper is
  needed to start servers, Chrome DevTools MCP still owns browser inspection.
- The audit runs against real GroundX/live-data behavior where the current local
  setup requires it; pass/fail reporting separates clean-flow failures from
  deliberate negative probes and live-data/LLM variance.
- OpenSpec remains the only active planning surface. Deferred work graduates to
  GitHub issues; no rival tracker file is introduced.
- Required surfaces that are blocked by known backlog work (for example F7
  Integrate or steady-mode fidelity) are not treated as complete. Execution may
  stop with this change still active/blocked, but it SHALL NOT archive/sign off
  while required coverage is missing.

## Out of Scope

- Replacing the Playwright E2E suite or the existing vitest/unit contract layers.
- Broad visual redesign, copy rewrites, or new product behavior unrelated to
  defects found by the audit.
- Production deploy or destructive account/customer operations.
- Treating screenshots as primary proof that a control worked.

## Risks

- Live LLM/GroundX variance can blur failure classification. The task plan
  explicitly separates variance from reproducible product defects.
- Chrome DevTools MCP screenshots can be flaky. Screenshots are supplemental;
  verdicts depend on snapshots, measurements, network, console, and response
  bodies.
- The audit is wide enough to discover defects. The plan prevents drift by
  triaging every confirmed finding before closeout.
- Some required surfaces already overlap backlog issues. The execution plan must
  map those blockers before audit work and use an honest blocked outcome instead
  of silently downgrading required coverage.
