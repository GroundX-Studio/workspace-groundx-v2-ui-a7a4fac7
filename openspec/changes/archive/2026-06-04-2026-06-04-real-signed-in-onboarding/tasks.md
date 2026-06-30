# Real signed-in OnboardingWizard Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` or `superpowers:subagent-driven-development`.
> Execute sequentially. Every task is followed by an adversarial review gate
> before the next task starts.

**Goal:** Close GitHub #15 by making the existing signed-in OnboardingWizard a
real GroundX Studio onboarding companion instead of a generic scaffold tour.

**Architecture:** Keep the existing wizard mechanism, context, and tool
contract. Make the policy/data product-real through `APP_CONFIG.onboarding`;
add only narrow presentational metadata needed to cite F-series frames and link
to the canonical sandbox.

**Tech Stack:** React, TypeScript, MUI, Vitest, React Testing Library, OpenSpec.

---

## Execution Plan

1. Task 1: OpenSpec and red tests.
2. Adversarial review 1.
3. Task 2: Product-real config and wizard rendering.
4. Adversarial review 2.
5. Task 3: Verification, OpenSpec validation, and issue cleanup decision.
6. Final adversarial review.

## Task 1 - SEQUENTIAL: OpenSpec And Red Tests

- [x] Add this OpenSpec proposal, tasks, and `ui-views` spec delta.
- [x] Add failing tests proving the default signed-in wizard:
  - renders GroundX Studio capability copy
  - renders a sandbox launch affordance pointing at `/onboarding`
  - does not render generic scaffold copy such as `Start with the app shell` or
    `Replace the starter Home page`
- [x] Run the focused app tests and confirm they fail for the expected reason.
      Evidence: `npm --prefix app run test -- OnboardingProvider.test.tsx OnboardingWizard.test.tsx`
      failed before implementation because the old app-shell copy still rendered
      and the wizard did not render `sourceFrame` / launch-link metadata.

**Adversarial review 1:** passed. The red tests failed against the old scaffold
copy, asserted `/onboarding`, and the OpenSpec proposal/spec names the affected
wireframes.

## Task 2 - SEQUENTIAL: Product-real Config And Wizard Rendering

- [x] Extend `AppOnboardingStepConfig` with optional source-frame and launch-link
      metadata.
- [x] Replace default steps with GroundX Studio steps:
  - Ingest: pick a sample, upload, or connect a source.
  - Understand: see processing, citations, and why-matched context.
  - Extract: inspect structured fields and schema-backed results.
  - Interact/Report: ask grounded questions and turn findings into outputs.
  - Integrate: connect API and agent surfaces after the demo.
- [x] Render source-frame metadata and the launch link in
      `OnboardingWizard.tsx` without changing the wizard navigation tools.
- [x] Run focused app tests and update only assertions that now describe the real
      product contract.
      Evidence: `npm --prefix app run test -- OnboardingProvider.test.tsx OnboardingWizard.test.tsx`
      passed 8/8 after implementation.

**Adversarial review 2:** passed. Diff is limited to config, wizard rendering,
tests, and OpenSpec. `OnboardingWizard.tools.ts`, `OnboardingProvider.tsx`, and
the anonymous `OnboardingShell` were not changed. The launch link is a
user-driven `/onboarding` link and does not persist completion.

## Task 3 - SEQUENTIAL: Verification And Cleanup Decision

- [x] Run focused app tests for the wizard/provider.
      Evidence: 8/8 passed.
- [x] Run `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-04-real-signed-in-onboarding --strict`.
      Evidence: change valid.
- [x] Run a source grep proving the old generic phrases are gone from product
      defaults.
- [x] Run full verification:
  - `npm --prefix app run build` passed.
  - `npm --prefix app run test` passed: 192 files, 1544 tests.
  - `npm --prefix middleware run build` passed.
  - `npm --prefix middleware run test` passed: 44 files, 731 tests.
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict --json`
    passed 18/18 items.
- [x] Decide whether GitHub #15 can be closed now or whether the router mount
      scope needs a follow-up issue first.
      Decision: the issue's stated mismatch is fixed. The router mount scope is
      an observed limitation, but it was explicitly out of scope and should not
      block #15 unless the owner wants the signed-in wizard mounted across all
      protected routes.

**Final adversarial review:** passed. Red-green was observed, OpenSpec validates,
old generic copy is absent from default product config, wizard tools remain
registered, and the router-mount limitation is recorded in `proposal.md` and in
the cleanup decision above.
