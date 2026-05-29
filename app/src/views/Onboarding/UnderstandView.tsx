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
import { useChatStore } from "@/contexts/ChatStoreContext";
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
  // clickable-citations Phase 5 — when the active viewer step is a
  // `doc-viewer` (pushed by a citation click), prefer ITS documentId
  // + page + highlight. The scenario's first doc is the fallback for
  // initial F2 mount (no step in history yet).
  const { state: chatState } = useChatStore();
  const activeChat =
    chatState.activeSessionId != null ? chatState.sessions.get(chatState.activeSessionId) ?? null : null;
  const activeStep =
    activeChat && activeChat.viewer.currentStep.stepIndex >= 0
      ? activeChat.viewer.history[activeChat.viewer.currentStep.stepIndex]
      : null;
  const stepDocViewer = activeStep && activeStep.kind === "doc-viewer" ? activeStep : null;

  const scenarioId = overrideScenarioId !== undefined ? overrideScenarioId : appMode.scenario ?? session.scenario;
  const scenario = scenarioId ? byId(scenarioId) : undefined;
  // Citation-click case: a doc-viewer step exists → use it directly,
  // even if no scenario is active (steady-mode reuse).
  if (stepDocViewer) {
    return (
      <Box data-testid="understand-canvas" sx={{ height: "100%", width: "100%" }}>
        <PdfViewerWidget
          documentId={stepDocViewer.documentId}
          mode="onboarding"
          targetPage={stepDocViewer.highlight?.page ?? stepDocViewer.page ?? null}
          highlightBbox={stepDocViewer.highlight?.bbox ?? null}
        />
      </Box>
    );
  }
  if (!scenario) return <UnderstandPlaceholder kind="byo" />;
  const documentId = scenario.documents[0]?.documentId;
  if (!documentId) return <UnderstandPlaceholder kind="no-doc" />;
  // WF-01 C5 (2026-05-28). While the chat is on F2 (Understand /
  // mid-thinking), paint a scan-line overlay so the canvas shows the
  // "GroundX is reading the doc" visual signal the spec calls for.
  // Once the chat auto-advances to F3 on the Done bubble, the overlay
  // drops — matches the wireframe's "done → fields" beat.
  const isF2 = session.currentFrame === "f2";
  return (
    <Box data-testid="understand-canvas" sx={{ height: "100%", width: "100%" }}>
      <PdfViewerWidget documentId={documentId} mode="onboarding" showScanAnimation={isF2} />
    </Box>
  );
};
