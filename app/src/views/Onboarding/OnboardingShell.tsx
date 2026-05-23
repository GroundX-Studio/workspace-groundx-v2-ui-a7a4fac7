import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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

  const f1Layout = (
    <Box
      data-testid="onboarding-frame-f1"
      sx={{
        height: "100%",
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

  const nav = (
    <PaneSlideIn from="left" data-testid="onboarding-shell-nav-pane" backgroundColor={NAVY}>
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
    </PaneSlideIn>
  );

  const chat = (
    <PaneSlideIn from="left" data-testid="onboarding-shell-chat-pane" backgroundColor={WHITE}>
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
    </PaneSlideIn>
  );

  const canvas = (
    <PaneSlideIn from="right" data-testid="onboarding-shell-canvas-pane" backgroundColor={WHITE}>
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: WHITE }}>
        <Box sx={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE, px: 3 }}>
          <StepStrip steps={steps} onStepClick={handleStepClick} compact={stripCompact} />
        </Box>
        <Box sx={{ flex: 1, overflow: "hidden", minHeight: 0, height: "100%" }} data-testid={`onboarding-frame-${session.currentFrame}`}>
          {canvasContent}
        </Box>
      </Box>
    </PaneSlideIn>
  );

  return (
    <Box
      sx={{ position: "relative", height: "100vh", overflow: "hidden", backgroundColor: WHITE }}
      data-testid="onboarding-shell"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {isF1 ? (
          <F1ExitFrame key="onboarding-f1-frame">{f1Layout}</F1ExitFrame>
        ) : (
          <ShellEntryFrame key="onboarding-shell-frame">
            <AppShell nav={nav} chat={chat} canvas={canvas} initialChatWidth={360} />
          </ShellEntryFrame>
        )}
      </AnimatePresence>
    </Box>
  );
};

/**
 * F1 → F2 transition — F1 stays still underneath; the three shell
 * panes slide in over it from their respective edges:
 *
 *   Nav  (180px)  ─►  slides in from the LEFT
 *   Chat (340px)  ─►  slides in from the LEFT
 *   Canvas (rest) ◄─  slides in from the RIGHT
 *
 * F1 doesn't animate at all. It just sits underneath, and gets
 * progressively covered as the three panes converge to their final
 * positions. Once the panes are in place, F1 is fully occluded and
 * unmounts.
 *
 * AnimatePresence keeps F1 mounted for the SWIPE_DURATION_S beat
 * via a no-op exit transition so it stays visible behind the
 * sliding panes during the transition.
 */
const SWIPE_DURATION_S = 0.7;
const SWIPE_EASE = [0.16, 1, 0.3, 1] as const; // easeOutExpo

const F1ExitFrame: FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    // F1 is underneath (zIndex 0). No transform on exit — it stays
    // still — but the no-op exit keeps it mounted during the
    // SWIPE_DURATION_S beat so the user sees it behind the sliding
    // shell panes.
    style={{ position: "absolute", inset: 0, backgroundColor: WHITE, zIndex: 0 }}
    initial={false}
    animate={{ opacity: 1 }}
    exit={{ opacity: 1 }}
    transition={{ duration: SWIPE_DURATION_S }}
  >
    {children}
  </motion.div>
);

const ShellEntryFrame: FC<{ children: React.ReactNode }> = ({ children }) => (
  <motion.div
    // Shell is on top (zIndex 1). The shell itself doesn't slide —
    // its individual panes do, each from their own edge. Mounting
    // the shell with no transform just makes the AppShell layout
    // available; the PaneSlideIn wrappers inside drive the motion.
    style={{ position: "absolute", inset: 0, zIndex: 1 }}
  >
    {children}
  </motion.div>
);

/**
 * Slides a pane's contents into place from its edge — left for nav
 * and chat, right for canvas — over F1 sitting underneath. The pane's
 * background travels with it, so F1 stays visible until the pane
 * physically reaches its target position.
 *
 * Only fires on mount. F2 → F3, F3 → F5 etc. don't re-trigger since
 * the panes stay mounted across intra-shell navigation.
 */
const PaneSlideIn: FC<{
  children: React.ReactNode;
  from: "left" | "right";
  backgroundColor: string;
  "data-testid"?: string;
}> = ({ children, from, backgroundColor, "data-testid": testId }) => {
  const reduceMotion = useReducedMotion();
  const initialX = from === "left" ? "-100%" : "100%";
  return (
    <motion.div
      data-testid={testId}
      style={{ height: "100%", width: "100%", backgroundColor }}
      initial={reduceMotion ? false : { x: initialX }}
      animate={{ x: 0 }}
      transition={{ duration: reduceMotion ? 0 : SWIPE_DURATION_S, ease: SWIPE_EASE }}
    >
      {children}
    </motion.div>
  );
};
