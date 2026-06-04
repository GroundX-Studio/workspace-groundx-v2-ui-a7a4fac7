/**
 * Static content + ordering for the onboarding flow.
 *
 * Sample copy is lifted verbatim from the spec's P1 frame so the screen reads
 * exactly like the wireframe. The phase ordering drives done / active / pending
 * styling in the step strip.
 */

import { Frame, FlowPhase, FlowStepId, SampleProject } from "./flowTypes";

/** The three preloaded samples on P1, left to right. */
export const SAMPLES: SampleProject[] = [
  {
    id: "utility-bill",
    name: "Utility Bill",
    blurb: "A single billing statement with 8 meters and 56 charges across 3 pages.",
    docLabel: "1 doc",
    outcome: "messy layout → clean extraction",
    capabilities: ["E", "I", "R"],
    startHere: true,
  },
  {
    id: "loan-eligibility",
    name: "Loan Eligibility Packet",
    blurb: "Paystubs, W-2, bank statements, employment letter — the bundle an underwriter reviews.",
    docLabel: "12 docs",
    outcome: "docs → structured JSON for workflows",
    capabilities: ["E", "I"],
  },
  {
    id: "solar-portfolio",
    name: "Solar Project Portfolio",
    blurb: "Agreements, leases, permits, engineering studies — a whole fund's worth of project diligence.",
    docLabel: "142 docs",
    outcome: "cross-document intelligence at scale",
    capabilities: ["I", "R"],
  },
];

/** A stage rendered in the step strip. The three ANALYZE doors carry `group: "analyze"`. */
export interface StepStripStage {
  phase: FlowPhase;
  label: string;
  /** Short badge glyph shown in the leading status dot for top-level stages. */
  badge?: string;
  group?: "analyze";
}

/** Step strip stages, left to right. Extract / Interact / Report sit inside the ANALYZE bracket. */
export const STEP_STRIP: StepStripStage[] = [
  { phase: "ingest", label: "Ingest", badge: "I" },
  { phase: "understand", label: "Understand", badge: "U" },
  { phase: "extract", label: "Extract", group: "analyze" },
  { phase: "interact", label: "Interact", group: "analyze" },
  { phase: "report", label: "Report", group: "analyze" },
  { phase: "integrate", label: "Integrate", badge: "→" },
];

/** Linear order of phases, used to compute done / active / pending in the strip. */
export const PHASE_ORDER: FlowPhase[] = ["ingest", "understand", "extract", "interact", "report", "integrate"];

/** Which step-strip phase a given frame highlights. */
export const STEP_PHASE: Record<FlowStepId, FlowPhase> = {
  P1: "ingest",
  P2: "understand",
  P3: "extract",
  // P4 opens a field's provenance; the step strip flips Extract → Interact here.
  P4: "interact",
  P5: "interact",
  P6: "interact",
  P7: "integrate",
};

/** Which UI frame each step renders. The single mapping consumers switch on. */
export const FRAME_BY_STEP: Record<FlowStepId, Frame> = {
  P1: "ingest",
  P2: "understand",
  P3: "extract",
  P4: "peek",
  P5: "compare",
  P6: "gate",
  P7: "integrate",
};

/** Chat panel width bounds (px). 320 is the spec default; below ~minimum we snap to focus. */
export const CHAT_WIDTH_DEFAULT = 320;
export const CHAT_WIDTH_MIN = 280;
export const CHAT_WIDTH_MAX = 640;

/** Nav rail widths (px) — the 48 ↔ 180 "binary" from the spec, plus padding room. */
export const NAV_WIDTH_EXPANDED = 184;
export const NAV_WIDTH_COLLAPSED = 56;
