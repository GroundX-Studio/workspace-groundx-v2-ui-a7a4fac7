# Authenticated Onboarding Reachability Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:executing-plans` or `superpowers:subagent-driven-development`.
> Execute sequentially. Every task is followed by an adversarial review gate
> before the next task starts.

**Goal:** Show first-time signed-in users what is available in the authenticated
GroundX Studio experience, and prove the wizard is reachable on real product
routes.

**Architecture:** Keep the existing `OnboardingProvider`, `OnboardingWizard`,
and `APP_CONFIG.onboarding` mechanism. Compose the provider through route
layouts so it covers product routes without creating a second onboarding state
machine. Vary authenticated content through config.

**Tech Stack:** React, TypeScript, MUI, React Router, Vitest, React Testing
Library, Playwright, Chrome DevTools MCP, OpenSpec.

---

## Execution Plan

1. Task 1: Red routed reachability tests.
2. Adversarial review 1.
3. Task 2: Provider composition fix.
4. Adversarial review 2.
5. Task 3: Authenticated-experience wizard content.
6. Adversarial review 3.
7. Task 4: Browser/e2e verification.
8. Final adversarial review, commit, GitHub/OpenSpec cleanup, and human summary.

## Task 1 - SEQUENTIAL: Red Routed Reachability Tests

- [x] Add a failing router/app-level test proving a first-time signed-in user
      sees the signed-in `OnboardingWizard` on `/projects`.
      - Preferred file: `app/src/router/router.test.tsx`, or create
        `app/src/router/authenticatedOnboardingRoutes.test.tsx` if the setup
        needs a larger harness.
      - The test should render through the real router/provider composition or
        the closest existing render harness that includes `AuthContext`,
        `OnboardingProvider`, and product routes.
      - Assert the dialog name: `/welcome to groundx studio/i`.
      - Assert the current product-route content still renders.
- [x] Add the same coverage for `/workspaces`, `/onboarding`, and
      `/c/:sessionId`, or parameterize the route cases in one test.
- [x] Add negative coverage proving anonymous users and users with
      `onboardingState: "complete"` do not see the signed-in wizard.
- [x] Run the focused test and confirm the first-time signed-in product-route
      case fails before implementation.
      - Run: `npm --prefix app run test -- router`
      - Expected before implementation: fail because the signed-in wizard is not
        mounted on sibling product routes.

**Adversarial review 1:** verify the tests fail for the route-mount reason, not
because of missing mocks or unrelated provider setup. Verify the tests assert
user-visible behavior, not only route object shape.

Result: passed. `npm --prefix app run test -- authenticatedOnboardingRoutes.test.tsx`
fails only on the four first-time signed-in product routes because no
`Welcome to GroundX Studio` dialog is present; completed and anonymous cases pass.

## Task 2 - SEQUENTIAL: Route Layout Composition Fix

- [x] Move or compose `OnboardingProvider` so it can render above the product
      routes where signed-in users land.
      - Implement `ProductRouteLayout` for authenticated product routes:
        `AppInitialization` hydrates auth, then `OnboardingProvider` wraps the
        product outlet.
      - Implement `PublicOnboardingLayout` for public onboarding routes:
        wrap the existing sandbox with `OnboardingProvider` only after auth is
        already hydrated by in-app navigation; do not perform an anonymous auth
        probe on cold `/onboarding` loads.
      - Keep `OnboardingProvider` out of `AppProviders` so auth/login/register
        routes are not globally wrapped and anonymous onboarding remains
        route-owned.
      - Do not wrap auth/login/register/reset pages in `AppInitialization`.
      - Do not change anonymous `/onboarding` route availability.
- [x] Keep the existing provider gate:
      `APP_CONFIG.onboarding.enabled && auth.isLoggedIn && Boolean(user) &&
      user?.appMetadata?.onboardingState !== "complete" &&
      !isDismissedForSession`.
- [x] Run the focused route/provider tests.
      - Run:
        `npm --prefix app run test -- router OnboardingProvider.test.tsx`
      - Expected after implementation: route reachability tests pass and
        provider behavior tests still pass.

**Adversarial review 2:** inspect the diff for accidental auth-gate changes,
double mounting, anonymous F-series state mutation, and wizard rendering on auth
pages. Confirm `/onboarding` still mounts `OnboardingShell` for anonymous users.

Result: passed after adversarial browser review corrected the initial global
provider approach. `router.tsx` now exports `ProductRouteLayout` and
`PublicOnboardingLayout`; `OnboardingProvider` remains a single state machine and
is not mounted globally in `AppProviders`. A second adversarial browser review
rejected a silent `/api/auth/me` probe on public `/onboarding` because it created
anonymous 401 console noise; that probe was removed so anonymous onboarding has
no new auth call. `npm --prefix app run test -- authenticatedOnboardingRoutes.test.tsx AppInitialization.test.tsx AuthProvider.test.tsx router.test.tsx OnboardingProvider.test.tsx`
passes 21/21.

## Task 3 - SEQUENTIAL: Authenticated-Experience Wizard Content

- [x] Update `APP_CONFIG.onboarding.steps` so the signed-in wizard describes the
      authenticated Studio experience using existing surfaces only.
      - Include saved/current conversations or sessions.
      - Include Workspaces.
      - Include Projects.
      - Include the canonical `/onboarding` sandbox as the deeper walkthrough.
      - Include extraction, reports, and grounded chat outputs.
      - Include Integrate/API/plugin handoff.
      - Do not describe a post-signup workspace setup wireframe.
- [x] Preserve optional `sourceFrame`, `routeHint`, `launchHref`, and
      `launchLabel` metadata only where it helps the user navigate.
- [x] Update `app/src/appConfig.test.ts`,
      `app/src/views/Onboarding/OnboardingWizard.test.tsx`, and
      `app/src/contexts/OnboardingContext/OnboardingProvider.test.tsx` so they
      assert the authenticated product copy and continue rejecting scaffold copy.
- [x] Run focused tests.
      - Run:
        `npm --prefix app run test -- appConfig OnboardingWizard.test.tsx OnboardingProvider.test.tsx`
      - Expected: all pass.

**Adversarial review 3:** compare copy against the current app routes and
components. Reject any step that names a destination that does not exist, sounds
like generic scaffold guidance, or implies a mocked post-signup workspace setup
has shipped.

Result: passed. `npm --prefix app run test -- appConfig OnboardingWizard.test.tsx OnboardingProvider.test.tsx authenticatedOnboardingRoutes.test.tsx`
passes 31/31. Route scan confirms `/workspaces`, `/projects`, `/onboarding`,
and `/c/:sessionId` are registered. App-code scan confirms starter/workspace
setup copy was not introduced, and the diff does not modify the anonymous
`OnboardingShell` or `OnboardingSessionContext`.

## Task 4 - SEQUENTIAL: Browser And Full Verification

- [x] Run full app verification.
      - Run: `npm --prefix app run build`
      - Run: `npm --prefix app run test`
- [x] Run middleware verification to catch shared contract fallout.
      - Run: `npm --prefix middleware run build`
      - Run: `npm --prefix middleware run test`
- [x] Run OpenSpec validation.
      - Run:
        `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict --json`
- [x] Start the local app/middleware preview using the repo's existing preview
      path.
- [x] Use Chrome DevTools MCP against the running app to verify:
      - `/projects` shows the signed-in wizard for first-time signed-in metadata.
      - `/projects` does not show the wizard after completion.
      - `/onboarding` still renders the anonymous/sandbox surface without an
        auth probe, redirect, signed-in wizard, or anonymous F-series mutation.
- [x] Capture console/network errors from Chrome DevTools MCP and fix any
      regressions introduced by the provider move.

Browser result: passed on built preview `http://127.0.0.1:4175` with a fake-auth
middleware on `127.0.0.1:3004`. Chrome DevTools MCP verified first-time
`/projects` opens `Welcome to GroundX Studio`, the underlying product route
remains visible, `Finish` persists `onboardingState: "complete"`, and a reload
of `/projects` keeps the wizard closed. Anonymous `/onboarding` renders the
public sandbox, does not redirect, does not show the signed-in wizard, makes no
`/api/auth/me` request, and has no 401 console error. Authenticated path had no
console messages.

Verification result: passed after the anonymous-probe correction. `npm --prefix
app run test` passed 193 files / 1551 tests; `npm --prefix app run build`
passed; `npm --prefix middleware run build` passed; `npm --prefix middleware
run test` passed 44 files / 731 tests; `OPENSPEC_TELEMETRY=0 npx
@fission-ai/openspec@1.3.1 validate --all --strict --json` passed 18/18 items
with only pre-existing long-requirement INFO notes.

**Final adversarial review:** perform a fresh scan against this plan, the code,
the agent references, and the wireframe context. Confirm the change follows
composable architecture, TDD, one source of truth, user-visible done, and does
not touch anonymous onboarding beyond the intended provider reachability. If
successful, commit once, close/archive the OpenSpec change, perform GitHub issue
cleanup if an issue is opened for this work, and provide a human summary of:
completed tasks, remaining OpenSpec plans/tasks, and remaining non-backlog
GitHub issues.
