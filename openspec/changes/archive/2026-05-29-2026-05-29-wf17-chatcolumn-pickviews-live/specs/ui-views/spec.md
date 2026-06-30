# Spec Delta — ui-views

## ADDED Requirements

### Requirement: F2 pick-view pills SHALL derive categories from the live schema

The F2 "pick a view" category pills SHALL derive their categories from the live schema source, not
`scenario.manifest.extractionSchema`. After the manifest fixtures are stripped, the category pills
(e.g. Statement / Meters / Charges) MUST still render — sourced from the live workflow schema via a
shared slot the workbench populates — so the chat surface and the extract workbench agree on the
same categories.

#### Scenario: Pick-view pills survive the manifest strip

- **GIVEN** a scenario whose manifest no longer carries `extractionSchema`
- **WHEN** the F2 pick-a-view bubble renders
- **THEN** the category pills are derived from the live workflow schema
- **AND** they are not reduced to only the "interact" pill.
