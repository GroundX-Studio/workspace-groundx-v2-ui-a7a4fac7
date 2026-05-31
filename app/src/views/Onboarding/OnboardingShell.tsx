import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { issueOnboardingSession } from "@/api/entities/onboardingSessionEntity";
import {
  BORDER,
  ONBOARDING_NAV_WIDTH_COLLAPSED,
  ONBOARDING_NAV_WIDTH_FULL,
  PICKER_MAX_WIDTH,
  PICKER_MAX_WIDTH_ULTRAWIDE,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useWidgetRole } from "@/lib/widgetRole";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { AppShell } from "@/components/layout/AppShell";
import { OnboardingNav } from "@/components/layout/OnboardingNav/OnboardingNav";
import type { OnboardingNavItemKey } from "@/components/layout/OnboardingNav/OnboardingNav";
import { StepStrip } from "@/components/layout/StepStrip";
import type { StepDescriptor, StepId, StepPillState } from "@/components/layout/StepStrip";
import type { FFrame, Scenario } from "@/types/onboarding";

import { BookingStatusCard } from "@/components/chat-widgets/BookingStatusCard/BookingStatusCard";
import { BookCallView } from "@/components/viewer-widgets/BookCallView/BookCallView";
import { GateValueProp } from "@/components/viewer-widgets/GateValueProp/GateValueProp";
import { ExtractView } from "./ExtractView";
import { IngestView } from "./IngestView";
import { ChatColumn } from "@/components/chat-widgets/ChatColumn/ChatColumn";
import { IntegrateView } from "./IntegrateView";
import { InteractView } from "./InteractView";
import { NavDebugOverlay } from "./NavDebugOverlay";
import { ReportBuilderView } from "./ReportBuilderView";
import { ReportRenderView } from "./ReportRenderView";
import { UnderstandView } from "./UnderstandView";

// ─────────────────────────────────────────────────────────────────────
// ARCH-06 F1 overlay animation spec (locked 2026-05-26).
//
// Mental model: F1 (the picker) is an OVERLAY on top of F2+ (the
// canonical AppShell). When the user picks a sample / clicks BYO,
// F1 lifts up off the top edge to reveal what was always underneath.
// When they click the Ingest pill, F1 returns over the top.
//
// Spec — A · Sheet dismiss (Iris/Curtain alternatives evaluated &
// rejected; A is the "premium calm" choice for a first-impression
// surface that ages well on repeat visits):
//
//   • Easing: cubic-bezier(0.32, 0.72, 0, 1) — iOS-style ease-out
//     curve. Front-loaded distance, no overshoot.
//   • Dismiss (F1 leaves, 900ms): F1 translates Y 0 → -100%; opacity
//     holds at 1 through the first 70% of the timeline, then wipes
//     1 → 0 over the final 30% (270ms). The held-opacity window
//     reads as a physical lift instead of a dissolve.
//   • Return (F1 comes back, 700ms): F1 translates Y -100% → 0;
//     opacity fades 0 → 1 over the first 30% (210ms), then holds.
//     Asymmetric duration is intentional — return is slightly
//     snappier so users don't feel "stuck on F1" when bouncing back.
//   • F2 zoom: scale 0.985 → 1, opacity 0.92 → 1 on dismiss; inverse
//     on return. Deliberately subtle (~1.5% scale) so it reads as
//     "settling into focus" rather than swelling.
//   • Reduced motion: animations bypassed; instant swap.
// ─────────────────────────────────────────────────────────────────────
const F1_DISMISS_DURATION_S = 0.9;
const F1_RETURN_DURATION_S = 0.7;
const F1_OPACITY_PORTION = 0.3; // 30% of the duration for the fade tail
const F1_OVERLAY_EASE = [0.32, 0.72, 0, 1] as const;
const F2_ZOOM_SCALE = 0.985;
const F2_ZOOM_OPACITY = 0.92;

const FRAME_TO_STEP: Record<FFrame, StepId> = {
  f1: "ingest",
  f2: "understand",
  f3: "analyze",
  f3a: "analyze",
  f4: "analyze",
  f4a: "analyze",
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

function analyzeSubsteps(frame: FFrame, gateOpen = false): StepDescriptor["substeps"] {
  // P1 (2026-05-29): while the sign-up gate is open the strip sits on
  // Understand, so the Analyze bracket shows no active sub-step (otherwise
  // both Understand and Interact would read as active at once).
  // 2026-05-29-smart-report-screen Phase 1 — f4/f4a are the Report render +
  // builder frames; the extract workbench is f3/f3a only (f4 no longer routes
  // there).
  const extractActive = !gateOpen && (frame === "f3" || frame === "f3a");
  const interactActive = !gateOpen && (frame === "f5" || frame === "f6");
  // The Report pill is reachable for ALL scenarios (not chapter-gated, not
  // auth-gated) — `reportActive = false` removed. Anon previews the render
  // surface (export/Save locked). Active on the Report frames.
  const reportActive = !gateOpen && (frame === "f4" || frame === "f4a");
  return [
    { id: "extract", label: "Extract", state: extractActive ? "active" : "reachable-todo" },
    { id: "interact", label: "Interact", state: interactActive ? "active" : "reachable-todo" },
    { id: "report", label: "Report", state: reportActive ? "active" : "reachable-todo" },
  ];
}

/**
 * OnboardingShell — composes the F1–F7 frames behind a shared
 * shell-level left-rail nav.
 *
 *   • OnboardingNav lives at the shell root, mounted on every frame.
 *     It owns its own collapsed/expanded state (chevron) and never
 *     animates during F1 ↔ F2 transitions.
 *   • F1 (Ingest) — the right-of-nav slot is the full-width picker
 *     (StepStrip on top, IngestView below). No chat column.
 *   • F2–F7 — the right-of-nav slot is the AppShell chat | canvas
 *     split. Chat column hosts GateChatPanel; canvas hosts the
 *     active frame view (UnderstandView / ExtractView / etc.).
 *   • The F1 ↔ shell transition slides ONLY chat + canvas; the nav
 *     is stable.
 *
 * Step strip lives at the top of the canvas (or the top of F1's
 * picker), NOT in the nav.
 */
export const OnboardingShell: FC = () => {
  const { state: appMode } = useAppMode();
  const widgetRole = useWidgetRole();
  const { state: session, advanceFrame, bootstrapSession, pickScenario, openGate } = useOnboardingSession();
  const { state: scenarioRegistry } = useScenarioRegistry();
  // ChatStore is read up here so the StepStrip pill state below can
  // derive from the active ViewerStep (citation clicks push a
  // doc-viewer step → nav highlight follows the canvas swap, see
  // master-viewer-session). The same `chatStoreState` is used later
  // for overlay reads + canvas-content selection.
  const { state: chatStoreState, pushOverlay, popOverlay } = useChatStore();
  const activeChatSessionEarly =
    chatStoreState.activeSessionId != null
      ? chatStoreState.sessions.get(chatStoreState.activeSessionId)
      : null;
  const latestViewerStepEarly =
    activeChatSessionEarly && activeChatSessionEarly.viewer.currentStep.stepIndex >= 0
      ? activeChatSessionEarly.viewer.history[activeChatSessionEarly.viewer.currentStep.stepIndex]
      : null;
  // ViewerStep → StepStrip pill mapping. Clickable citations push a
  // `doc-viewer` step which maps to the Understand pill, so the nav
  // indicator matches what the canvas surfaces.
  const VIEWER_STEP_KIND_TO_STEP_ID: Record<string, StepId> = {
    "ingest-picker": "ingest",
    "doc-viewer": "understand",
    "extract-workbench": "analyze",
    "interact-chat": "analyze",
    report: "analyze",
    integrate: "integrate",
  };
  // P1 (2026-05-29): while the sign-up gate is OPEN (the doors + value-prop
  // screen), the step strip sits on "Understand" — the gate is the "you've
  // understood the value, now save it" moment. Owner-directed. Once the gate
  // commits and the user continues, normal step derivation resumes.
  const currentStep: StepId =
    session.gate.status === "open"
      ? "understand"
      : (latestViewerStepEarly && VIEWER_STEP_KIND_TO_STEP_ID[latestViewerStepEarly.kind]) ??
        FRAME_TO_STEP[session.currentFrame];
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

  // `master-viewer-session` Phase 2 — overlay actions referenced
  // via refs so the URL→state effect can call them without listing
  // them as deps. `chatStoreState` itself was destructured at the
  // top of the component (needed early for the StepStrip pill
  // derivation).
  const pushOverlayRef = useRef(pushOverlay);
  const popOverlayRef = useRef(popOverlay);
  pushOverlayRef.current = pushOverlay;
  popOverlayRef.current = popOverlay;

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
        console.warn(
          `[OnboardingShell] URL bucket ${bucketFromUrl} doesn't match registry bucket ${scenarioRegistry.bucketId}; activating scenario anyway.`,
        );
      }
      // Pop any stale sign-up overlay so the SignUpWidget doesn't render
      // over the sample's canvas (the picker branch below already does this;
      // this branch returned early without it — a navigate from
      // /onboarding/signup → a sample URL left the overlay stuck).
      popOverlayRef.current("sign-up");
      pickScenarioRef.current(params.scenarioId as Scenario);
      return;
    }
    if (path.endsWith("/onboarding/signup")) {
      // `master-viewer-session` Phase 2 — overlay is now the source of
      // truth for the sign-up surface. The legacy `openGate("byo")`
      // call STAYS for now because the chat-side `GateChatPanel` still
      // reads `gate.status` (Phase 6 migrates that side too).
      pushOverlayRef.current({ kind: "sign-up", state: "pending" });
      openGateRef.current("byo");
      return;
    }
    if (path === "/onboarding" || path === "/onboarding/") {
      // Picker. advanceFrame("f1") deactivates any entity AND clears
      // the legacy signupOpen + gate state. Pop the sign-up overlay
      // so the canvas-side overlay disappears in lockstep with the
      // chat-side reset.
      popOverlayRef.current("sign-up");
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
        substeps: analyzeSubsteps(session.currentFrame, session.gate.status === "open"),
      },
      { id: "integrate", label: "4 Integrate", state: pillState("integrate", currentStep, completedSteps, signedIn, scenarioPicked) },
    ];
  }, [currentStep, completedSteps, appMode.authState, session.currentFrame, session.scenario, session.gate.status]);

  const handleStepClick = useCallback(
    (stepId: StepId) => {
      if (stepId === "integrate" && appMode.authState !== "signed-in") return;
      // Understand + Analyze need a scenario; on F1 the user must click a
      // sample card (or BYO) first.
      if ((stepId === "understand" || stepId === "analyze") && session.scenario == null) return;
      if (stepId === "ingest") {
        // Returning to the F1 picker is a URL navigation. The session
        // scenario gets cleared by the URL→state effect; AppShell
        // underneath keeps rendering whatever the canvas resolves to
        // (likely UnderstandView's BYO placeholder during the brief
        // return window before F1 covers it).
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
    [advanceFrame, appMode.authState, isF1, navigate, session.scenario],
  );

  // WF-01 C3 (2026-05-28). Sub-pill clicks (Extract / Interact / Report)
  // route directly to the corresponding F-frame.
  // 2026-05-29-smart-report-screen Phase 1 — Report is now reachable for all
  // scenarios and routes to f4 (the render surface), no longer mis-routed to
  // f7 (Integrate).
  const handleSubstepClick = useCallback(
    (subId: "extract" | "interact" | "report") => {
      if (session.scenario == null) return;
      const frameBySub: Record<typeof subId, FFrame> = {
        extract: "f3",
        interact: "f5",
        report: "f4",
      };
      advanceFrame(frameBySub[subId]);
    },
    [advanceFrame, session.scenario],
  );

  // F6a — Book a Call · Calendly embed.
  // Activated by `?bookCall=1` in the URL (set by the GateChatRail's
  // Book-a-call CTA). Lives on the same route as F2-F7 so all back-
  // button / reload semantics work out of the box: the URL is the
  // source of truth. When the param is present we override BOTH the
  // canvas (Calendly iframe) and the gate chat (BookingStatusCard).
  // The rest of the shell stays put — StepStrip remains visible on
  // top, the nav stays mounted in its compact/expanded state.
  const bookCallActive = new URLSearchParams(location.search).get("bookCall") === "1";

  // `master-viewer-session` Phase 2 — gate-as-overlay. The sign-up
  // surface is now `viewer.overlays.find(o => o.kind === "sign-up")`.
  // The legacy `gate.status === "open"` check is preserved transitionally
  // (Phase 6 moves the chat-side off it too) so a committed identity
  // still mounts `<SignUpWidget />` for the post-commit confirmation
  // beat. New URL-driven flows push/pop the overlay; ExtractView's
  // 401 path will push an overlay (Phase 5/6 cleanup).
  //
  // Canvas precedence:
  //   1. bookCall=1                → BookCallView (highest; user opted into calendar from inside gate)
  //   2. sign-up overlay present   → SignUpWidget renders on top of underlying step
  //   3. gate.status === committed → SignUpWidget (transitional; chat shows confirmation)
  //   4. currentFrame switch       → IngestView / UnderstandView / ExtractView / ...
  const activeChatSession =
    chatStoreState.activeSessionId != null
      ? chatStoreState.sessions.get(chatStoreState.activeSessionId)
      : null;
  const signupOverlay =
    activeChatSession?.viewer.overlays.find((o) => o.kind === "sign-up") ?? null;
  // Transitional bridge: until Phase 6 migrates the chat-side gate
  // off `gate.status`, render the SignUpWidget when the legacy gate
  // is open OR committed (intent-driven flows still flip `gate.status`
  // imperatively via `openGate(...)`). New flows push the overlay.
  const legacyGateOpenOrCommitted =
    session.gate.status === "open" || session.gate.status === "committed";
  const signupSurfaceActive = signupOverlay != null || legacyGateOpenOrCommitted;

  // post-mvs-cleanup Phase B — canvas switches on `viewer.currentStep.kind`
  // (driven by the viewer session) instead of the legacy `currentFrame`
  // slot. Frame-only navigations (StepStrip pill clicks) still call
  // `advanceFrame(...)` which pushes the corresponding ViewerStep onto
  // viewer.history; the projection here picks up the latest step.
  //
  // currentFrame remains a derived getter for backwards compat with
  // StepStrip / pill state computation, but isn't on the render hot path.
  const latestViewerStep =
    activeChatSession && activeChatSession.viewer.currentStep.stepIndex >= 0
      ? activeChatSession.viewer.history[activeChatSession.viewer.currentStep.stepIndex]
      : null;
  // Fallback to currentFrame projection if no step is in history yet
  // (initial mount before any advanceFrame / pickScenario fires).
  const stepKindFallback: import("@/contexts/ChatStoreContext").ViewerStep["kind"] | null = (() => {
    switch (session.currentFrame) {
      case "f1":
        return "ingest-picker";
      case "f2":
        return "doc-viewer";
      case "f3":
      case "f3a":
        return "extract-workbench";
      // 2026-05-29-smart-report-screen Phase 1 — f4 = Report render,
      // f4a = Report builder. Both project to the `report` step kind (was
      // mis-routed to extract-workbench).
      case "f4":
      case "f4a":
        return "report";
      case "f5":
      case "f6":
        return "interact-chat";
      case "f7":
        return "integrate";
      default:
        return null;
    }
  })();
  const effectiveStepKind = latestViewerStep?.kind ?? stepKindFallback;

  const canvasContent = useMemo(() => {
    // 2026-05-30-widget-role-access: gate/book-call canvas widgets are
    // anonymous-context (pre-signup) and not document-scoped → role
    // "anonymous" + scope { type: "none" } satisfy the widget contract.
    if (bookCallActive) return <BookCallView role="anonymous" scope={{ type: "none" }} />;
    // P1 (2026-05-29): the sign-up DOORS moved into the chat rail
    // (GateChatRail). The canvas now pitches the value prop instead of
    // hosting the account form. See GateValueProp + GateChatRail.
    if (signupSurfaceActive)
      return <GateValueProp role="anonymous" scope={{ type: "none" }} />;
    switch (effectiveStepKind) {
      case "ingest-picker":
        // ARCH-06B (2026-05-26): IngestView is rendered ONLY inside
        // the F1 overlay (see render below). The canvas underneath
        // stays blank so the user doesn't see IngestView duplicated
        // during the 700ms return-window before the F1 overlay
        // finishes covering. The brief blank moment is masked by the
        // overlay sliding into place.
        return null;
      case "doc-viewer":
        return <UnderstandView />;
      case "extract-workbench":
        // Per spec (`project_spec_frames.md`), F3 / F3a / F4 are three
        // surfaces of the same extraction-workbench widget. ExtractView
        // is the workbench shell.
        return <ExtractView />;
      case "interact-chat":
        return <InteractView />;
      case "report":
        // 2026-05-29-smart-report-screen Phase 1/3 — `report` is the step kind
        // for BOTH f4 (render) and f4a (builder). Disambiguate by the active
        // frame: f4a → the builder route (placeholder, Phase 4), else → the
        // production render surface (f4 / S3).
        return session.currentFrame === "f4a" ? <ReportBuilderView /> : <ReportRenderView />;
      case "integrate":
        return <IntegrateView />;
      default:
        return null;
    }
  }, [bookCallActive, signupSurfaceActive, effectiveStepKind, session.currentFrame]);

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
          <StepStrip steps={steps} onStepClick={handleStepClick} onSubstepClick={handleSubstepClick} compact={stripCompact} />
        </Box>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        <IngestView />
      </Box>
    </Box>
  );

  // ARCH-06B (2026-05-26): F1 ↔ F2 transition is now driven by the
  // AnimatePresence on the F1 overlay in render below; the previous
  // transitionPhase state machine + setTimeout-based leaving-snapshot
  // ref was retired when the dual-shell mount pattern was replaced
  // by a single AppShell + overlay model. AppShell stays mounted at
  // all times; F1 enters/exits over top of it. See animation spec
  // constants at the top of this file.
  const reducedMotion = useReducedMotion();

  // Nav-collapse state. The previous useOnboardingNavCollapsed hook
  // read from localStorage and could leave stale `true` values from
  // before the chevron-toggle removal (2026-05-25). Force the
  // expanded mode unconditionally for onboarding — the rail (48px)
  // mode is no longer reachable via UI and is not what the wireframe
  // calls for. Below 900px the AppShell renders the nav inside a
  // drawer (where the slim 156px expanded form still fits fine), so
  // we don't need a viewport-conditional branch here.
  //
  // Also actively clear any stale localStorage value on mount so a
  // returning user whose previous session had collapsed=true gets a
  // clean slate — without this, the persisted value would still
  // affect SteadyShell (which still consults the hook).
  const navCollapsed = false;
  // No-op accepts a boolean to keep the callsite signature stable
  // (OnboardingNav's onToggleCollapsed prop type). The arg is ignored
  // because the chevron toggle was removed 2026-05-25.
  const setNavCollapsed = (_next: boolean): void => {};
  useEffect(() => {
    try {
      window.localStorage.removeItem("groundx-onboarding.nav-collapsed.v1");
    } catch {
      // localStorage disabled — nothing to clear.
    }
  }, []);
  const handleNavItemClick = useCallback(
    (key: OnboardingNavItemKey) => {
      // Task #52: Workspaces and Projects are the steady-mode app surfaces.
      // Switching to them is a full mode change (different chrome, different
      // routes, different state machine). We hard-reload instead of
      // client-side routing so the onboarding-mode contexts unmount cleanly
      // and the steady-mode app boots fresh. Logged-out users see these as
      // disabled in the nav, so this branch only fires post-sign-in.
      if (key === "workspaces") {
        window.location.assign("/workspaces");
        return;
      }
      if (key === "projects") {
        window.location.assign("/projects");
        return;
      }
      // Docs is the public docs site — open in a new tab so the user
      // doesn't lose the onboarding flow.
      if (key === "docs") {
        window.open("https://docs.groundx.ai", "_blank", "noopener,noreferrer");
        return;
      }
      // Book a call CTA → Calendly. URL is env-driven so on-prem /
      // demo deploys can point at their own calendar. When unset, we
      // skip the open (the previous hardcoded `calendly.com/groundx/30min`
      // returns a 404 today). UI-08 / airgap-audit Gap 2 carries the
      // long-term wire-up (gate_event + per-deploy URL).
      if (key === "call") {
        const calendlyUrl = import.meta.env.VITE_CALENDLY_URL as string | undefined;
        if (calendlyUrl) {
          window.open(calendlyUrl, "_blank", "noopener,noreferrer");
        } else {
          console.warn(
            "[OnboardingShell] Book-a-call clicked but VITE_CALENDLY_URL is unset. Set the env to wire this CTA.",
          );
        }
        return;
      }
      // Settings is in-app for signed-in users — client-side route.
      if (key === "settings") {
        navigate("/settings");
        return;
      }
      // support, anything else: no-op for now.
    },
    [navigate],
  );

  // The chat + canvas split that lives in the right-of-nav slot for
  // F2+. The chat column hosts GateChatPanel; the canvas hosts the
  // active frame view with the StepStrip on top.
  const chatIdle = (
    <Box
      data-testid="onboarding-shell-chat-pane"
      sx={{
        // width: 100% + flex: 1 so the chat column fills the AppShell's
        // motion.section width (which is set in px via the drag-resize
        // handle). Without width:100%, a flex-row parent only stretches
        // children on the cross axis, so the inner content would clamp
        // to its intrinsic width and leave whitespace on the right.
        width: "100%",
        flex: 1,
        height: "100%",
        // WARM_OFFWHITE — same tone as the nav rail. Gives the chat
        // pane a distinct surface from the WHITE canvas next to it so
        // the chat ↔ canvas divide reads cleanly even without the
        // resize-handle hairline. Chat bubbles + the input bar each
        // retain their own white/cyan surfaces, so they pop crisply
        // against this warm-tinted column.
        backgroundColor: WARM_OFFWHITE,
        overflow: "auto",
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
      aria-label="Chat column"
    >
      {/* 2026-05-30-widget-role-access: ChatColumn is all-roles and
          locks no affordance by role today; `role` is sourced from the
          auth state (uncommitted onboarding → `anonymous`, signed-in →
          `member`), NEVER from the conversation flow. Chat is
          session-scoped → `scope: { type: "none" }`. (The flow
          `mode`/`surface` prop was removed by unified-conversation-flow
          Phase 2 — chat is now one `ConversationFlow` + an experience.) */}
      {bookCallActive ? (
        <BookingStatusCard role={widgetRole} scope={{ type: "none" }} />
      ) : (
        <ChatColumn role={widgetRole} scope={{ type: "none" }} />
      )}
    </Box>
  );

  const canvasIdle = (
    <Box
      data-testid="onboarding-shell-canvas-pane"
      sx={{
        // Same stretching contract as chatIdle — fill the AppShell's
        // canvas motion.section width so PdfViewer and other widgets
        // get the full pane to work with. The StepStrip used to live
        // inside this pane; it now sits in AppShell's `header` slot
        // (see below) so it can span both chat + canvas.
        width: "100%",
        flex: 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: WHITE,
      }}
    >
      <Box
        sx={{ flex: 1, overflow: "hidden", minHeight: 0, height: "100%" }}
        // When isF1, the AppShell canvas slot is intentionally empty
        // (F1 overlay covers it). Omit the testid so it doesn't
        // duplicate the F1 overlay's own `onboarding-frame-f1` and
        // break selector-based assertions.
        data-testid={isF1 ? undefined : `onboarding-frame-${session.currentFrame}`}
      >
        {canvasContent}
      </Box>
    </Box>
  );

  // StepStrip lifted out of the canvas pane (2026-05-26) so it spans
  // both chat + canvas. AppShell renders this in its `header` slot
  // (right of nav, above the chat | canvas split). The bottom border
  // here matches the visual treatment it had inside the canvas pane.
  //
  // px:2 (was px:3) — when the strip lived in the canvas pane the
  // 3-step inset matched the surrounding view paddings. Now that the
  // strip spans both panes (each of which has its own internal
  // padding), the wider header inset earns less; 2-step gives the
  // strip another 16 px of usable width so it stays on its full pill
  // chain down to viewport 947 px.
  const headerStrip = (
    <Box
      sx={{
        borderBottom: `1px solid ${BORDER}`,
        backgroundColor: WHITE,
        px: 2,
      }}
    >
      <StepStrip steps={steps} onStepClick={handleStepClick} onSubstepClick={handleSubstepClick} compact={stripCompact} />
    </Box>
  );

  // OnboardingNav is the AppShell's nav slot. It's always mounted now
  // (ARCH-06B 2026-05-26): F1 used to NOT mount the AppShell at all,
  // so the nav literally wasn't in the DOM on the picker. Today
  // AppShell is the canonical underlay and F1 floats over it as an
  // overlay — the nav is in the DOM, just visually obscured while F1
  // covers the viewport. When F1 dismisses, the nav is revealed.
  const navIdle = (
    <OnboardingNav
      accountState="loggedOut"
      collapsed={navCollapsed}
      onToggleCollapsed={() => setNavCollapsed(!navCollapsed)}
      onItemClick={handleNavItemClick}
      onLogoClick={() => navigate("/onboarding")}
    />
  );

  // ARCH-06B transitions — see the locked spec at the top of this file.
  // F2 zoom (the AppShell underneath) and F1 overlay translate/fade are
  // expressed as framer-motion variants so the reduced-motion gate
  // collapses both to instant on the appropriate setting.
  const f2ZoomAnimate = isF1
    ? { scale: F2_ZOOM_SCALE, opacity: F2_ZOOM_OPACITY }
    : { scale: 1, opacity: 1 };
  const f2ZoomTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: isF1 ? F1_RETURN_DURATION_S : F1_DISMISS_DURATION_S,
        ease: F1_OVERLAY_EASE,
      };

  return (
    <Box
      sx={{ position: "relative", height: "100vh", overflow: "hidden", backgroundColor: WHITE }}
      data-testid="onboarding-shell"
    >
      {/* Dev-only diagnostic overlay — gated on `?navdebug=1` URL param.
          Used to trace cross-browser viewport / breakpoint discrepancies
          (e.g. user-side Chrome shows AppShell compact at 1325px while
          headless-Chromium preview shows it expanded). Safe to leave
          mounted: the component returns null unless the flag is set. */}
      <NavDebugOverlay />

      {/* AppShell — always mounted, the canonical underneath. Wrapped
          in a motion.div so the entire shell does a subtle scale +
          opacity settle when F1 dismisses (and the inverse when F1
          returns), reinforcing the "shell coming into focus" feel
          without any one element doing the heavy lift. */}
      <motion.div
        data-testid="onboarding-shell-underneath"
        // WF-01 C1 (2026-05-28). While F1 is up, the underneath shell is
        // visually masked by the opaque F1 overlay AND must be hidden
        // from assistive tech + keyboard navigation. `aria-hidden`
        // pulls it out of the a11y tree; `inert` blocks focus + click
        // (React 19's first-class attr; we set it as a string for
        // React 18 forward-compat).
        aria-hidden={isF1 || undefined}
        {...(isF1 ? { inert: "" as unknown as undefined } : {})}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          transformOrigin: "center center",
        }}
        animate={f2ZoomAnimate}
        transition={f2ZoomTransition}
      >
        {/* ARCH-06B (2026-05-26): keep AppShell fully populated even
            on F1. Toggling hideNav/hideChat would re-trigger AppShell's
            internal AnimatePresence width-grow on nav + chat as F1
            lifts away — visually competing with the F1 overlay's lift.
            With nav/chat always mounted, the underneath shell is
            stable; only the wrapper's F2 zoom + the F1 overlay's lift
            play during the transition. The user sees the shell as
            "always already there." */}
        <AppShell
          nav={navIdle}
          header={headerStrip}
          chat={chatIdle}
          canvas={canvasIdle}
          initialChatWidth={360}
          navWidth={navCollapsed ? ONBOARDING_NAV_WIDTH_COLLAPSED : ONBOARDING_NAV_WIDTH_FULL}
        />
      </motion.div>

      {/* F1 overlay — the picker floats on top of the always-there
          AppShell. Lifts up on dismiss (900ms, opacity held till 70%
          for a tactile lift instead of dissolve), returns down on
          Ingest-pill click (700ms, opacity fades in over first 30%).
          AnimatePresence drives the mount/unmount via the isF1 flag;
          initial={false} suppresses the entrance animation on first
          page load so users landing on /onboarding don't see F1 fly
          in from above. */}
      <AnimatePresence initial={false}>
        {isF1 ? (
          <motion.div
            key="f1-overlay"
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
            initial={{ y: "-100%", opacity: 0 }}
            animate={{
              y: "0%",
              opacity: 1,
              transition: reducedMotion
                ? { duration: 0 }
                : {
                    y: { duration: F1_RETURN_DURATION_S, ease: F1_OVERLAY_EASE },
                    opacity: {
                      duration: F1_RETURN_DURATION_S * F1_OPACITY_PORTION,
                      ease: F1_OVERLAY_EASE,
                    },
                  },
            }}
            exit={{
              y: "-100%",
              opacity: 0,
              transition: reducedMotion
                ? { duration: 0 }
                : {
                    y: { duration: F1_DISMISS_DURATION_S, ease: F1_OVERLAY_EASE },
                    opacity: {
                      duration: F1_DISMISS_DURATION_S * F1_OPACITY_PORTION,
                      ease: F1_OVERLAY_EASE,
                      delay: F1_DISMISS_DURATION_S * (1 - F1_OPACITY_PORTION),
                    },
                  },
            }}
          >
            {f1Layout}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Box>
  );
};
