# Spec Delta — onboarding-schema-editor

## MODIFIED Requirements

### Requirement: Pinned-samples row SHALL render above the subseg tabs

The pinned-samples row SHALL render between the topbar and the subseg
tabs on the Design surface (F3a) and contain:

1. `PINNED <count>/3` eyebrow
2. One chip per pinned sample: `<filename> · <pages>p · ×`
3. `+ pin another sample` link (disabled when 3 pinned)
4. Right-aligned `category: <id>` badge — clicking opens a popover of
   the schema's category ids; selecting one updates the focused category

The row SHALL initialize with the active scenario's primary document
auto-pinned and the first schema category as the focused category
(unless an inbound `?focus=<id>` URL param specifies a different one).

The focused-category badge SHALL drive the Fields tab's scope: the
Fields tab body renders only fields belonging to the focused category.

#### Scenario: F3a entry with utility scenario auto-pins the bill

- **GIVEN** the user opens F3a from F3 with `utility-bill` selected
- **WHEN** the editor mounts
- **THEN** the pinned-samples row renders `PINNED 1/3`
- **AND** one chip is present: `utility-bill.pdf · 3p · ×`
- **AND** the right-aligned badge reads `category: meters` (the first category)

#### Scenario: User changes the focused category

- **GIVEN** F3a with `category: meters` active
- **WHEN** the user clicks the `category:` badge and selects `statement`
- **THEN** the badge updates to `category: statement`
- **AND** the topbar title block updates to `Designing utility-bill · statement`
- **AND** the Fields tab body re-renders with only the `statement` fields

#### Scenario: Anonymous user attempts to pin another sample

- **GIVEN** F3a in anonymous mode with 1 pinned sample
- **WHEN** the user clicks `+ pin another sample`
- **THEN** a disabled-state tooltip surfaces:
  `Sign in to load more samples`
- **AND** no new chip is added
