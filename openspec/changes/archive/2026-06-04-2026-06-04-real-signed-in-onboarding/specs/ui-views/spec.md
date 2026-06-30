## ADDED Requirements

### Requirement: Signed-in OnboardingWizard SHALL use GroundX Studio onboarding content

The signed-in `OnboardingWizard` SHALL orient first-time authenticated users to
GroundX Studio capabilities, not starter-app scaffold mechanics. Its default
steps SHALL map to the F-series product journey: Ingest, Understand, Extract,
Interact/Report, and Integrate. The wizard MAY cite source frames such as F1,
F2, F3/F3a, F5/F6, and F7, and MAY link to the canonical `/onboarding` sandbox,
but it SHALL NOT introduce a second onboarding state machine.

Source of truth: `openspec/wireframes/source/spec-nav-v2.jsx` for F1/F7 and the
step strip, plus `openspec/wireframes/source/spec-flow.jsx` for the F3/F3a/F5
capability path.

#### Scenario: First-time signed-in user sees product-real onboarding

- **GIVEN** a signed-in user whose app metadata does not include
  `onboardingState: "complete"`
- **WHEN** the signed-in `OnboardingWizard` opens
- **THEN** it renders GroundX Studio capability copy for the product journey
- **AND** it offers a user-driven link to `/onboarding`
- **AND** it does not render generic scaffold instructions such as replacing a
  starter Home page.

#### Scenario: Completion still uses the existing metadata state

- **GIVEN** the signed-in `OnboardingWizard` is on its final step
- **WHEN** the user clicks `Finish`
- **THEN** the app persists `{ onboardingState: "complete" }`
- **AND** the wizard closes without mutating anonymous F-series onboarding
  session state.
