# Tasks — SchemaView live-only extract (retire the manifest arm)

## 1. Provide a live extraction under MOCK_MODE

- [ ] Write failing test: with MOCK_MODE active, the surfaces that mount `<SchemaView />` without live
  props (demo scenarios + the ProposeSchemaFieldCard round-trip) receive a live extraction
  schema/values from the MOCK_MODE fixture path (not the manifest).
- [ ] Implement: source the live extract under MOCK_MODE from the same fixture path the Extract widget
  uses for live extract, keyed by scenario/scope, so `<SchemaView />` has a genuine live source.
- [ ] Adversarial review: confirm the fixture is real data flowing through the live prop path, not a
  re-label of `scenario.manifest.*`; confirm no test was retargeted to pass over a real gap.

## 2. Retire the manifest arm (SEQUENTIAL — after task 1)

- [ ] Write failing test in `SchemaView.test.tsx`: when there is NO live schema/values, `SchemaView`
  surfaces the real empty/error ("live extract unavailable") state and does NOT fall back to
  `scenario.manifest.extractionSchema` / `sampleExtractionValues`; `data-extraction-status` reflects the
  live state, not `"manifest"`.
- [ ] Implement: in `SchemaView.tsx` drop the `?? scenario?.manifest.extractionSchema` /
  `?? scenario?.manifest.sampleExtractionValues` arms; read live only; render the empty/error branch when
  live is absent; default `data-extraction-status` off the live extraction state, not `"manifest"`.
- [ ] Adversarial review: grep `SchemaView.tsx` confirms NO remaining `manifest.extractionSchema` /
  `manifest.sampleExtractionValues` read and no `?? "manifest"` default; the Extract widget + Intro
  `derivePickViews` fallbacks are UNTOUCHED (out of scope); the ProposeSchemaFieldCard round-trip is
  green on the task-1 live extract, not a weakened assertion.

## 3. Closeout

- [ ] `openspec validate 2026-05-31-schemaview-live-only-extract --strict` passes.
- [ ] Full app test suite + `npm run build` + drift guards green; the
  `2026-05-31-onboarding-experiences` deferral pointer to this change is resolved (comment in
  `SchemaView.tsx` updated/removed).
