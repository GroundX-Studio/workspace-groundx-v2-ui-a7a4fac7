/**
 * Sample scenario types. The contract between the bucket (source of truth)
 * and the frontend (consumer) lives here. Every document in the samples
 * bucket carries a `filter` object whose `kind === "sample-doc"`; on the
 * first doc per scenario the filter also carries a `manifest` blob holding
 * the full ScenarioConfig. Subsequent docs in the same scenarioId carry a
 * slim filter (no manifest).
 *
 * Keep these shapes in sync with app/src/types/scenarios.ts. Citations use the
 * shared `Citation` (`@groundx/shared`) directly (no `ScenarioCitation` alias);
 * the remaining scenario shapes are still hand-mirrored between the two files —
 * folding them into `@groundx/shared` is a tracked task in the
 * `core-data-model-hardening` change. Until then, if a mirrored shape drifts the
 * runtime degrades silently.
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
  type: TemplateFieldType;
  description: string;
  /** F3a required-toggle; defaults to false for pre-editor fixtures. */
  required?: boolean;
  /** F3a "instructions per line" — extra constraints for the focused extractor. */
  instructions?: string[];
  /** F3a "format (opt)" — free-text hint for post-extraction shape. */
  format?: string;
  /** F3a "identifiers" — short aliases or labels near the field. */
  identifiers?: string[];
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

// A scenario fixture citation is the shared `Citation` (`@groundx/shared`).
// (The shared shape adds optional `tier`/`answerSpan` — harmless supersets;
// fixtures that omit them still conform.) Used directly as `Citation` (no alias).
// `ExtractedFieldValue` is the shared generated-result shape (Extract
// specialization): `{fieldId, value, citations}` + the shared
// `confidence`/`warnings`.
import type { Citation, ExtractedFieldValue, TemplateFieldType } from "@groundx/shared";

export type { Citation, ExtractedFieldValue };

export interface SampleChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

export interface ScenarioManifest {
  id: string;
  hero: ScenarioHero;
  thinkingScript: string[];
  /** Absent → scenario skips the Extract frame. */
  extractionSchema?: ExtractionSchemaDef;
  chatSeeds: ChatSeed[];
  /** Pre-canned extraction results for the demo flow. */
  sampleExtractionValues?: ExtractedFieldValue[];
  /** Pre-canned chat transcript for the demo flow. */
  sampleChatScript?: SampleChatTurn[];
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
  /**
   * Optional same-origin URL for the document binary. When present the
   * frontend F2 PdfViewer loads + renders it via pdfjs-dist. SCEN-06 will
   * deliver the real Utility/Loan/Solar PDFs and surface URLs here.
   */
  previewUrl?: string;
}
