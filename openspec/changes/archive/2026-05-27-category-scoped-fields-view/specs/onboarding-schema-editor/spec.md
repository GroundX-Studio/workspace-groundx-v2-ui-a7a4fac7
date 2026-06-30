# Spec Delta — onboarding-schema-editor

## MODIFIED Requirements

### Requirement: Fields tab SHALL render existing fields above proposed fields

The Fields tab body SHALL:

- Render only fields belonging to the **focused category** (driven by
  `pendingSchemaOverlay.focusedCategoryId`) as a flat list.
- Group as two sections in this order:
  1. Header: `Existing fields · <N> accepted`, with an optional
     `● <M> unsaved` coral indicator when the overlay has uncommitted
     changes affecting this category.
  2. The list of accepted fields in the focused category (in
     manifest order, additions appended at end).
  3. When `K > 0` proposals exist for this category:
     `Proposed fields · <K> from the latest agent turn` header
     followed by the ProposalCard list.
- Proposals appearing in chat that have not been resolved SHALL also
  surface in this list (chat is a mirror; the canvas is where the user
  acts).

When `focusedCategoryId` is null (defensive fallback), the body SHALL
fall back to the existing per-category multi-section render.

#### Scenario: Fields tab scoped to meters

- **GIVEN** F3a with `focusedCategoryId === "meters"`
- **AND** the utility schema has 2 meters fields and 5 statement fields
- **WHEN** the Fields tab body renders
- **THEN** only the 2 meters fields appear
- **AND** the header reads `Existing fields · 2 accepted`
- **AND** no statement fields are visible
