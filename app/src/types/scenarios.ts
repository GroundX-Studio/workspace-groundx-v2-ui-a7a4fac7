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

export interface ScenarioCitation {
  documentId: string;
  page: number;
  bbox?: { x: number; y: number; w: number; h: number };
  snippet?: string;
  confidence?: number;
}

export interface ExtractedFieldValue {
  fieldId: string;
  value: string | number | boolean | null;
  citations: ScenarioCitation[];
}

export interface SampleChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ScenarioCitation[];
}

export interface ScenarioManifest {
  id: string;
  hero: ScenarioHero;
  thinkingScript: string[];
  /** Absent → scenario skips the Extract frame (e.g. Solar is Interact+Report only). */
  extractionSchema?: ExtractionSchemaDef;
  chatSeeds: ChatSeed[];
  /** Pre-canned extraction results for the demo flow. */
  sampleExtractionValues?: ExtractedFieldValue[];
  /** Pre-canned chat transcript for the demo flow. */
  sampleChatScript?: SampleChatTurn[];
}

export interface ScenarioDocument {
  documentId: string;
  fileName: string;
  pageCount?: number;
  order: number;
  /**
   * Optional same-origin URL for the document binary. When present, the
   * F2 PdfViewer (UR-01) loads + renders it via pdfjs-dist. When absent,
   * UnderstandView falls back to the silhouette placeholder. SCEN-06 will
   * deliver the real Utility/Loan/Solar PDFs and surface URLs here.
   */
  previewUrl?: string;
}

export interface ScenarioConfig {
  id: string;
  order: number;
  manifest: ScenarioManifest;
  documents: ScenarioDocument[];
}
