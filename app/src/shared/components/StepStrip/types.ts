/**
 * Step strip — spec W2.
 *
 * Four-stop journey:
 *
 *   [1 Ingest] — [2 Understand] — [ANALYZE: Extract · Interact · Report] — [4 Integrate]
 *                                  └── dashed cyan-tinted bracket
 *
 * Pill states per spec:
 *   • active           — current step (green-filled)
 *   • done-traversed   — completed (✓ tinted)
 *   • disabled         — "Available after sign-in" (gray dashed)
 *   • reachable-todo   — clickable; not yet visited (navy outline)
 */

export type StepId = "ingest" | "understand" | "analyze" | "integrate";

export type StepPillState = "active" | "done-traversed" | "disabled" | "reachable-todo";

export type AnalyzeSubstep = "extract" | "interact" | "report";

export interface StepDescriptor {
  id: StepId;
  /** Display label e.g. "1 Ingest". */
  label: string;
  state: StepPillState;
  /** When provided + state is active, the chip nests these substeps. */
  substeps?: Array<{ id: AnalyzeSubstep; label: string; state: StepPillState }>;
}

export interface StepStripProps {
  steps: StepDescriptor[];
  /** Fires when a clickable pill is activated. Disabled pills do not call. */
  onStepClick?: (id: StepId) => void;
}
