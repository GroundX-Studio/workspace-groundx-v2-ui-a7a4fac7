/**
 * ReportBuilderView — the f4a (S3a) thin layout wrapper that mounts the
 * production `SmartReportBuilder` widget (2026-05-29-smart-report-screen
 * Phase 4 / design.md D2).
 *
 * Per the no-onboarding-duplicates rule, this is NOT a standalone builder
 * implementation — it resolves the render-time `ContentScope` + auth role and
 * mounts the one production widget (mirroring `ReportRenderView`). The template
 * is scope-independent; the scope here selects which template's sections to
 * seed from (the demos open on `{ bucket, filter:{ project } }` where the
 * project filter-field value IS the active scenario id).
 *
 * The `← back` affordance returns to the render surface (f4); the f4↔f4a
 * routing itself already landed in Phase 1.
 */

import Box from "@mui/material/Box";
import { type FC, useCallback } from "react";

import type { ContentScope } from "@groundx/shared";

import { SmartReportBuilder } from "@/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder";
import {
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_LABEL,
  NAVY,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { useWidgetRole } from "@/lib/widgetRole";

export const ReportBuilderView: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session, advanceFrame } = useOnboardingSession();
  const { state: registry } = useScenarioRegistry();
  const role = useWidgetRole();

  const scenarioId = appMode.scenario ?? session.scenario ?? "utility";

  // Same opening scope as the render surface: `bucket + project filter` — the
  // project filter-field value IS the scenario id (design.md D4).
  const scope: ContentScope = {
    type: "bucket",
    bucketId: registry.bucketId ?? 28454,
    filter: { project: scenarioId },
  };

  // f4a → f4 back (builder-only). Mirrors the Extract f3a → f3 back.
  const handleBack = useCallback(() => {
    advanceFrame("f4");
  }, [advanceFrame]);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        component="button"
        type="button"
        data-testid="report-builder-back"
        onClick={handleBack}
        sx={{
          alignSelf: "flex-start",
          border: "none",
          background: "none",
          cursor: "pointer",
          color: NAVY,
          fontWeight: FONT_WEIGHT_LABEL,
          fontSize: FONT_SIZE_CAPTION,
          px: 3,
          pt: 2,
          "&:focus-visible": { outline: `2px solid ${NAVY}` },
        }}
      >
        ← back
      </Box>
      <Box sx={{ flex: 1, minHeight: 0 }}>
        <SmartReportBuilder
          role={role}
          scope={scope}
          {...(session.selectedReportSectionId
            ? { selectedSectionId: session.selectedReportSectionId }
            : {})}
        />
      </Box>
    </Box>
  );
};

export default ReportBuilderView;
