# Spec Delta — onboarding-schema-editor

## MODIFIED Requirements

### Requirement: Save SHALL gate on sign-in and pre-attach the schema on F1 return

Save while anonymous SHALL open the F6 sign-in gate inline in chat with
the overlay preserved. The flow MUST proceed as follows when the user
clicks `💾 Save` while anonymous on F3a:

1. The sign-in gate (F6) SHALL open **inline in chat** with the
   preamble `Sign in to save this schema` AND the overlay state
   preserved.
2. On successful sign-in (gate transitions `open → committed → done`
   with a `cause` of `save-schema`), the scaffold SHALL persist the
   schema via `POST /api/extraction-schemas` against the
   newly-authenticated session.
3. On persist success, the scaffold SHALL:
   a. Set `OnboardingSessionContext.preAttachedSchemaId` to the
      returned schema id.
   b. `advanceFrame("f1")` so the user lands on the Ingest surface.
4. F1's ingest picker SHALL read `preAttachedSchemaId` and pre-select
   the matching schema in the picker UI.

When the user is already signed in on Save, the scaffold SHALL persist
immediately without opening F6 (current happy-path behavior).

#### Scenario: Anonymous user saves a custom schema and lands on F1 with it attached

- **GIVEN** anonymous user on F3a with `utility-bill` and overlay
  diff `(2 added, 1 edited)`
- **WHEN** the user clicks `💾 Save 🔒`
- **THEN** F6 opens inline with preamble `Sign in to save this schema`
- **AND** the overlay diff is preserved
- **AND** the user completes sign-in (magic-link or SSO)
- **AND** the schema persists via `POST /api/extraction-schemas` with
  name `utility-bill (custom)` and merged overlay
- **AND** `OnboardingSessionContext.preAttachedSchemaId` becomes the
  returned schema id
- **AND** the canvas advances to F1
- **AND** F1's picker pre-selects the saved schema as the default

#### Scenario: Signed-in user saves without opening the gate

- **GIVEN** a signed-in user on F3a with overlay changes
- **WHEN** the user clicks `💾 Save`
- **THEN** the gate SHALL NOT open
- **AND** the schema persists immediately
- **AND** the topbar status briefly shows `Saving… → Saved.`
- **AND** the user remains on F3a (no F1 handoff for already-authed)
