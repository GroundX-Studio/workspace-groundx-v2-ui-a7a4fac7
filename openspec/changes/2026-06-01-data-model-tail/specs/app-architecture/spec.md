# app-architecture (delta)

## ADDED Requirements

### Requirement: GroundX SDK and scenario shapes SHALL be validated or single-sourced

GroundX SDK response shapes and scenario configuration shapes SHALL NOT cross a
boundary via an `as unknown as` cast or live as an untested hand-mirrored twin.
Specifically: the live workflow → extraction-schema transform SHALL consume a
named workflow input type (not a `Record<string, unknown>` double-cast); the
`activeStepKind` wire value SHALL be validated against the shared
`viewerStepKindSchema` such that a present-but-invalid kind resolves to the
safe-minimum tool set (never the full or unrestricted-only catalog); the X-Ray
response type family SHALL be defined once in `@groundx/shared` and consumed by
both the app entity and the middleware geometry resolver; the
`getDocumentXray` SDK-boundary response SHALL be runtime-narrowed (or reduced to
a single documented guarded boundary) rather than blind-cast; the
`IngestProcess` / ingest-list shapes SHALL match the real endpoint payload with
the mutually-exclusive list keys collapsed at the reader; and the scenario
shapes (`ScenarioConfig`, `ScenarioDocument`, `ScenarioManifest`,
`SampleDocFilter`) SHALL be single-sourced onto `@groundx/shared` OR guarded by a
compile-time drift test (mirroring the `Eq<>` / widget-contract precedent), so
app↔middleware drift fails a guard instead of degrading the runtime silently.

#### Scenario: A GroundX SDK boundary is narrowed, not blind-cast

- **GIVEN** a GroundX SDK response consumed by the app (a workflow definition fed
  to `workflowToSchema`, or an X-Ray response from `getDocumentXray`)
- **WHEN** the value enters typed application code
- **THEN** it passes through a named type and/or a runtime parse that coerces or
  rejects a malformed payload
- **AND** no `as unknown as` cast is used to force the SDK shape into the app type.

#### Scenario: An invalid activeStepKind does not widen the tool surface

- **GIVEN** a chat request whose `activeStepKind` is a present-but-invalid string
- **WHEN** the RAG pipeline assembles the LLM tool catalog
- **THEN** the value is validated against `viewerStepKindSchema` and resolves to
  the safe-minimum tool set
- **AND** it does NOT fall through to the full catalog (the `undefined`/legacy
  behavior) nor to the wider unrestricted-only fall-through set.

#### Scenario: Scenario shapes cannot drift silently

- **GIVEN** the scenario shapes referenced by both `app/src/types/scenarios.ts`
  and `middleware/src/scenarios/types.ts`
- **WHEN** one side's shape diverges from the other
- **THEN** either both import the single `@groundx/shared` definition (so
  divergence is impossible) or a compile-time drift test fails on the divergence
- **AND** neither file's header relies on a prose-only "keep in sync" warning as
  the sole guard.

#### Scenario: The X-Ray type family has one source

- **GIVEN** the X-Ray response types used by the app entity
  (`groundxDocumentsEntity`) and the middleware geometry resolver
  (`citationGeometry`)
- **WHEN** both sides reference the X-Ray shape
- **THEN** both derive from the single `@groundx/shared` X-Ray type family rather
  than independent local declarations.
