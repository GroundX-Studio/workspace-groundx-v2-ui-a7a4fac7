# Spec Delta — app-architecture

Migrated from `backlog.md` Epic ARCH (active rows only). Closed rows
(ARCH-01..09, 11, 13..22, 24) are dropped — git history is the record.

## ADDED Requirements

### Requirement: F3-F7 production-widget collapse SHALL reduce each view to ≤20 LOC of logic

ExtractView, InteractView, and IntegrateView SHALL each be reduced to
the same `≤20 LOC logic body` shape that UnderstandView already meets,
once their respective production widgets ship (UI-01, UI-05, UI-02).
Until those widgets land, this requirement remains in partial state.

#### Scenario: View collapse closure check

- **WHEN** the production widget for a view (e.g. UI-02 for IntegrateView) ships
- **THEN** the view's `.tsx` body SHALL be reduced to ≤20 LOC of logic, with everything else delegated to the widget
- **AND** `grep -c '^' views/Onboarding/<View>.tsx` (post-collapse) confirms the bound

### Requirement: Onboarding overlay SHALL animate out on sign-up commit

When the user completes sign-up, the StepStrip SHALL slide out with a
motion-config-respecting transition AND the canvas header slot SHALL
empty, transitioning the user into the standard product surface.

#### Scenario: Graduation animation

- **GIVEN** the user finishes sign-up via the F6 gate
- **WHEN** the gate transitions to `committed`
- **THEN** StepStrip animates out (or instant when `prefers-reduced-motion: reduce`)
- **AND** the canvas-header slot empties on the next render

### Requirement: views/Auth/ SHALL be audited and dead pages deleted

The `scaffold/app/src/views/Auth/` directory SHALL be audited after
AU-01 / AU-02 ship. The existing
directory (Login, Register, ForgotPassword, ResetPassword, AuthLayout,
Form) SHALL be audited; dead pages SHALL be deleted and load-bearing
pages SHALL be documented in `widget-contract.md` § views.

#### Scenario: Audit dead Auth pages

- **WHEN** AU-01 (magic-link) and AU-02 (SSO) ship
- **THEN** each `/auth/*` page is either documented (route + caller) or removed
- **AND** `widget-contract.md` § views table lists the survivors

### Requirement: contexts/ SHALL be audited and dead contexts deleted

The 18 contexts under `scaffold/app/src/contexts/` SHALL each be
audited after UI-05 follow-on work lands: the 8 scaffold-
default Partner-API state holders that the product doesn't use SHALL
be deleted; the rest SHALL be annotated with their consumer.

#### Scenario: Context audit closure

- **WHEN** UI-05 SteadyShell work continues into context cleanup
- **THEN** every context directory either has a documented consumer in
  the widget-contract table OR is deleted
- **AND** no unused context provider mounts in the App tree
