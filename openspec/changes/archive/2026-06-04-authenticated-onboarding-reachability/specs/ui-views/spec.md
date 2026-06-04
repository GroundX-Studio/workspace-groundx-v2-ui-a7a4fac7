## ADDED Requirements

### Requirement: Authenticated OnboardingWizard SHALL be reachable across signed-in product routes

The signed-in `OnboardingWizard` SHALL be mounted so first-time authenticated
users whose app metadata does not include `onboardingState: "complete"` can see
it on signed-in product surfaces, not only on `/home`. Public `/onboarding`
SHALL remain route-owned and SHALL NOT perform an anonymous auth probe on cold
loads; it MAY show the signed-in wizard only when auth state is already hydrated
by in-app navigation. The wizard SHALL remain gated by `auth.isLoggedIn`, a
loaded user, and incomplete onboarding metadata. Anonymous users SHALL NOT see
this signed-in wizard.

#### Scenario: First-time signed-in user sees the wizard on product routes

- **GIVEN** a signed-in user whose app metadata does not include
  `onboardingState: "complete"`
- **WHEN** the user opens `/projects`, `/workspaces`, or `/c/:sessionId`
- **THEN** the signed-in `OnboardingWizard` opens
- **AND** the page remains on the requested route.

#### Scenario: Public onboarding stays anonymous on cold loads

- **GIVEN** a user opens `/onboarding` without a hydrated authenticated app
  state
- **WHEN** the public onboarding sandbox renders
- **THEN** the app does not redirect to `/auth/login`
- **AND** the signed-in `OnboardingWizard` is not shown
- **AND** the route does not perform an `/api/auth/me` probe.

#### Scenario: Completed or anonymous users do not see the signed-in wizard

- **GIVEN** a user is anonymous, or signed-in with `onboardingState: "complete"`
- **WHEN** the user opens any product route
- **THEN** the signed-in `OnboardingWizard` is not shown.

### Requirement: Authenticated OnboardingWizard SHALL explain the signed-in Studio experience

The signed-in `OnboardingWizard` SHALL orient first-time authenticated users to
what they can do inside authenticated GroundX Studio using product judgment,
because the post-signup experience is not mocked in the wireframes. Its default
steps SHALL mention existing authenticated surfaces and capabilities, including
saved conversations or current sessions, Workspaces, Projects, the canonical
onboarding sandbox, grounded extraction/report/chat outputs, and Integrate/API
or plugin handoff. It SHALL NOT claim to implement a wireframed post-signup
workspace setup flow.

#### Scenario: Wizard copy describes authenticated destinations

- **GIVEN** the signed-in `OnboardingWizard` opens for a first-time authenticated
  user
- **WHEN** the user reads the default steps
- **THEN** the wizard names existing authenticated Studio destinations such as
  Workspaces, Projects, saved sessions, the onboarding sandbox, and Integrate
- **AND** it does not render generic scaffold instructions
- **AND** it does not reference a mocked post-signup workspace setup flow.

#### Scenario: Completion remains app metadata only

- **GIVEN** the signed-in `OnboardingWizard` is on its final step
- **WHEN** the user clicks `Finish`
- **THEN** the app persists `{ onboardingState: "complete" }`
- **AND** the wizard closes without mutating anonymous F-series onboarding
  session state.
