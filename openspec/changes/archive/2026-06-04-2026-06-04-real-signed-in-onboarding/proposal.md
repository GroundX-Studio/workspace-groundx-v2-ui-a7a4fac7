# Real signed-in OnboardingWizard

## Why

GitHub #15 identified that the signed-in `OnboardingWizard` still carries
generic scaffold copy even though the rest of the product is GroundX Studio.
The product does want a signed-in onboarding experience, but it should be a
real orientation to the GroundX journey rather than starter-app instructions.

The anonymous F1-F7 onboarding flow remains the canonical product demo. This
change makes the signed-in wizard a short first-run companion to that model:
it names the same capabilities, points users back to the sandbox, and records
completion through the existing `onboardingState: "complete"` metadata.

## What Changes

- Replace generic scaffold step copy with GroundX Studio steps grounded in the
  wireframe model: Ingest, Understand, Extract, Interact/Report, and Integrate.
- Add optional per-step source-frame and launch-link metadata so the wizard can
  point to the canonical `/onboarding` sandbox without adding a new flow.
- Render the launch link inside the wizard as an honest user-driven navigation
  affordance, while keeping the existing wizard navigation tools and completion
  metadata intact.
- Add regression coverage proving first-time signed-in users no longer see
  starter-app copy and do see product-real GroundX onboarding copy.

## Out of Scope

- Redesigning or replacing the anonymous F1-F7 onboarding shell.
- Moving `OnboardingProvider` across router branches.
- Adding new persisted onboarding state beyond `onboardingState: "complete"`.
- Changing the existing `wizard_next`, `wizard_back`, `wizard_finish`, or
  `dismiss_wizard` tool contract.

## Affected Wireframes And Modules

- Wireframes: `openspec/wireframes/source/spec-nav-v2.jsx` (`Canvas_Ingest`,
  `Canvas_Integrate`, `OnboardingStepStrip`) and
  `openspec/wireframes/source/spec-flow.jsx` (F3/F3a/F5/F6 capability path).
- App: `app/src/appConfig.ts`,
  `app/src/views/Onboarding/OnboardingWizard.tsx`,
  `app/src/views/Onboarding/OnboardingWizard.test.tsx`,
  `app/src/contexts/OnboardingContext/OnboardingProvider.test.tsx`.
- Specs: `ui-views`.

## Conformance To Core Architectural Decisions

- **Composable, not forked:** the signed-in wizard stays the existing wizard
  surface. This change varies data/copy and adds optional link metadata; it does
  not add a new onboarding flow or duplicate the F-series shell.
- **Done-able:** done is user-visible: a first-time signed-in user sees GroundX
  Studio onboarding content, can open the sandbox route, can dismiss, and can
  finish to persist completion.
- **One source of truth:** the capability sequence references the in-repo
  wireframes and the existing config object. No rival tracker or local copy of
  onboarding state is introduced.

## Risks

- The production router currently mounts `OnboardingProvider` only on the
  root/home branch. This change does not broaden that mount because doing so is
  a separate route-composition decision.
- A launch link to `/onboarding` is intentionally a route into the canonical
  sandbox, not a second signed-in onboarding state machine.
