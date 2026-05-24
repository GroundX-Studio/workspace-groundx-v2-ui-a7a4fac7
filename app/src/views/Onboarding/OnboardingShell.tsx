import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha, keyframes, useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

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
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { AppShell } from "@/shared/components/AppShell";
import { StepStrip } from "@/shared/components/StepStrip";
import type { StepDescriptor, StepId, StepPillState } from "@/shared/components/StepStrip";
import type { FFrame, Scenario } from "@/types/onboarding";

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
  const { state: session, advanceFrame, bootstrapSession, pickScenario, openGate } = useOnboardingSession();
  const { state: scenarioRegistry } = useScenarioRegistry();
  const currentStep = FRAME_TO_STEP[session.currentFrame];
  const isF1 = session.currentFrame === "f1";

  // -- URL ↔ surface sync ----------------------------------------
  //
  // The URL is the source of truth for which surface is mounted:
  //   /onboarding                                  → F1 picker
  //   /onboarding/signup                           → BYO signup surface
  //   /onboarding/<bucketId>/<scenarioId>          → that sample active
  //
  // Direction A: URL → state. A useEffect watches useParams() +
  // pathname and calls the appropriate session action whenever the
  // URL changes (initial mount or browser back/forward).
  //
  // Direction B: state → URL. The handlers that pick samples / open
  // the gate / return to the picker call navigate(...) so a click
  // mutates the URL. The useEffect then re-derives state from the
  // new URL — no double-write, no loop, because session actions are
  // idempotent when invoked with the same target.
  const params = useParams<{ bucketId?: string; scenarioId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  // Refs to the latest session actions so the useEffect below has
  // stable references. The actions themselves are stable
  // (useCallback []), but pickScenario etc. depend on `registry`
  // which we don't pass into the dep array — keep refs to dodge
  // exhaustive-deps complaints without re-firing on identity.
  const pickScenarioRef = useRef(pickScenario);
  const openGateRef = useRef(openGate);
  const advanceFrameRef = useRef(advanceFrame);
  pickScenarioRef.current = pickScenario;
  openGateRef.current = openGate;
  advanceFrameRef.current = advanceFrame;

  useEffect(() => {
    const path = location.pathname;
    if (params.bucketId && params.scenarioId) {
      // Deep-link to a sample. Validate the bucket matches (defense
      // in depth — if the URL bucket doesn't match what the registry
      // reports, log and still activate the scenario id).
      const bucketFromUrl = Number(params.bucketId);
      if (
        scenarioRegistry.bucketId != null &&
        Number.isFinite(bucketFromUrl) &&
        bucketFromUrl !== scenarioRegistry.bucketId
      ) {
        // eslint-disable-next-line no-console
        console.warn(
          `[OnboardingShell] URL bucket ${bucketFromUrl} doesn't match registry bucket ${scenarioRegistry.bucketId}; activating scenario anyway.`,
        );
      }
      pickScenarioRef.current(params.scenarioId as Scenario);
      return;
    }
    if (path.endsWith("/onboarding/signup")) {
      openGateRef.current("byo");
      return;
    }
    if (path === "/onboarding" || path === "/onboarding/") {
      // Picker. advanceFrame("f1") deactivates any entity AND clears
      // signupOpen.
      advanceFrameRef.current("f1");
    }
  }, [params.bucketId, params.scenarioId, location.pathname, scenarioRegistry.bucketId]);

  // Note: there is no symmetric "state → URL" useEffect. That direction
  // would race with the URL → state effect above on initial mount —
  // both fire on the first commit, the state effect schedules a setState
  // that hasn't been applied yet, so the state→URL effect reads the
  // empty pre-setState session and navigates AWAY from the URL the
  // user just visited. Instead, surface-changing handlers
  // (handleStepClick for Ingest, IngestView's sample/BYO clicks) call
  // navigate() directly. URL is the single source of truth; state
  // derives from it via Direction A.

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
      if (stepId === "ingest") {
        // Returning to the F1 picker is a URL navigation. The URL
        // → state useEffect picks up the change and deactivates the
        // current entity.
        navigate("/onboarding");
        return;
      }
      const frameByStep: Record<StepId, FFrame> = {
        ingest: "f1",
        understand: "f2",
        analyze: "f3",
        integrate: "f7",
      };
      advanceFrame(frameByStep[stepId]);
    },
    [advanceFrame, appMode.authState, navigate, session.scenario],
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

  // F1 ↔ shell transition staging.
  //
  // Per spec: F1 does not animate. It sits underneath while the three
  // shell panes slide in (F1 → F2) or out (shell → F1) from / to
  // their edges. F1 is the static base; the panes are the moving
  // overlay. The transition phase drives both:
  //
  //   • "entering" — isF1 just flipped FALSE. F1 stays mounted
  //     underneath for SWIPE_DURATION_MS while panes slide IN.
  //   • "leaving"  — isF1 just flipped TRUE. The shell stays mounted
  //     on top for SWIPE_DURATION_MS while panes slide OUT to their
  //     edges, revealing F1 underneath.
  //   • "idle"     — no transition in flight. Only the active layer
  //     is mounted.
  //
  // We previously used `<AnimatePresence>` with a no-op exit
  // (animate=opacity:1, exit=opacity:1). Framer-motion never fired
  // onComplete for the no-op exit, so F1 stayed in the DOM forever.
  // The replacement is a plain timed flag — clearer to reason about,
  // and testable with fake timers without depending on the
  // framer-motion test stub running its animation cycle.
  const [transitionPhase, setTransitionPhase] = useState<"idle" | "entering" | "leaving">("idle");
  const wasF1Ref = useRef(isF1);
  useEffect(() => {
    if (wasF1Ref.current && !isF1) {
      setTransitionPhase("entering");
      const id = window.setTimeout(() => setTransitionPhase("idle"), SWIPE_DURATION_MS);
      wasF1Ref.current = isF1;
      return () => window.clearTimeout(id);
    }
    if (!wasF1Ref.current && isF1) {
      setTransitionPhase("leaving");
      const id = window.setTimeout(() => setTransitionPhase("idle"), SWIPE_DURATION_MS);
      wasF1Ref.current = isF1;
      return () => window.clearTimeout(id);
    }
    wasF1Ref.current = isF1;
  }, [isF1]);

  // Idle-phase shell content. Wrapped in plain Box / Stack — no
  // animation here. The slide animation is owned by `SlideOverlay`
  // below; the idle shell just renders the panes at their settled
  // positions. Testids are duplicated between the idle wrappers and
  // the overlay panes so tests can target the structural slot in
  // either render mode.
  const navIdle = (
    <Stack
      data-testid="onboarding-shell-nav-pane"
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
  );

  const chatIdle = (
    <Box
      data-testid="onboarding-shell-chat-pane"
      sx={{
        height: "100%",
        backgroundColor: WHITE,
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
  );

  const canvasIdle = (
    <Box
      data-testid="onboarding-shell-canvas-pane"
      sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: WHITE }}
    >
      <Box sx={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: WHITE, px: 3 }}>
        <StepStrip steps={steps} onStepClick={handleStepClick} compact={stripCompact} />
      </Box>
      <Box
        sx={{ flex: 1, overflow: "hidden", minHeight: 0, height: "100%" }}
        data-testid={`onboarding-frame-${session.currentFrame}`}
      >
        {canvasContent}
      </Box>
    </Box>
  );

  const inTransition = transitionPhase !== "idle";
  const showF1 = isF1 || transitionPhase === "entering";
  const showIdleShell = !isF1 && transitionPhase === "idle";

  return (
    <Box
      sx={{ position: "relative", height: "100vh", overflow: "hidden", backgroundColor: WHITE }}
      data-testid="onboarding-shell"
    >
      {showF1 ? (
        <Box sx={{ position: "absolute", inset: 0, zIndex: 0 }}>{f1Layout}</Box>
      ) : null}
      {showIdleShell ? (
        <Box sx={{ position: "absolute", inset: 0, zIndex: 1 }}>
          <AppShell nav={navIdle} chat={chatIdle} canvas={canvasIdle} initialChatWidth={360} />
        </Box>
      ) : null}
      {inTransition ? <SlideOverlay phase={transitionPhase} /> : null}
    </Box>
  );
};

/**
 * Renders the three shell panes as flex siblings inside a single
 * viewport-clipped container during F1 ↔ shell transitions. The panes
 * are deliberately rendered OUTSIDE the AppShell slot hierarchy
 * because AppShell's slot motion components have `overflow: hidden`,
 * which clips translating pane content back to its slot bounds. With
 * the slots clipping, the chat could never visually slide in from the
 * page edge — its content always appeared to fade in starting from
 * its slot's left edge (180px in from the viewport). Bypassing the
 * slot structure and clipping at the viewport edge instead lets the
 * panes slide in/out from the actual page edge.
 *
 * Pane content is intentionally empty during the slide. Mounting
 * GateChatPanel or UnderstandView would kick off their internal
 * animations (composing dots, scan line) before the pane has finished
 * arriving — visually noisy. Real content mounts once the slide
 * completes and OnboardingShell swaps to the AppShell render path.
 */
const SlideOverlay: FC<{ phase: "entering" | "leaving" }> = ({ phase }) => {
  const dir = phase === "leaving" ? "out" : "in";
  const sideAnim = dir === "in" ? slideInFromLeft : slideOutToLeft;
  const canvasAnim = dir === "in" ? slideInFromRight : slideOutToRight;
  const animStyle = (kf: ReturnType<typeof keyframes>) =>
    `${kf} ${SWIPE_DURATION_S}s ${SWIPE_EASE_CSS} both`;

  return (
    <Box
      sx={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        display: "flex",
        flexDirection: "row",
        overflow: "hidden",
      }}
    >
      <Box
        data-testid="onboarding-shell-nav-pane"
        sx={{
          width: 180,
          flexShrink: 0,
          height: "100%",
          backgroundColor: NAVY,
          animation: animStyle(sideAnim),
        }}
      />
      <Box
        data-testid="onboarding-shell-chat-pane"
        sx={{
          width: 360,
          flexShrink: 0,
          height: "100%",
          backgroundColor: WHITE,
          animation: animStyle(sideAnim),
        }}
      />
      <Box
        data-testid="onboarding-shell-canvas-pane"
        sx={{
          flex: 1,
          height: "100%",
          backgroundColor: WHITE,
          animation: animStyle(canvasAnim),
        }}
      />
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
 * F1 doesn't animate at all. It just sits underneath at zIndex 0, and
 * gets progressively covered as the three panes converge to their final
 * positions. Once the panes are in place (~SWIPE_DURATION_MS later),
 * F1 is fully occluded and unmounts (driven by a timed flag in
 * OnboardingShell, NOT by an AnimatePresence exit — the no-op exit
 * approach left F1 in the DOM forever).
 */
const SWIPE_DURATION_S = 0.7;
const SWIPE_DURATION_MS = SWIPE_DURATION_S * 1000;
const SWIPE_EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)"; // easeOutExpo

// CSS @keyframes definitions. Native browser animations run on the
// compositor thread, so they fire on mount regardless of JS thread
// health, RAF throttling, or framer-motion's initial-state race.
//
// Translations are viewport-relative (100vw) rather than pane-relative
// (100% of each pane's own width). Why: with pane-relative translates,
// each pane only moves by its own width — fine for the nav (180px,
// flush against the page edge) but broken for the chat (360px, offset
// 180px from the left edge). On slide-out, the chat ended at
// translateX(-360px), which still left its right half visible on
// screen — half-covered by the nav. The pane then snap-unmounted,
// reading as a "weird fade".
//
// Using 100vw guarantees every pane travels the same distance and
// fully exits the viewport edge regardless of slot position. As a
// bonus, nav and chat now slide together at the same speed, so the
// left column reads as one cohesive block sliding in/out.
const slideInFromLeft = keyframes`
  from { transform: translateX(-100vw); }
  to   { transform: translateX(0); }
`;

const slideInFromRight = keyframes`
  from { transform: translateX(100vw); }
  to   { transform: translateX(0); }
`;

const slideOutToLeft = keyframes`
  from { transform: translateX(0); }
  to   { transform: translateX(-100vw); }
`;

const slideOutToRight = keyframes`
  from { transform: translateX(0); }
  to   { transform: translateX(100vw); }
`;

