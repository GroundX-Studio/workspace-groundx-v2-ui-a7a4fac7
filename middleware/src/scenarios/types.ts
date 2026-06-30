/**
 * Sample scenario types — single-sourced on `@groundx/shared`.
 *
 * The contract between the bucket (source of truth) and the frontend (consumer)
 * lives in `@groundx/shared`. Every document in the samples bucket carries a
 * `filter` object whose `kind === "sample-doc"`; on the first doc per scenario
 * the filter also carries a `manifest` blob holding the full `ScenarioConfig`.
 * Subsequent docs in the same scenarioId carry a slim filter (no manifest).
 *
 * `ScenarioConfig` / `ScenarioManifest` / `ScenarioDocument` / `SampleDocFilter`
 * (and their constituents) USED to be hand-mirrored between this file and
 * `app/src/types/scenarios.ts` with no drift test — and had diverged
 * (`SampleDocFilter` was middleware-only). They are now single-sourced and
 * re-exported here.
 *
 * Drift guard: this barrel's re-export is pinned to the canonical
 * `@groundx/shared` shapes by `./typesDriftGuard.ts` (a production-side file —
 * the middleware `tsconfig.json` EXCLUDES `*.test.ts`, so a test-file assert
 * would be dormant). The app side carries the mirror runtime + `Eq<>` guard in
 * `app/src/types/scenarios.drift.test.ts`. Together they make app + middleware
 * agree by construction; do not re-fork these shapes here — edit the schema in
 * `@groundx/shared`.
 *
 * Citations use the shared `Citation` directly (no `ScenarioCitation` alias);
 * `ExtractedFieldValue` is the shared generated-result shape (Extract spec).
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
