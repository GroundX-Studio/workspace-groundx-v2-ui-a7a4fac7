# Spec Delta — onboarding-schema-editor (SchemaView reads the live extract as its sole source)

Retires `SchemaView`'s transitional `live ?? manifest` fallback so the rendered schema/values come only
from the live extraction. Deferred out of `2026-05-31-onboarding-experiences` (breaking under MOCK_MODE
until a live extract is provided there); this change provides that live extract first, then retires the
arm.

## ADDED Requirements

### Requirement: SchemaView SHALL read the live extract as its sole source

`SchemaView` SHALL render from the live extraction schema/values only; it SHALL NOT fall back to
`scenario.manifest.extractionSchema` or `scenario.manifest.sampleExtractionValues`. When live data is
absent, `SchemaView` SHALL surface the real empty/error ("live extract unavailable") state rather than
stale manifest fixtures, and its `data-extraction-status` SHALL reflect the live extraction state, not a
`"manifest"` default. Under MOCK_MODE the live extract SHALL be supplied from the MOCK_MODE fixture path
(the same source the Extract widget uses), so the surfaces that mount `<SchemaView />` without explicit
live props still have a genuine live source.

#### Scenario: No live data surfaces the real state, not the manifest

- **GIVEN** a scenario whose live extraction schema/values are unavailable
- **WHEN** `SchemaView` renders
- **THEN** it shows the empty/error ("live extract unavailable") state
- **AND** it does NOT read `scenario.manifest.extractionSchema` or `scenario.manifest.sampleExtractionValues`
- **AND** `data-extraction-status` reflects the live extraction state rather than `"manifest"`.

#### Scenario: MOCK_MODE supplies the live extract to the demo surfaces

- **GIVEN** MOCK_MODE is active and a demo scenario mounts `<SchemaView />` without explicit live props
- **WHEN** `SchemaView` renders
- **THEN** it renders the live schema/values sourced from the MOCK_MODE fixture path
- **AND** it does not read `scenario.manifest.*` to populate the schema/values.
