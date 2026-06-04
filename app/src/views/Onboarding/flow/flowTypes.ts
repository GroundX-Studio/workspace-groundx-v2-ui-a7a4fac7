/**
 * Onboarding flow domain types.
 *
 * The chat-driven onboarding spec (Onboarding Spec · v1) walks a single linear
 * path P1 → P7: Ingest → Understand → Analyze (Extract / Interact / Report) →
 * Gate → Integrate. These types model that journey and the "Sample" projects a
 * user can pick on P1. See views/Onboarding for the screens that consume them.
 */

/** A frame in the linear onboarding journey. P1 is full-width ingest; P2+ are split. */
export type FlowStepId = "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P7";

/**
 * The journey phase surfaced in the step strip (W2). "extract" / "interact" /
 * "report" are the three doors inside the ANALYZE bracket.
 */
export type FlowPhase = "ingest" | "understand" | "extract" | "interact" | "report" | "integrate";

/**
 * The UI frame currently rendered. Derived from the step — the single value the
 * chat panel and canvas switch on, so neither has to re-derive "which frame am I
 * in" from step + selection. P4 and P5 share the "interact" phase but render as
 * distinct frames (peek vs compare).
 */
export type Frame = "ingest" | "understand" | "extract" | "peek" | "compare" | "gate" | "integrate";

/** Capability a sample demonstrates — Extract, Interact, Report. Hollow pill = not in this sample. */
export type Capability = "E" | "I" | "R";

/** How the split divides focus between the chat panel and the canvas. */
export type FocusMode = "split" | "chat" | "canvas";

/** A preloaded onboarding project the user can try with no sign-up. */
export interface SampleProject {
  /** Stable id, also used as the GroundX project slug. */
  id: string;
  /** Display name, e.g. "Utility Bill". */
  name: string;
  /** One-line description of what the bundle contains. */
  blurb: string;
  /** Pill label for document count, e.g. "1 doc" / "142 docs". */
  docLabel: string;
  /** Footer tagline, e.g. "messy layout → clean extraction". */
  outcome: string;
  /** Which capabilities this sample demonstrates; the rest render hollow. */
  capabilities: Capability[];
  /** Marks the canonical demo with a "★ start here" tag. */
  startHere?: boolean;
}

/** The three categories the runner recognises inside a schema (see P3 Extract). */
export type FieldCategoryId = "statement" | "meters" | "charges";

/** The expanded provenance shown when a field is opened (P4 citation peek). */
export interface FieldProvenance {
  /** Field type, e.g. "kW · float". */
  type: string;
  /** Source location, e.g. "utility-bill.pdf · page 1 · region (520, 380) → (740, 460)". */
  source: string;
  /** Why this value matched — the model's reasoning, one line each. */
  whyMatched: string[];
  /** Match confidence, 0–100. */
  confidence: number;
  /** Nearby extracted values, "name · value". */
  neighbors: string[];
  /** Lines rendered inside the highlighted doc region's MATCH box. */
  matchBox: string[];
}

/** A single extracted value with its source citation. */
export interface ExtractedField {
  /** YAML key, written uppercase, e.g. "PEAK_DEMAND_KW". */
  name: string;
  /** Extracted value, e.g. "16.2" or "commercial · TOU-B-3". */
  value: string;
  /** Citation pointing at (doc, page) — e.g. "[5] p.1". Drives provenance highlighting. */
  citation?: string;
  /** Free-tier locked: rendered blurred behind the sign-in gate. */
  locked?: boolean;
  /** Rich provenance for the P4 peek; derived defaults are used when absent. */
  provenance?: FieldProvenance;
}

/** A citation in a grounded answer (P5), anchored to a labelled region on the doc. */
export interface AnswerCitation {
  /** Marker shown in the answer and on the region, e.g. "[1]". */
  id: string;
  /** Source page, e.g. "p.1". */
  page: string;
  /** Region label on the doc, e.g. "METER #3 · PEAK 16.2 KW". */
  label: string;
  /** Short caption rendered inside the region. */
  caption: string;
  /** Region accent. */
  tone: "success" | "info" | "warning";
}

/** A category of extracted fields shown as a view in the Extract canvas. */
export interface FieldCategory {
  id: FieldCategoryId;
  /** Lowercase label as written in the spec ("statement" / "meters" / "charges"). */
  label: string;
  /** Short count shown next to the label ("20", "8 meters", "56 charges"). */
  summary: string;
  fields: ExtractedField[];
  /** How many additional fields sit behind the gate ("N more fields locked"). */
  lockedCount?: number;
}
