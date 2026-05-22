/**
 * Scenario types — frontend mirror of middleware/src/scenarios/types.ts.
 * Keep byte-identical with the middleware definitions; the two files exist
 * because there is no shared workspace.
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

export interface ScenarioDocument {
  documentId: string;
  fileName: string;
  pageCount?: number;
  order: number;
}

export interface ScenarioConfig {
  id: string;
  order: number;
  manifest: ScenarioManifest;
  documents: ScenarioDocument[];
}
