# Spec Delta — onboarding-schema-editor

## MODIFIED Requirements

### Requirement: F3a SHALL be entered from F3's fields-panel hamburger menu

F3a SHALL be entered only by clicking the hamburger icon on the F3
fields panel and selecting `Save schema…` or `Edit schema…`. F3a is
not a top-level step-strip frame and SHALL NOT appear in nav as a peer
to F3. The step strip's Analyze · Extract pill SHALL remain active.

The `edit-schema` view picker pill in F2's post-ThinkingStream view
picker SHALL be removed; F2's pick-a-view affordance is for category
selection within Extract (statement / meters / charges), not for
launching the editor.

#### Scenario: User opens F3a from F3 hamburger

- **GIVEN** the user is on F3 with `utility-bill` selected
- **WHEN** the user opens the fields-panel hamburger and clicks `Edit schema…`
- **THEN** F3a mounts in the canvas pane
- **AND** the step strip continues to show Analyze · Extract active
- **AND** the F3 fields panel is replaced by the schema editor body

#### Scenario: F2 view picker no longer offers Edit schema

- **GIVEN** F2 just completed its ThinkingStream
- **WHEN** the user sees the "Pick a view:" bubble
- **THEN** the pill row SHALL contain only category-scope pills (e.g. `statement`, `meters`, `charges`) plus `interact`
- **AND** SHALL NOT contain an `edit schema` pill
