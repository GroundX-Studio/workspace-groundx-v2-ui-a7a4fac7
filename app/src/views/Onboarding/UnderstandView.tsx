/**
 * F2 UnderstandView — thin layout wrapper for the production PDF viewer.
 *
 * Per `memory/feedback_no_onboarding_duplicates.md` and
 * `docs/agents/real-data-rewire-gap.md`: there are no onboarding-
 * specific PDF viewers. This view is a layout wrapper that mounts the
 * production `PdfViewerWidget` with `mode="onboarding"` (locks editing
 * controls) and the active scenario's document id.
 *
 * BYO branch (no scenario picked) still renders a sign-in placeholder
 * — this only surfaces if a frame transitions to F2 without an active
 * entity, defensive against an edge case the gate flow normally guards.
 */

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { FC } from "react";

import {
  BODY_TEXT,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_LABEL,
} from "@/constants";
import { PdfViewerWidget } from "@/components/viewer-widgets/PdfViewer/PdfViewerWidget";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";

export interface UnderstandViewProps {
  /**
   * Override the scenario id read from session/appMode context. Used by
   * the OnboardingShell during the F2->F1 slide-out so the canvas can
   * show what was just there, not what session state has flipped to.
   */
  overrideScenarioId?: string | null;
}

export const UnderstandView: FC<UnderstandViewProps> = ({ overrideScenarioId }) => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const scenarioId =
    overrideScenarioId !== undefined
      ? overrideScenarioId
      : appMode.scenario ?? session.scenario;
  const { byId } = useScenarioRegistry();
  const scenario = scenarioId ? byId(scenarioId) : undefined;

  // BYO branch — no scenario picked yet. The chat column carries the
  // gate / sign-in flow; the canvas just shows orientation copy.
  if (!scenario) {
    return (
      <Box
        sx={{
          p: { xs: 3, md: 5 },
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 1,
          maxWidth: 560,
          mx: "auto",
        }}
        aria-label="Understand · sign in to upload"
      >
        <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
          UNDERSTAND
        </Typography>
        <Typography variant="h4">Sign in to start uploading your own docs.</Typography>
        <Typography variant="body1" sx={{ color: BODY_TEXT, mt: 1 }}>
          Once you&apos;re signed in, this surface streams the same parse + extract
          experience over your documents. Use the chat column to send a magic
          link, log in with SSO, or book a call with an engineer.
        </Typography>
      </Box>
    );
  }

  const documentId = scenario.documents[0]?.documentId;
  if (!documentId) {
    return (
      <Box sx={{ p: { xs: 3, md: 5 }, height: "100%" }} aria-label="Understand · no document">
        <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
          UNDERSTAND
        </Typography>
        <Typography variant="body1" sx={{ color: BODY_TEXT, mt: 1 }}>
          No documents in this scenario yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box data-testid="understand-canvas" sx={{ height: "100%", width: "100%" }}>
      <PdfViewerWidget documentId={documentId} mode="onboarding" />
    </Box>
  );
};
