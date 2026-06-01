# template-lifecycle (delta)

## ADDED Requirements

### Requirement: Extract field values and report sections SHALL derive from one shared generated-result type with a compile-time drift guard

Extract field values (`ExtractedFieldValue`) and report sections (`RenderedSection`) SHALL be
specializations of ONE shared generated-result type in `@groundx/shared` — `GeneratedResult` =
a generated `body` + the shared `citations[]` + optional `confidence` + optional `warnings` — so the
citation/confidence/warning contract is single-sourced and cannot drift between Extract and Report.
View-specific fields SHALL be layered ON TOP of (not merged into) the shared core: Extract adds
`fieldId` and the scalar field `value` (the persisted body alias); Report adds `sectionId` and a
markdown-string body. The derivation SHALL be enforced by a compile-time `Eq<>` drift assert on each
side that is load-bearing under `npm run build` (tsc) — re-forking either specialization away from the
shared core fails the build, not merely a runtime test. The shared boundary sanitizer
`parseGeneratedResult` (parallel to `parseCitations`/`parseTemplate`) SHALL remain the single
untrusted-input gate. The change SHALL be behavior-preserving: Extract field values render
identically and existing `{ fieldId, value, citations }` fixtures round-trip unchanged.

#### Scenario: Both specializations are pinned to the shared core at compile time

- **GIVEN** the shared `GeneratedResult` and its `ExtractedFieldValue` / `RenderedSection` specializations
- **WHEN** a consumer re-forks either specialization's body/citations/confidence/warnings core away from the shared type
- **THEN** the `Eq<>` drift assert evaluates `false`, `Assert<false>` fails, and `npm run build` (tsc) errors
- **AND** with the specializations correctly derived from the shared core, the build and the runtime parse suite both pass.

#### Scenario: Legacy Extract fixtures round-trip unchanged

- **GIVEN** an existing `{ fieldId, value, citations }` Extract fixture
- **WHEN** it is parsed via the shared `extractedFieldValueSchema` / `parseGeneratedResult`
- **THEN** it validates with `value` as the persisted body alias and the shared citation contract
- **AND** the rendered Extract field value is unchanged from before the guard was added.
