import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMemo, type FC } from "react";

import { BORDER, NAVY, WHITE } from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { AppShell } from "@/shared/components/AppShell";
import { StepStrip } from "@/shared/components/StepStrip";
import type { StepDescriptor, StepId, StepPillState } from "@/shared/components/StepStrip";
import type { FFrame } from "@/types/onboarding";

import { ExtractView } from "./ExtractView";
import { GateView } from "./GateView";
import { IngestView } from "./IngestView";
import { IntegrateView } from "./IntegrateView";
import { InteractView } from "./InteractView";
import { UnderstandView } from "./UnderstandView";

const FRAME_TO_STEP: Record<FFrame, StepId> = {
  f1: "ingest",
  f2: "understand",
  f3: "analyze",
  f3a: "analyze",
  f4: "analyze",
  f5: "analyze",
  f6: "analyze",
  f7: "integrate",
};

function pillState(stepId: StepId, currentStep: StepId, completed: Set<StepId>, authSignedIn: boolean): StepPillState {
  if (stepId === currentStep) return "active";
  if (completed.has(stepId)) return "done-traversed";
  // Integrate is reachable only after sign-in (post-gate).
  if (stepId === "integrate" && !authSignedIn) return "disabled";
  return "reachable-todo";
}

function analyzeSubsteps(frame: FFrame): StepDescriptor["substeps"] {
  const extractActive = frame === "f3" || frame === "f3a" || frame === "f4";
  const interactActive = frame === "f5" || frame === "f6";
  const reportActive = false;
  return [
    { id: "extract", label: "Extract", state: extractActive ? "active" : "reachable-todo" },
    { id: "interact", label: "Interact", state: interactActive ? "active" : "reachable-todo" },
    { id: "report", label: "Report", state: reportActive ? "active" : "disabled" },
  ];
}

/**
 * OnboardingShell — composes the F1–F7 frames behind the AppShell.
 *
 *   • F1 (Ingest) hides nav + chat (only canvas is rendered, full-bleed).
 *   • F2–F7 mount the standard 3-column shell: nav · chat · canvas.
 *   • The chat column on F2–F5 shows a placeholder agent surface; F6 swaps
 *     it for the GateView card.
 *   • The canvas hosts the active frame view.
 *
 * Step strip lives at the top of the canvas, NOT in the nav.
 */
export const OnboardingShell: FC = () => {
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const currentStep = FRAME_TO_STEP[session.currentFrame];
  const isF1 = session.currentFrame === "f1";

  const completedSteps = useMemo(() => {
    const set = new Set<StepId>();
    for (const frame of session.completedFrames) set.add(FRAME_TO_STEP[frame]);
    return set;
  }, [session.completedFrames]);

  const steps: StepDescriptor[] = useMemo(() => {
    const signedIn = appMode.authState === "signed-in";
    return [
      { id: "ingest", label: "1 Ingest", state: pillState("ingest", currentStep, completedSteps, signedIn) },
      { id: "understand", label: "2 Understand", state: pillState("understand", currentStep, completedSteps, signedIn) },
      {
        id: "analyze",
        label: "Analyze",
        state: pillState("analyze", currentStep, completedSteps, signedIn),
        substeps: analyzeSubsteps(session.currentFrame),
      },
      { id: "integrate", label: "4 Integrate", state: pillState("integrate", currentStep, completedSteps, signedIn) },
    ];
  }, [currentStep, completedSteps, appMode.authState, session.currentFrame]);

  const canvasContent = useMemo(() => {
    switch (session.currentFrame) {
      case "f1":
        return <IngestView />;
      case "f2":
        return <UnderstandView />;
      case "f3":
      case "f3a":
      case "f4":
        return <ExtractView />;
      case "f5":
      case "f6":
        return <InteractView />;
      case "f7":
        return <IntegrateView />;
      default:
        return null;
    }
  }, [session.currentFrame]);

  if (isF1) {
    // F1 is a full-bleed picker — no shell chrome.
    return (
      <Box sx={{ height: "100vh", overflow: "auto" }} data-testid="onboarding-frame-f1">
        <IngestView />
      </Box>
    );
  }

  const nav = (
    <Stack
      sx={{
        height: "100%",
        backgroundColor: NAVY,
        color: "rgba(255,255,255,0.82)",
        p: 1.5,
      }}
      aria-label="Onboarding navigation"
    >
      <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.65)", letterSpacing: "0.08em" }}>
        WORKSPACES
      </Typography>
      <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.5)", mt: 0.5 }}>
        Available after sign-in
      </Typography>
      <Box sx={{ flex: 1 }} />
      <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.65)", letterSpacing: "0.08em" }}>
        ACCOUNT
      </Typography>
      <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.85)", mt: 0.5 }}>
        Book a call
      </Typography>
      <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.85)", mt: 0.5 }}>
        Docs
      </Typography>
    </Stack>
  );

  const chat = (
    <Box
      sx={{
        height: "100%",
        backgroundColor: WHITE,
        borderRight: `1px solid ${BORDER}`,
        overflow: "auto",
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
      aria-label="Chat column"
    >
      {session.currentFrame === "f6" || session.gate.status === "open" || session.gate.status === "committed" ? (
        <GateView />
      ) : (
        <Stack spacing={1}>
          <Typography variant="overline" sx={{ color: NAVY, letterSpacing: "0.08em" }}>
            CHAT
          </Typography>
          <Typography variant="body2" sx={{ color: "rgba(64,73,107,0.7)" }}>
            Ask anything about the sample. Citations appear next to every answer.
          </Typography>
        </Stack>
      )}
    </Box>
  );

  const canvas = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE }}>
        <StepStrip steps={steps} />
      </Box>
      <Box sx={{ flex: 1, overflow: "hidden", minHeight: 0 }} data-testid={`onboarding-frame-${session.currentFrame}`}>
        {canvasContent}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ height: "100vh", overflow: "hidden" }} data-testid="onboarding-shell">
      <AppShell nav={nav} chat={chat} canvas={canvas} initialChatWidth={360} />
    </Box>
  );
};
