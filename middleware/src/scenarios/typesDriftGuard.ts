/**
 * Scenario-shape drift guard (middleware side) — 2026-06-01-data-model-tail item 3.
 *
 * The scenario shapes are single-sourced on `@groundx/shared` and re-exported by
 * `./types.ts`. This file pins THIS module's own barrel exports (imported via
 * `./types.js`) to the canonical `@groundx/shared` types with compile-time `Eq<>`
 * asserts. If someone re-forks `types.ts` by replacing a re-export with a
 * free-standing local `interface ScenarioConfig {…}` that renames/drops/widens a
 * field, the imported `Local*` symbol resolves to that re-fork, the `Eq` flips to
 * `false`, and `Assert<false>` is a `tsc` error — the build fails.
 *
 * It is a PRODUCTION file (not a test file) on purpose: the middleware
 * tsconfig excludes the test-file glob, so the same assert in a test file
 * would be invisible to `tsc`. The app mirror lives in
 * `app/src/types/scenarios.drift.test.ts` (the app tsconfig includes test files).
 * Type-only — emits nothing at runtime. The `Eq<>` precedent is
 * `app/src/api/chatSessions.test.ts:58`.
 */
import type {
  ChatSeed as SharedChatSeed,
  ExtractionSchemaDef as SharedExtractionSchemaDef,
  SampleChatTurn as SharedSampleChatTurn,
  SampleDocFilter as SharedSampleDocFilter,
  SchemaCategoryDef as SharedSchemaCategoryDef,
  SchemaFieldDef as SharedSchemaFieldDef,
  ScenarioConfig as SharedScenarioConfig,
  ScenarioDocument as SharedScenarioDocument,
  ScenarioHero as SharedScenarioHero,
  ScenarioManifest as SharedScenarioManifest,
} from "@groundx/shared";

import type {
  ChatSeed as LocalChatSeed,
  ExtractionSchemaDef as LocalExtractionSchemaDef,
  SampleChatTurn as LocalSampleChatTurn,
  SampleDocFilter as LocalSampleDocFilter,
  SchemaCategoryDef as LocalSchemaCategoryDef,
  SchemaFieldDef as LocalSchemaFieldDef,
  ScenarioConfig as LocalScenarioConfig,
  ScenarioDocument as LocalScenarioDocument,
  ScenarioHero as LocalScenarioHero,
  ScenarioManifest as LocalScenarioManifest,
} from "./types.js";

type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

type _assertScenarioHero = Assert<Eq<LocalScenarioHero, SharedScenarioHero>>;
type _assertSchemaFieldDef = Assert<Eq<LocalSchemaFieldDef, SharedSchemaFieldDef>>;
type _assertSchemaCategoryDef = Assert<Eq<LocalSchemaCategoryDef, SharedSchemaCategoryDef>>;
type _assertExtractionSchemaDef = Assert<Eq<LocalExtractionSchemaDef, SharedExtractionSchemaDef>>;
type _assertChatSeed = Assert<Eq<LocalChatSeed, SharedChatSeed>>;
type _assertSampleChatTurn = Assert<Eq<LocalSampleChatTurn, SharedSampleChatTurn>>;
type _assertScenarioManifest = Assert<Eq<LocalScenarioManifest, SharedScenarioManifest>>;
type _assertSampleDocFilter = Assert<Eq<LocalSampleDocFilter, SharedSampleDocFilter>>;
type _assertScenarioDocument = Assert<Eq<LocalScenarioDocument, SharedScenarioDocument>>;
type _assertScenarioConfig = Assert<Eq<LocalScenarioConfig, SharedScenarioConfig>>;

export {};
