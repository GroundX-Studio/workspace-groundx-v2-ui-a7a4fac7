# Tasks: Close Issues 18, 19, And 20

Use `superpowers:executing-plans` for execution and
`superpowers:test-driven-development` for behavior changes. Every task is
SEQUENTIAL and MUST be followed by its adversarial review before the next task.

## Execution Plan

1. Create and validate the OpenSpec change.
2. Fix #18 spec contradiction.
3. Adversarial review #18.
4. Fix #19 Smart Report `projectId` scope.
5. Adversarial review #19.
6. Fix #20 analytics consent gate.
7. Adversarial review #20.
8. Final validation, commit, archive, and GitHub cleanup.

## Between-Task Adversarial Review Protocol

After each implementation task, append to `evidence/adversarial-reviews.md`:

- task number and title
- claims made
- counterevidence searched
- files and commands checked
- verdict: `passed` or `failed`
- required correction before advancing

If a review fails, correct the work and rerun the adversarial review before
starting the next task.

## Task 1 - SEQUENTIAL: Create And Validate OpenSpec Plan

- [x] Create `proposal.md`, `design.md`, `tasks.md`, and spec deltas for
      `app-architecture`, `smart-report`, and `security-and-privacy`.
- [x] Create `evidence/adversarial-reviews.md`.
- [x] Run
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-04-close-issues-18-19-20 --strict`.
- [x] Adversarial review: verify the plan is concrete, sequential, scoped to
      issues #18, #19, and #20, and contains no product-code changes yet.

## Task 2 - SEQUENTIAL: Resolve #18 registerAdapter Spec Contradiction

- [x] Re-scan live `registerAdapter` callers.
- [x] Modify durable `openspec/specs/app-architecture/spec.md` so it has one
      current invariant: `dispatch()` is canonical and `registerAdapter` is
      retained for current live callers.
- [x] Update the OpenSpec delta if the final wording changes.
- [x] Run
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-04-close-issues-18-19-20 --strict`.
- [x] Adversarial review #18: confirm no product code changed, no future
      adapter expansion was introduced, and issue #18 can close after archive.

## Task 3 - SEQUENTIAL: Migrate Smart Report To filter.projectId (#19)

- [x] Write failing app tests proving Smart Report product scopes use
      `filter.projectId` and reject/avoid `filter.project`.
- [x] Write failing middleware tests proving `resolveScopeDocSet` reads
      `scope.filter.projectId` and not `scope.filter.project`.
- [x] Run the focused tests and confirm they fail for the expected reason.
- [x] Update app Smart Report fixtures, render/builder tests, fake API fixtures,
      and onboarding report scope to `filter.projectId`.
- [x] Update middleware Smart Report doc index, resolver, app tests, and
      README/examples to `filter.projectId`.
- [x] Add a focused guard that fails if product Smart Report code reintroduces
      `filter.project`.
- [x] Run focused app and middleware Smart Report tests.
- [x] Adversarial review #19: verify the render path passes `projectId` through
      app and middleware, #11 remains separate, and `/projects` still uses
      canonical `projectId`.

## Task 4 - SEQUENTIAL: Gate Frontend Analytics Behind Consent (#20)

- [x] Write failing app tests proving `main.tsx` no longer initializes
      PostHog/GA before the app renders.
- [x] Write failing app tests for cold-load no-consent banner, no tracker
      initialization before accept, accept initializes configured trackers, and
      no-op behavior when env vars are unset.
- [x] Run the focused tests and confirm they fail for the expected reason.
- [x] Add a consent utility/provider and banner.
- [x] Move frontend tracker initialization into the consent provider after
      consent is accepted.
- [x] Keep `track`, `identify`, `gaTrack`, and `gaSetDefaults` no-op safe
      before initialization.
- [x] Update security/privacy spec language to clarify CSP deploy allowlisting
      versus consent-gated script/request loading.
- [x] Run focused analytics/consent app tests.
- [x] Use Chrome DevTools MCP or documented browser fallback to prove no
      analytics scripts/requests before consent and configured trackers after
      accept.
- [x] Adversarial review #20: verify tracker scripts do not load before
      consent, consent state is durable, no app behavior depends on pre-consent
      analytics, and #20 can close after archive.

## Task 5 - SEQUENTIAL: Final Validation, Commit, Archive, GitHub Cleanup

- [ ] Run focused app tests for Smart Report and analytics consent.
- [ ] Run focused middleware Smart Report tests.
- [ ] Run `npm run scan:secrets`.
- [ ] Run
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] Run `git diff --check`.
- [ ] Commit the implementation and OpenSpec files.
- [ ] Archive the OpenSpec change.
- [ ] Run post-archive
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
      and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list`.
- [ ] Close GitHub issues #18, #19, and #20 with evidence.
- [ ] Final adversarial review: confirm the work stayed in scope, all
      validation gates passed, OpenSpec is clean, and remaining open GitHub
      issues are backlog only.
