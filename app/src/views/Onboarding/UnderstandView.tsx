/**
 * F2 UnderstandView — thin wrapper for the production PDF viewer.
 *
 * Per `memory/feedback_no_onboarding_duplicates.md`: no onboarding-
 * specific PDF viewer exists. This view resolves the active scenario's
 * documentId and mounts `PdfViewerWidget` with `mode="onboarding"`
 * (which locks editing affordances). Empty-state copy moved into
 * `UnderstandPlaceholder` in ARCH-10 (2026-05-26).
 */

import Box from "@mui/material/Box";
import type { FC } from "react";

import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { UnderstandPlaceholder } from "./UnderstandPlaceholder";

export interface UnderstandViewProps {
  /** Override scenario id from session — used during the F2→F1 slide-out. */
  overrideScenarioId?: string | null;
}

export const UnderstandView: FC<UnderstandViewProps> = ({ overrideScenarioId }) => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const { byId } = useScenarioRegistry();
  const scenarioId = overrideScenarioId !== undefined ? overrideScenarioId : appMode.scenario ?? session.scenario;
  const scenario = scenarioId ? byId(scenarioId) : undefined;
  if (!scenario) return <UnderstandPlaceholder kind="byo" />;
  const documentId = scenario.documents[0]?.documentId;
  if (!documentId) return <UnderstandPlaceholder kind="no-doc" />;
  return (
    <Box data-testid="understand-canvas" sx={{ height: "100%", width: "100%" }}>
      <PdfViewerWidget documentId={documentId} mode="onboarding" />
    </Box>
  );
};
