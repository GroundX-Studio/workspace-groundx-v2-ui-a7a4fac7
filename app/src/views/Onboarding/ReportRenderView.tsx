/**
 * ReportRenderView — the f4 (S3) thin layout wrapper that mounts the
 * production `SmartReportRender` widget (2026-05-29-smart-report-screen
 * Phase 3 / design.md D2).
 *
 * Per the no-onboarding-duplicates rule, this is NOT a standalone report
 * implementation — it resolves the render-time `ContentScope` + auth role and
 * mounts the one production widget. The scope is inherited from the surface the
 * user transitioned from (Extract / Interact / the Report pill): the demos open
 * on `{ bucket, filter:{ project } }` (design.md D4) where the project filter-
 * field value IS the active scenario id, so the user never re-picks what they
 * were already analyzing.
 *
 * `✎ edit §N` from the render surface advances to the builder (f4a), carrying
 * the section id so the builder pre-opens that section's inline editor
 * (`advanceFrame("f4a", { selectedReportSectionId })` → the builder's
 * `selectedSectionId` prop).
 */

import { type FC, useCallback } from "react";

import type { ContentScope } from "@groundx/shared";

import { SmartReportRender } from "@/components/viewer-widgets/SmartReportRender/SmartReportRender";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useWidgetRole } from "@/lib/widgetRole";

export const ReportRenderView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session, advanceFrame } = useOnboardingSession();
  const { state: registry } = useScenarioRegistry();
  const role = useWidgetRole();

  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";

  // Render scope = `bucket + project filter` — the opening display context for
  // every demo sample (the project filter-field value IS the scenario id). A
  // bare bucket (no filter) is a valid "whole workspace" scope but not what the
  // demos use. The bucketId comes from the registry (the shared samples bucket).
  const scope: ContentScope = {
    type: "bucket",
    bucketId: registry.bucketId ?? 28454,
    filter: { project: scenarioId },
  };

  const handleEditSection = useCallback(
    (sectionId: string) => {
      // f4 → f4a edit affordance, carrying the section id so the builder
      // pre-opens that section's inline editor (the render→builder hand-off).
      advanceFrame("f4a", { selectedReportSectionId: sectionId });
    },
    [advanceFrame],
  );

  return <SmartReportRender role={role} scope={scope} onEditSection={handleEditSection} />;
};

export default ReportRenderView;
