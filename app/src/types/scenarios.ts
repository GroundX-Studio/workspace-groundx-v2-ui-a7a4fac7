/**
 * Scenario types — frontend mirror of middleware/src/scenarios/types.ts.
 * Keep these in sync with the middleware definitions. Citations use the shared
 * `Citation` (`@groundx/shared`) directly; the remaining scenario shapes are
 * still hand-mirrored — folding them into `@groundx/shared` is a tracked task
 * in the `core-data-model-hardening` change.
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
  /**
   * Field-level extraction prompt — the natural-language guidance the
   * focused LLM extractor uses to find this field's value in the
   * document. In the F3a inline editor, this is the textarea labelled
   * "Extraction prompt".
   */
  description: string;
  /**
   * F3a required-toggle. Optional + defaults to false so manifest
   * fixtures that pre-date the editor stay valid.
   */
  required?: boolean;
  /**
   * F3a "instructions per line" textarea — extra constraints / hints
   * the focused extractor should respect. One string per logical
   * instruction; renders as a multi-line textarea joined by `\n`.
   */
  instructions?: string[];
  /**
   * F3a "format (opt)" — free-text hint for post-extraction shape
   * (e.g. `float · kW`, `ISO 8601`, `XX-XXXXXXX`). Treated as a hint
   * for the focused extractor; not enforced as a parse rule today.
   */
  format?: string;
  /**
   * F3a "identifiers" — short aliases or labels found near the field
   * in the source doc (e.g. "Account No.", "Acct #") that help the
   * focused extractor anchor on the value. Editable in the inline
   * editor as a chip array; persisted via overlay `editedFields`.
   */
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

// A scenario fixture citation IS the shared `Citation` (`@groundx/shared`) —
// used directly (no `ScenarioCitation` alias).
import type { Citation } from "@groundx/shared";

export interface ExtractedFieldValue {
  fieldId: string;
  value: string | number | boolean | null;
  citations: Citation[];
}

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
