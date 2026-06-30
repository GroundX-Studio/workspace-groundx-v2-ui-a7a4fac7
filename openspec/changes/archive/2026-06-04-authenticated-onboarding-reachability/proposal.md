# Authenticated onboarding reachability

## Why

The signed-in `OnboardingWizard` now uses real GroundX Studio copy, but the
production router only mounts `OnboardingProvider` on the `/` + `/home` route
branch. Signed-in users are commonly redirected to sibling routes such as
`/onboarding`, `/projects`, `/workspaces`, or `/c/:sessionId`, so the wizard can
be correct in isolation while not appearing in the authenticated experience.

The post-signup authenticated experience was not mocked in the wireframes. This
change should therefore use product judgment instead of claiming wireframe
parity: show first-time signed-in users what authenticated Studio gives them,
without inventing a second onboarding flow or touching the anonymous F1-F7
sandbox.

## What Changes

- Make the signed-in first-run `OnboardingWizard` reachable across authenticated
  product routes, including `/projects`, `/workspaces`, and `/c/:sessionId`.
  Keep `/onboarding` public and route-owned; it may show the signed-in wizard
  only when auth state is already hydrated by in-app navigation.
- Compose reachability through route layouts, not a second onboarding flow:
  authenticated product routes hydrate auth before mounting the provider, while
  public onboarding routes do not perform an anonymous auth probe.
- Update the wizard's default content so it orients users to authenticated
  Studio surfaces:
  - saved conversations / current session
  - Workspaces and Projects
  - the canonical onboarding sandbox
  - extraction, reports, and grounded chat outputs
  - Integrate/API/plugin handoff
- Keep the anonymous F1-F7 onboarding session state untouched.
- Keep completion on the existing `{ onboardingState: "complete" }` app
  metadata contract.
- Add router-level and browser-level coverage so the reachable product behavior
  is proven, not just the provider seam.

## Out of Scope

- Redesigning the anonymous F1-F7 onboarding flow.
- Adding a post-signup workspace setup wizard.
- Adding new persisted onboarding state beyond `onboardingState: "complete"`.
- Changing auth, registration, SSO, or anonymous-session claim behavior.
- Creating new route destinations for surfaces that do not already exist.

## Affected References And Modules

- Agent references:
  - `AGENTS.md`
  - `docs/agents/principles.md`
  - `docs/agents/discipline.md`
  - `docs/agents/onboarding-flow.md`
  - `docs/agents/design-bundle.md`
- Wireframe context:
  - `openspec/wireframes/source/spec-nav-v2.jsx` for the F-series capability
    sequence and Integrate/API/plugin visibility.
  - `openspec/wireframes/source/spec-flow.jsx` for the anonymous gate context.
  - `/Users/benjaminfletcher/git/groundx-wireframes/guided-sandbox-onboarding.md`
    for the first-session overlay direction.
- App:
  - `app/src/App.tsx`
  - `app/src/router/router.tsx`
  - `app/src/router/router.test.tsx`
  - `app/src/appConfig.ts`
  - `app/src/appConfig.test.ts`
  - `app/src/contexts/OnboardingContext/OnboardingProvider.tsx`
  - `app/src/contexts/OnboardingContext/OnboardingProvider.test.tsx`
  - `app/src/views/Onboarding/OnboardingWizard.tsx`
  - `app/src/views/Onboarding/OnboardingWizard.test.tsx`
  - e2e coverage under `app/e2e/` or the existing Playwright test location.

## Conformance To Core Architectural Decisions

- **Composable, not forked:** keep one `OnboardingProvider` and one
  `OnboardingWizard`. Broaden reachability through route layouts and vary
  copy/config. Do not add a separate authenticated onboarding shell.
- **Done-able:** done is user-visible: a first-time signed-in user can land on an
  authenticated product route and see the wizard describing what is available in
  Studio.
- **One source of truth:** reuse `APP_CONFIG.onboarding` and existing
  `onboardingState: "complete"` metadata. Do not add parallel state or local
  tracking.
- **TDD:** start with a failing routed test that proves the current provider
  mount is unreachable on product routes.

## Risks

- Mounting the provider too high could render the wizard over auth/login pages.
  The implementation must keep the existing auth/user metadata gate and add
  route-level tests that anonymous/auth routes do not show the signed-in wizard.
- Copy that over-promises missing surfaces would create a product trust problem.
  The wizard should name only existing destinations and clearly use the
  canonical sandbox link for deeper walkthroughs.
