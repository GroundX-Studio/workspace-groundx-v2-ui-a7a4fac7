# Proposal — SchemaView reads the live extract as its sole source (retire the manifest arm)

## Why

`SchemaView` (`components/viewer-widgets/Extract/SchemaView.tsx`) still reads
`liveSchema ?? scenario?.manifest.extractionSchema` and
`liveValues ?? scenario?.manifest.sampleExtractionValues`, and defaults
`data-extraction-status` to the literal `"manifest"` when there is no live extraction. The `manifest`
arm is a transitional fallback that masks a real "live extract failed / unavailable" state behind stale
fixture data, so the displayed schema/values can silently diverge from what GroundX actually extracted.

This retirement was originally scoped into `2026-05-31-onboarding-experiences` (What-Changes #6) but was
DEFERRED out of that change because removing the arm is breaking under MOCK_MODE today: SchemaView's own
unit tests and the ProposeSchemaFieldCard round-trip mount `<SchemaView />` with NO live props and rely
on the manifest arm to render, and MOCK_MODE provides no live extract to substitute. The durable SHALL
requirement was removed from that change's `conversation-flow` spec delta and relocated here so the spec
never claims behavior the code does not have. This change does the prerequisite work (provide a live
extract under MOCK_MODE) and only then retires the arm — failing-test-first.

## What Changes

1. **Provide a live extraction schema/values under MOCK_MODE** for the surfaces that mount
   `<SchemaView />` without live props (the demo scenarios + the ProposeSchemaFieldCard round-trip), so
   live is a genuine source rather than always-absent. Source it from the same MOCK_MODE fixture path the
   Extract widget already uses for live extract, keyed by scenario/scope.
2. **Retire the `?? scenario?.manifest.*` arms** in `SchemaView.tsx`: read the live schema/values only.
   When live data is absent, render the real empty/error ("live extract unavailable") state instead of
   stale manifest fixtures.
3. **Default `data-extraction-status` off the live extraction state**, not the literal `"manifest"`.
4. **Update the SchemaView + ProposeSchemaFieldCard tests** to the live path (no test is retargeted to
   pass over a real failure; the round-trip is re-grounded on the MOCK_MODE live extract from step 1).

### Out of scope

- The `Extract` widget's and onboarding Intro's `derivePickViews` `liveSchema ?? manifest` fallbacks —
  those serve the onboarding journey where the manifest is a legitimate pre-live placeholder. Track
  separately if they prove dead.

## Conformance to core architectural decisions

- **One source of truth** — collapses SchemaView's second (manifest) live-data source so live extract is
  the single source for the rendered schema/values.
- **TDD** — the failing test (no live data → real empty/error state, no manifest read) is written and
  watched fail BEFORE the arm is removed; the MOCK_MODE live-extract fixture (step 1) is what makes the
  existing round-trip tests pass without weakening them.
- **No shortcuts / no dormant plumbing** — this is the tracked home for the deferral noted in
  `2026-05-31-onboarding-experiences`; the work is real and separately validatable, not a spec-only stub.

## Affected

- App: `components/viewer-widgets/Extract/SchemaView.tsx` (drop the manifest arms; live-only;
  `data-extraction-status` off live state); the MOCK_MODE live-extract fixture/source feeding
  `<SchemaView />`; `SchemaView.test.tsx` + the `ProposeSchemaFieldCard` round-trip test.
- Specs: `onboarding-schema-editor` (the live-only-source requirement).
