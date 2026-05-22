/**
 * Sample scenario types. The contract between the bucket (source of truth)
 * and the frontend (consumer) lives here. Every document in the samples
 * bucket carries a `filter` object whose `kind === "sample-doc"`; on the
 * first doc per scenario the filter also carries a `manifest` blob holding
 * the full ScenarioConfig. Subsequent docs in the same scenarioId carry a
 * slim filter (no manifest).
 *
 * Keep this file byte-identical with app/src/types/scenarios.ts. They live
 * in separate packages because there is no shared workspace; if the shape
 * drifts the runtime will silently degrade.
 */

export interface ScenarioHero {
  title: string;
  shortDesc: string;
  demonstrates: string;
  badges: Array<"E" | "I" | "R">;
  chapters: { extract: "live" | "off"; interact: "live" | "off"; report: "live" | "off" };
  docCount: string;
}

export interface SchemaFieldDef {
  id: string;
  name: string;
  type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN";
  description: string;
}

export interface SchemaCategoryDef {
  id: string;
  type: "statement" | "charges" | "meters";
  name: string;
  fields: SchemaFieldDef[];
}

export interface ExtractionSchemaDef {
  id: string;
  name: string;
  categories: SchemaCategoryDef[];
}

export interface ChatSeed {
  id: string;
  prompt: string;
  rationale: string;
}

export interface ScenarioManifest {
  id: string;
  hero: ScenarioHero;
  thinkingScript: string[];
  extractionSchema: ExtractionSchemaDef;
  chatSeeds: ChatSeed[];
}

/** What gets stored in every sample doc's filter. */
export interface SampleDocFilter {
  kind: "sample-doc";
  scenarioId: string;
  scenarioOrder: number;
  scenarioRole: "doc";
  /** Present only on the first doc per scenarioId. */
  manifest?: ScenarioManifest;
}

/** ScenarioConfig is what the frontend consumes. */
export interface ScenarioConfig {
  id: string;
  order: number;
  manifest: ScenarioManifest;
  documents: ScenarioDocument[];
}

export interface ScenarioDocument {
  documentId: string;
  fileName: string;
  pageCount?: number;
  order: number;
}
