/**
 * Scenario types — single-sourced on `@groundx/shared`.
 *
 * `ScenarioConfig` / `ScenarioManifest` / `ScenarioDocument` / `SampleDocFilter`
 * (and their constituents `ScenarioHero` / `ExtractionSchemaDef` /
 * `SchemaCategoryDef` / `SchemaFieldDef` / `ChatSeed` / `SampleChatTurn`) used to
 * be hand-mirrored between this file and `middleware/src/scenarios/types.ts` with
 * NO drift test — and had already diverged (`SampleDocFilter` was middleware-only).
 * They ARE a cross-boundary contract (the middleware seed writes the `manifest`
 * blob into each sample doc's bucket `filter`; the app reads it back), so they now
 * live ONCE in `@groundx/shared` and both files re-export them.
 *
 * Drift guard: `app/src/types/scenarios.drift.test.ts` pins these app re-exports
 * to the shared types with compile-time `Eq<>` asserts (and the middleware file
 * carries its own mirror `Eq<>` pin in production code). Do not re-fork these
 * shapes here — edit the schema in `@groundx/shared`.
 *
 * Citations use the shared `Citation` directly; `ExtractedFieldValue` is the
 * shared generated-result shape (Extract specialization).
 */

export type {
  ChatSeed,
  Citation,
  ExtractedFieldValue,
  ExtractionSchemaDef,
  SampleChatTurn,
  SampleDocFilter,
  SchemaCategoryDef,
  SchemaFieldDef,
  ScenarioConfig,
  ScenarioDocument,
  ScenarioHero,
  ScenarioManifest,
} from "@groundx/shared";
