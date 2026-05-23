import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, type FC } from "react";

import { issueOnboardingSession } from "@/api/entities/onboardingSessionEntity";
import {
  BODY_ON_DARK,
  BORDER,
  MUTED_ON_DARK,
  MUTED_ON_LIGHT,
  NAVY,
  PICKER_MAX_WIDTH,
  PICKER_MAX_WIDTH_ULTRAWIDE,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { AppShell } from "@/shared/components/AppShell";
import { StepStrip } from "@/shared/components/StepStrip";
import type { StepDescriptor, StepId, StepPillState } from "@/shared/components/StepStrip";
import type { FFrame } from "@/types/onboarding";

import { ExtractView } from "./ExtractView";
import { GateChatPanel } from "./GateChatPanel";
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

function pillState(
  stepId: StepId,
  currentStep: StepId,
  completed: Set<StepId>,
  authSignedIn: boolean,
  scenarioPicked: boolean,
): StepPillState {
  if (stepId === currentStep) return "active";
  if (completed.has(stepId)) return "done-traversed";
  // Integrate is reachable only after sign-in (post-gate).
  if (stepId === "integrate" && !authSignedIn) return "disabled";
  // Understand, Analyze can't be jumped to until a sample is picked on F1 —
  // they need a scenario to render anything meaningful.
  if ((stepId === "understand" || stepId === "analyze") && !scenarioPicked) return "disabled";
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
  const { state: session, advanceFrame, bootstrapSession } = useOnboardingSession();
  const currentStep = FRAME_TO_STEP[session.currentFrame];
  const isF1 = session.currentFrame === "f1";

  useEffect(() => {
    if (session.sessionId) return;
    let cancelled = false;
    issueOnboardingSession()
      .then((response) => {
        if (!cancelled) bootstrapSession(response.sessionId);
      })
      .catch(() => {
        // Local preview/e2e can run without middleware. The production path is
        // still exercised by middleware/API tests, and preview remains usable.
      });
    return () => {
      cancelled = true;
    };
  }, [bootstrapSession, session.sessionId]);

  const completedSteps = useMemo(() => {
    const set = new Set<StepId>();
    for (const frame of session.completedFrames) set.add(FRAME_TO_STEP[frame]);
    return set;
  }, [session.completedFrames]);

  const steps: StepDescriptor[] = useMemo(() => {
    const signedIn = appMode.authState === "signed-in";
    const scenarioPicked = session.scenario != null;
    return [
      { id: "ingest", label: "1 Ingest", state: pillState("ingest", currentStep, completedSteps, signedIn, scenarioPicked) },
      { id: "understand", label: "2 Understand", state: pillState("understand", currentStep, completedSteps, signedIn, scenarioPicked) },
      {
        id: "analyze",
        label: "Analyze",
        state: pillState("analyze", currentStep, completedSteps, signedIn, scenarioPicked),
        substeps: analyzeSubsteps(session.currentFrame),
      },
      { id: "integrate", label: "4 Integrate", state: pillState("integrate", currentStep, completedSteps, signedIn, scenarioPicked) },
    ];
  }, [currentStep, completedSteps, appMode.authState, session.currentFrame, session.scenario]);

  const handleStepClick = useCallback(
    (stepId: StepId) => {
      if (stepId === "integrate" && appMode.authState !== "signed-in") return;
      // Understand + Analyze need a scenario; on F1 the user must click a
      // sample card (or BYO) first.
      if ((stepId === "understand" || stepId === "analyze") && session.scenario == null) return;
      const frameByStep: Record<StepId, FFrame> = {
        ingest: "f1",
        understand: "f2",
        analyze: "f3",
        integrate: "f7",
      };
      advanceFrame(frameByStep[stepId]);
    },
    [advanceFrame, appMode.authState, session.scenario],
  );

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

  // Theme-driven breakpoint detection. Compact step strip activates below
  // md (900 = MUI default; iPad-portrait-to-landscape divide). Phones +
  // iPad-portrait get the thin progress bar; iPad-landscape and up get the
  // full pill strip — which is also where it fits on one row.
  const theme = useTheme();
  const stripCompact = useMediaQuery(theme.breakpoints.down("md"));

  if (isF1) {
    // F1: nav + chat are hidden so the picker gets the full width (spec
    // Canvas_Ingest). The step strip stays visible at the top of the canvas
    // so the user can see Ingest active + Analyze/Integrate as upcoming
    // before they pick a sample. The strip aligns with the main content's
    // max-width (1200) so it doesn't feel orphaned on wide monitors.
    return (
      <Box
        data-testid="onboarding-frame-f1"
        sx={{
          height: "100vh",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          backgroundColor: WHITE,
        }}
      >
        <Box sx={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE }}>
          {/* Strip container width must match IngestView's container so the
              first pill and the hero headline both anchor to the same left
              edge on every viewport. Ultrawide (xl) bumps to 1320 — see
              IngestView for the rationale. */}
          <Box sx={{ maxWidth: { xs: "100%", md: PICKER_MAX_WIDTH, xl: PICKER_MAX_WIDTH_ULTRAWIDE }, mx: "auto", px: { xs: 2, md: 4 } }}>
            <StepStrip steps={steps} onStepClick={handleStepClick} compact={stripCompact} />
          </Box>
        </Box>
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <IngestView />
        </Box>
      </Box>
    );
  }

  const nav = (
    <SlideInPane delay={0} data-testid="onboarding-shell-nav-pane">
      <Stack
        sx={{
          height: "100%",
          backgroundColor: NAVY,
          color: BODY_ON_DARK,
          p: 1.5,
        }}
        aria-label="Onboarding navigation"
      >
        <Typography variant="overline" sx={{ color: MUTED_ON_DARK, letterSpacing: "0.08em" }}>
          WORKSPACES
        </Typography>
        <Typography variant="body2" sx={{ color: alpha(WHITE, 0.5), mt: 0.5 }}>
          Available after sign-in
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Typography variant="overline" sx={{ color: MUTED_ON_DARK, letterSpacing: "0.08em" }}>
          ACCOUNT
        </Typography>
        <Typography variant="body2" sx={{ color: alpha(WHITE, 0.85), mt: 0.5 }}>
          Book a call
        </Typography>
        <Typography variant="body2" sx={{ color: alpha(WHITE, 0.85), mt: 0.5 }}>
          Docs
        </Typography>
      </Stack>
    </SlideInPane>
  );

  const chat = (
    <SlideInPane delay={0.15} data-testid="onboarding-shell-chat-pane">
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
        <GateChatPanel />
      </Box>
    </SlideInPane>
  );

  const canvas = (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <Box sx={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE, px: 3 }}>
        <StepStrip steps={steps} onStepClick={handleStepClick} compact={stripCompact} />
      </Box>
      <FadeUpPane delay={0.32} data-testid="onboarding-shell-canvas-pane">
        <Box sx={{ flex: 1, overflow: "hidden", minHeight: 0, height: "100%" }} data-testid={`onboarding-frame-${session.currentFrame}`}>
          {canvasContent}
        </Box>
      </FadeUpPane>
    </Box>
  );

  return (
    <Box sx={{ height: "100vh", overflow: "hidden" }} data-testid="onboarding-shell">
      <AppShell nav={nav} chat={chat} canvas={canvas} initialChatWidth={360} />
    </Box>
  );
};

/**
 * F1 → F2 choreography, beats 1 + 2: nav and chat slide in from the
 * left in sequence. Wraps a single column inside the AppShell so the
 * outer layout (widths, borders) stays AppShell-owned; only the
 * column's contents translate.
 *
 * `initial` only fires on mount, so subsequent intra-shell navigations
 * (F2→F3, F3→F5) re-use the mounted pane and skip the animation —
 * which is what we want, the slide-in is exclusive to the F1→F2 entry.
 */
const SlideInPane: FC<{ children: React.ReactNode; delay: number; "data-testid"?: string }> = ({
  children,
  delay,
  "data-testid": testId,
}) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      data-testid={testId}
      style={{ height: "100%", width: "100%" }}
      initial={reduceMotion ? false : { x: "-100%" }}
      animate={{ x: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
};

/**
 * F1 → F2 choreography, beat 3: the canvas content fades up after the
 * nav + chat panes have settled. Internal sub-beats (scan line,
 * streaming thinking notes, reveal of the "Show me the extract" CTA)
 * live inside UnderstandView and run after this fade completes.
 */
const FadeUpPane: FC<{ children: React.ReactNode; delay: number; "data-testid"?: string }> = ({
  children,
  delay,
  "data-testid": testId,
}) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      data-testid={testId}
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      initial={reduceMotion ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.4, ease: "easeOut", delay: reduceMotion ? 0 : delay }}
    >
      {children}
    </motion.div>
  );
};
