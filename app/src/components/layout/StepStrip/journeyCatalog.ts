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
import { viewerStepKindToJourneyStage, type PersistedViewerStep, type ViewerStepKind } from "@groundx/shared";
import type { ViewerStep } from "@/contexts/ChatStoreContext";

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
 * The Analyze sub-step a viewer step kind nests under, for the three kinds that
 * collapse to the single `analyze` journey stage. This is the ONLY locally-owned
 * half of the kind → journey mapping — the top-level `step` is DERIVED from the
 * shared `viewerStepKindToJourneyStage` (see `VIEWER_STEP_TO_JOURNEY` below), so
 * there is one kind → top-stage source of truth in `@groundx/shared`. A kind
 * absent here (ingest-picker / doc-viewer / integrate) has no sub-step.
 */
const VIEWER_STEP_SUBSTEP: Partial<Record<ViewerStepKind, AnalyzeSubstep>> = {
  "extract-workbench": "extract",
  "interact-chat": "interact",
  report: "report",
};

/**
 * SINGLE SOURCE for "which journey step/sub-step does this viewer step kind
 * belong to". Moved here from `OnboardingShell`'s local
 * `VIEWER_STEP_KIND_TO_STEP_ID`. Keyed by `ViewerStep["kind"]`.
 *
 * The top-level `step` is DERIVED from the shared
 * `viewerStepKindToJourneyStage[kind]` (the canonical kind → top-stage
 * projection both the strip and the LLM context read), so it cannot drift from
 * the shared source; only the strip-specific `substep` field is owned here
 * (`VIEWER_STEP_SUBSTEP`). A cross-check test
 * (`journeyCatalog.test.ts`) asserts the derived `step` equals the shared map
 * for every kind; the drift guard forbids a rival hand-written copy in either
 * tree.
 */
export const VIEWER_STEP_TO_JOURNEY: Readonly<
  Record<ViewerStepKind, { readonly step: StepId; readonly substep?: AnalyzeSubstep }>
> = Object.fromEntries(
  (Object.keys(viewerStepKindToJourneyStage) as ViewerStepKind[]).map((kind) => [
    kind,
    {
      step: viewerStepKindToJourneyStage[kind],
      ...(VIEWER_STEP_SUBSTEP[kind] ? { substep: VIEWER_STEP_SUBSTEP[kind] } : {}),
    },
  ]),
) as Record<ViewerStepKind, { readonly step: StepId; readonly substep?: AnalyzeSubstep }>;

/**
 * standardized-viewer-control (D2) — the FRAME-FREE diagnostic identifier for an
 * active viewer step. It is the successor to the retired onboarding-surface
 * data-testid: it conveys the active viewer step kind AND its sub-position
 * straight off the step, no frame vocabulary. Rendered as
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
