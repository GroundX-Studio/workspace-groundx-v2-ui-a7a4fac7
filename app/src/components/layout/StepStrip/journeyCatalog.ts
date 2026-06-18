/**
 * Journey catalog — the SINGLE SOURCE for the onboarding journey vocabulary.
 *
 * 2026-06-16 viewer-nav-redesign. Both the StepStrip pill labels (built in
 * `OnboardingShell`) and the viewer nav (`resolveViewerNav`) read from here, so
 * the step/sub-step words can never drift between the strip and the nav. The
 * `VIEWER_STEP_TO_JOURNEY` map below was previously a local
 * `VIEWER_STEP_KIND_TO_STEP_ID` inside `OnboardingShell` — it is consolidated
 * here (one copy). A guard in `app/src/test/recurrence-drift-guards.test.ts`
 * fails the build if a second copy of the labels or the mapping reappears.
 *
 * Eyebrow values are stored MIXED-CASE; the `Label` eyebrow variant renders them
 * uppercase via CSS `text-transform`, so the DOM text stays mixed-case.
 */
import type { ViewerStep } from "@/contexts/ChatStoreContext";
import type { PersistedViewerStep } from "@groundx/shared";

import type { AnalyzeSubstep, StepId } from "./types";

export interface JourneyStepEntry {
  /** StepStrip pill label, e.g. "2 Understand". */
  readonly stepLabel: string;
  /** Nav eyebrow base (mixed-case; displays uppercase), e.g. "Understand". */
  readonly eyebrow: string;
  /** Nav title for steps WITHOUT sub-steps (e.g. Integrate → "Connect"). */
  readonly title?: string;
  /** Analyze's sub-steps: pill label + nav title. */
  readonly substeps?: Readonly<Record<AnalyzeSubstep, { readonly label: string; readonly title: string }>>;
}

export const JOURNEY_CATALOG: Readonly<Record<StepId, JourneyStepEntry>> = {
  ingest: { stepLabel: "1 Ingest", eyebrow: "Ingest" },
  understand: { stepLabel: "2 Understand", eyebrow: "Understand" },
  analyze: {
    stepLabel: "Analyze",
    eyebrow: "Analyze",
    substeps: {
      extract: { label: "Extract", title: "Extract" },
      interact: { label: "Interact", title: "Interact" },
      report: { label: "Report", title: "Report" },
    },
  },
  integrate: { stepLabel: "4 Integrate", eyebrow: "Integrate", title: "Connect" },
};

/**
 * The live, present-tense line shown via the frame's existing `loading` slot
 * while the Understand doc-viewer is in its scanning beat.
 */
export const INGEST_LIVE_LABEL =
  "Reading the document — mapping each table, paragraph, and figure on the page.";

/**
 * SINGLE SOURCE for "which journey step/sub-step does this viewer step kind
 * belong to". Moved here from `OnboardingShell`'s local
 * `VIEWER_STEP_KIND_TO_STEP_ID`. Keyed by `ViewerStep["kind"]`.
 */
export const VIEWER_STEP_TO_JOURNEY: Readonly<
  Record<string, { readonly step: StepId; readonly substep?: AnalyzeSubstep }>
> = {
  "ingest-picker": { step: "ingest" },
  "doc-viewer": { step: "understand" },
  "extract-workbench": { step: "analyze", substep: "extract" },
  "interact-chat": { step: "analyze", substep: "interact" },
  report: { step: "analyze", substep: "report" },
  integrate: { step: "integrate" },
};

/**
 * standardized-viewer-control (D2) — the FRAME-FREE diagnostic identifier for an
 * active viewer step. It is the successor to the retired `onboarding-frame-fN`
 * data-testid (and the `currentFrame` reverse-projection it read): it conveys the
 * SAME two facts the frame did — the active viewer step kind AND its sub-position
 * — straight off the step, no frame vocabulary. Rendered as
 * `data-testid={`onboarding-step-${viewerStepDiagnosticId(step)}`}` and read by
 * the onboarding shell tests. The sub-position suffix mirrors the step's own
 * `surface` field (Extract fields/design, Report render/builder); a step without
 * a surface returns its bare kind.
 */
export function viewerStepDiagnosticId(step: ViewerStep | PersistedViewerStep): string {
  switch (step.kind) {
    case "extract-workbench":
      return step.surface === "design" ? "extract-workbench-design" : "extract-workbench";
    case "report":
      return step.surface === "builder" ? "report-builder" : "report-render";
    default:
      return step.kind;
  }
}
