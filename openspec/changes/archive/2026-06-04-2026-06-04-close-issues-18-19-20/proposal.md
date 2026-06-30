# Close Issues 18, 19, And 20

## Why

The architecture review opened three actionable follow-ups that can be
completed without broad refactoring:

- GitHub issue #18: the durable `app-architecture` spec contradicts itself on
  whether `registerAdapter` is retired or retained.
- GitHub issue #19: Smart Report product scope still uses `filter.project`
  while the current data/search/RBAC contract uses `filter.projectId`.
- GitHub issue #20: configured frontend analytics initialize before explicit
  consent.

These should close as one short execution chain because #18 is pure spec
cleanup, #19 fixes the project scope vocabulary before more Smart Report E2E
work, and #20 fixes the browser-visible privacy gate identified by the review.

## What Changes

- Reconcile the app architecture spec so `registerAdapter` is explicitly
  retained for current live callers, while the canonical intent dispatch still
  remains the `CanvasOrchestratorContext.dispatch()` switch plus adapter
  fallback.
- Migrate Smart Report report scopes, app fixtures, fake API fixtures,
  middleware report doc index, and tests from `filter.project` to
  `filter.projectId`.
- Add a Smart Report guard that rejects product report scopes using
  `filter.project`.
- Add a frontend analytics consent source of truth and visible banner.
- Defer PostHog and GA initialization until consent is accepted; keep no-op
  behavior when env vars are unset.
- Clarify the security/privacy spec so CSP may pre-allow configured analytics
  hosts, but script/request loading remains consent-gated.

## Scope

In scope:

- Durable OpenSpec changes for `app-architecture`, `smart-report`, and
  `security-and-privacy`.
- Focused app and middleware tests for #19 and #20.
- Browser proof for #20 using Chrome DevTools MCP or a documented local-browser
  fallback if the MCP server is unavailable.
- GitHub cleanup for #18, #19, and #20 after validation.

Out of scope:

- Retiring or redesigning `registerAdapter` callers.
- Closing #11 or adding rendered Smart Report sections/templates.
- BYO ingest projectId stamping (#3).
- Hotjar implementation beyond ensuring the consent model reserves that
  integration.
- A dynamic per-session CSP implementation.

## Conformance to core architectural decisions

- **Composable-not-forked:** #19 changes the existing `ContentScope.filter`
  value, not a new Smart Report scope shape. #20 adds an app-level consent
  provider/surface rather than per-analytics-call branching.
- **Done-able:** each issue has a concrete close gate: spec contradiction gone,
  Smart Report cannot emit product `filter.project`, and tracker scripts do not
  load before consent.
- **One source of truth:** project scope remains `ContentScope.filter.projectId`;
  consent state is read through one frontend utility/provider; deferred issue
  cleanup remains in GitHub.

## Closure Gates

- `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-04-close-issues-18-19-20 --strict`
- Focused app tests for Smart Report and analytics consent pass.
- Focused middleware report renderer tests pass.
- Browser evidence records no GA/PostHog network/script before consent and
  tracker initialization after consent when env vars are configured.
- `npm run scan:secrets`
- `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
- `git diff --check`
- Commit, archive the OpenSpec change, and close GitHub issues #18, #19, and
  #20 with validation evidence.
