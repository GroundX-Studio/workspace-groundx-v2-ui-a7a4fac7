/**
 * Scenario-shape drift guard — 2026-06-01-data-model-tail item 3.
 *
 * `ScenarioConfig` / `ScenarioManifest` / `ScenarioDocument` / `SampleDocFilter`
 * (and their constituents) were hand-mirrored between app `scenarios.ts` and
 * middleware `scenarios/types.ts` with NO drift test, and had already diverged
 * (`SampleDocFilter` was middleware-only). They are now single-sourced on
 * `@groundx/shared`; both files re-export the shared types.
 *
 * This file is the enforced guard: the compile-time `Eq<>` asserts below pin
 * each LOCAL (app) re-export to the canonical `@groundx/shared` type, so a
 * re-fork that replaces a re-export with a free-standing local interface that
 * renames/drops/widens a field fails the app build (`tsc` evaluates `Eq` to
 * `false`, and `Assert<false>` is a type error). The runtime test pins the
 * shared Zod schema to a representative fixture. The MIDDLEWARE side carries its
 * own mirror `Eq<>` pin inside the production `middleware/src/scenarios/types.ts`
 * (a `.test.ts` assert there would be dormant — the middleware tsconfig excludes
 * `*.test.ts`). The two pins together make app + middleware agree by construction.
 */
import { describe, expect, it } from "vitest";
import {
  sampleDocFilterSchema,
  scenarioConfigSchema,
  type ChatSeed as SharedChatSeed,
  type ExtractionSchemaDef as SharedExtractionSchemaDef,
  type SampleChatTurn as SharedSampleChatTurn,
  type SampleDocFilter as SharedSampleDocFilter,
  type SchemaCategoryDef as SharedSchemaCategoryDef,
  type SchemaFieldDef as SharedSchemaFieldDef,
  type ScenarioConfig as SharedScenarioConfig,
  type ScenarioDocument as SharedScenarioDocument,
  type ScenarioHero as SharedScenarioHero,
  type ScenarioManifest as SharedScenarioManifest,
} from "@groundx/shared";

import type {
  ChatSeed as AppChatSeed,
  ExtractionSchemaDef as AppExtractionSchemaDef,
  SampleChatTurn as AppSampleChatTurn,
  // RED-FIRST anchor: `SampleDocFilter` was middleware-only before this change;
  // importing it from the app barrel is a compile error until the app re-exports
  // the shared type. (Proves the test caught the divergence it was written for.)
  SampleDocFilter as AppSampleDocFilter,
  SchemaCategoryDef as AppSchemaCategoryDef,
  SchemaFieldDef as AppSchemaFieldDef,
  ScenarioConfig as AppScenarioConfig,
  ScenarioDocument as AppScenarioDocument,
  ScenarioHero as AppScenarioHero,
  ScenarioManifest as AppScenarioManifest,
} from "@/types/scenarios";

type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

// Each LOCAL (app) scenario type must be byte-identical to the canonical
// `@groundx/shared` type. A drifted re-fork flips the `Eq` to `false` → build error.
type _assertScenarioHero = Assert<Eq<AppScenarioHero, SharedScenarioHero>>;
type _assertSchemaFieldDef = Assert<Eq<AppSchemaFieldDef, SharedSchemaFieldDef>>;
type _assertSchemaCategoryDef = Assert<Eq<AppSchemaCategoryDef, SharedSchemaCategoryDef>>;
type _assertExtractionSchemaDef = Assert<Eq<AppExtractionSchemaDef, SharedExtractionSchemaDef>>;
type _assertChatSeed = Assert<Eq<AppChatSeed, SharedChatSeed>>;
type _assertSampleChatTurn = Assert<Eq<AppSampleChatTurn, SharedSampleChatTurn>>;
type _assertScenarioManifest = Assert<Eq<AppScenarioManifest, SharedScenarioManifest>>;
type _assertSampleDocFilter = Assert<Eq<AppSampleDocFilter, SharedSampleDocFilter>>;
type _assertScenarioDocument = Assert<Eq<AppScenarioDocument, SharedScenarioDocument>>;
type _assertScenarioConfig = Assert<Eq<AppScenarioConfig, SharedScenarioConfig>>;

describe("scenario fixture contract — single-sourced on @groundx/shared", () => {
  it("the shared scenarioConfig schema validates a representative fixture", () => {
    const fixture: SharedScenarioConfig = {
      id: "utility",
      order: 0,
      projectId: "proj_utility",
      supportsJsonRender: false,
      documents: [{ documentId: "doc-1", fileName: "bill.pdf", order: 0, pageCount: 2 }],
      manifest: {
        id: "utility",
        hero: {
          title: "Utility",
          shortDesc: "A utility bill",
          demonstrates: "Extract",
          badges: ["E", "I", "R"],
          chapters: { extract: "live", interact: "live", report: "off" },
          docCount: "1 doc",
        },
        thinkingScript: ["reading the bill"],
        extractionSchema: {
          id: "sch-1",
          name: "Utility schema",
          categories: [
            {
              id: "cat-1",
              type: "statement",
              name: "Statement",
              fields: [{ id: "f1", name: "Total", type: "NUMBER", description: "the total" }],
            },
          ],
        },
        chatSeeds: [{ id: "s1", prompt: "How much?", rationale: "demo" }],
      },
    };
    const parsed = scenarioConfigSchema.safeParse(fixture);
    expect(parsed.success).toBe(true);
  });

  it("the shared sampleDocFilter schema validates the seed→read contract shape", () => {
    const parsed = sampleDocFilterSchema.safeParse({
      kind: "sample-doc",
      scenarioId: "utility",
      scenarioOrder: 0,
      scenarioRole: "doc",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a sample-doc filter whose role drifts from the literal contract", () => {
    const parsed = sampleDocFilterSchema.safeParse({
      kind: "sample-doc",
      scenarioId: "utility",
      scenarioOrder: 0,
      scenarioRole: "primary",
    });
    expect(parsed.success).toBe(false);
  });
});
