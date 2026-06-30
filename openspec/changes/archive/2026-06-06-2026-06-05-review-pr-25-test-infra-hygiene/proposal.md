# Review PR #25 test-infra, hygiene, docs, and hook changes

## Why

PR #25 is broad for a "hygiene" branch: it changes test setup, lint policy,
production logging gates, React hook dependencies, shared-type contract tests,
and agent docs. That mix can hide regressions because each edit is small, but
the combined surface touches the gates that tell us whether the scaffold is
safe to ship.

This change creates a review-only OpenSpec plan for a careful, evidence-backed
review of every touched aspect before the PR is merged.

## What changes

- Add a review inventory for every file touched by PR #25.
- Require each PR claim to be proven against source, tests, and build/lint
  evidence, not accepted from the PR body alone.
- Require adversarial checks for:
  - Node 24/25 Web Storage behavior and the StorageEvent caveat.
  - Analytics consent styling token compliance and the remaining focus-ring hex.
  - `no-console` behavior, intentional DEV-only diagnostics, and production log
    stripping.
  - React hook dependency changes and stale-closure fixes.
  - Shared-type contract tests after eslint-disable cleanup.
  - Documentation truthfulness for F7 Integrate and local e2e prerequisites.
  - Mechanical cleanup artifacts such as whitespace-only lines.
- Define the closure gates and the review comment format.
- Make PR feedback the explicit outcome of the work:
  - one short top-level comment for a busy human engineer, in plain English;
  - one longer tool-directed comment for Claude with repair guidance;
  - inline review comments only for verified hunk-level issues.

## Scope

In scope:

- PR #25 in `GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7`.
- Base branch `workspace/groundx-v2-ui`.
- Head branch `fix/test-infra-portability-and-doc-cleanup`.
- All 17 files changed by the PR.
- Review evidence, local verification, and GitHub PR feedback.
- Feedback guidance for the PR author/tool on using the harness, `AGENTS.md`,
  reference docs, OpenSpec, and Superpowers to repair the branch.

Out of scope:

- Merging PR #25.
- Rewriting the PR branch before review findings are confirmed.
- Upgrading jsdom, vite, vitest, or Node.
- Fixing unrelated dependency vulnerabilities.
- Creating new product behavior beyond review comments or follow-up tickets.

## Affected files

| Area | Files |
| --- | --- |
| Test setup | `app/src/test/setup.ts`, `app/src/test/storage-polyfill.test.ts` |
| Lint and logs | `app/eslint.config.js`, `app/src/api/chatSessions.ts`, `app/src/contexts/OnboardingSessionContext/OnboardingSessionContext.tsx` |
| Styling | `app/src/components/privacy/AnalyticsConsent/AnalyticsConsentProvider.tsx` |
| Hook deps | `app/src/contexts/DocumentsContext/DocumentsProvider.tsx`, `app/src/contexts/OnboardingSessionContext/OnboardingSessionContext.tsx`, `app/src/views/Onboarding/OnboardingShell.tsx` |
| Contract tests | `app/src/api/entities/customerEntity.test.ts`, `app/src/contexts/ChatStoreContext/ChatStoreServerHydrator.test.tsx`, `app/src/contexts/ChatStoreContext/SchemaFieldExtractionResult.contract.test.ts`, `app/src/contexts/ChatStoreContext/ViewerStepKind.contract.test.ts`, `app/src/contexts/Source.contract.test.ts`, `middleware/src/appUserMetadata.contract.test.ts`, `middleware/src/sourceSchema.contract.test.ts` |
| Docs | `docs/agents/gotchas.md`, `docs/agents/overview.md` |

## Conformance to core architectural decisions

- **Composable, not forked**: this plan adds no runtime mechanism. Review work is
  a checklist over existing test, lint, build, and OpenSpec gates.
- **Done-able**: done means every touched file has a recorded review verdict,
  every PR claim has evidence, every defect is either fixed by the PR author or
  filed as an actionable follow-up, and no open review blocker remains.
- **One source of truth**: the plan lives in OpenSpec, uses GitHub as the PR
  feedback surface, and does not create a rival tracker.

## Exit criteria

- `openspec validate 2026-06-05-review-pr-25-test-infra-hygiene --strict` passes.
- The reviewer records a verdict for every file in the affected-file inventory.
- Local verification runs the repo gates available on the reviewer machine.
- Node 24/25-specific claims are either verified on Node 24/25 or explicitly
  marked as requiring external evidence from CI or another runtime.
- Every finding posted to GitHub names the file, line or hunk, risk, and the
  exact evidence that supports it.
