/**
 * Onboarding flow domain types.
 *
 * The chat-driven onboarding spec (Onboarding Spec · v1) walks a single linear
 * path F1 → F7: Ingest → Understand → Analyze (Extract / Interact / Report) →
 * Gate → Integrate. These types model that journey and the "Sample" projects a
 * user can pick on F1. See views/Onboarding for the screens that consume them.
 */

/** A frame in the linear onboarding journey. F1 is full-width ingest; F2+ are split. */
export type FlowStepId = "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7";

/**
 * The journey phase surfaced in the step strip (W2). "extract" / "interact" /
 * "report" are the three doors inside the ANALYZE bracket.
 */
export type FlowPhase = "ingest" | "understand" | "extract" | "interact" | "report" | "integrate";

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
