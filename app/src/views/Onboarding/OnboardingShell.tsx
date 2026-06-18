import Box from "@mui/material/Box";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type FC } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import {
  BORDER,
  ONBOARDING_NAV_WIDTH_COLLAPSED,
  ONBOARDING_NAV_WIDTH_FULL,
  PICKER_MAX_WIDTH,
  PICKER_MAX_WIDTH_ULTRAWIDE,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import { useApi } from "@/contexts/ApiContext";
import { useAppMode } from "@/contexts/AppModeContext";
import { useWidgetRole } from "@/lib/widgetRole";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { selectActiveStep, useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";
import { AppShell } from "@/components/layout/AppShell";
import { OnboardingNav } from "@/components/layout/OnboardingNav/OnboardingNav";
import type { OnboardingNavItemKey } from "@/components/layout/OnboardingNav/OnboardingNav";
import { StepStrip } from "@/components/layout/StepStrip";
import type { AnalyzeSubstep, StepDescriptor, StepId, StepPillState } from "@/components/layout/StepStrip";
import {
  JOURNEY_CATALOG,
  VIEWER_STEP_TO_JOURNEY,
  viewerStepDiagnosticId,
} from "@/components/layout/StepStrip/journeyCatalog";
import type { Scenario } from "@/types/onboarding";

import type { ContentScope } from "@groundx/shared";

import { BookCallView, type BookCallEmbedState } from "@/components/viewer-widgets/BookCallView/BookCallView";
import { SignUpWidget } from "@/components/viewer-widgets/SignUpWidget/SignUpWidget";
import { ScopedCanvas } from "@/components/layout/ScopedCanvas/ScopedCanvas";
import { ViewerWidgetFrame } from "@/components/layout/ViewerWidgetFrame/ViewerWidgetFrame";
import { IngestView } from "./IngestView";
import { ChatColumn } from "@/components/chat-widgets/ChatColumn/ChatColumn";
import { NavDebugOverlay } from "./NavDebugOverlay";
import { isResolvedDocumentId } from "@/api/documentId";
import { viewerOverlayFrameDescriptors } from "./viewerOverlayFrameDescriptors";

// ─────────────────────────────────────────────────────────────────────
// ARCH-06 ingest-picker overlay animation spec (locked 2026-05-26).
//
// Mental model: the ingest picker is an OVERLAY on top of the canonical
// AppShell canvas. When the user picks a sample / clicks BYO, the picker
// lifts up off the top edge to reveal what was always underneath. When
// they click the Ingest pill, the picker returns over the top.
//
// Spec — A · Sheet dismiss (Iris/Curtain alternatives evaluated &
// rejected; A is the "premium calm" choice for a first-impression
// surface that ages well on repeat visits):
//
//   • Easing: cubic-bezier(0.32, 0.72, 0, 1) — iOS-style ease-out
//     curve. Front-loaded distance, no overshoot.
//   • Dismiss (picker leaves, 900ms): translates Y 0 → -100%; opacity
//     holds at 1 through the first 70% of the timeline, then wipes
//     1 → 0 over the final 30% (270ms). The held-opacity window
//     reads as a physical lift instead of a dissolve.
//   • Return (picker comes back, 700ms): translates Y -100% → 0;
//     opacity fades 0 → 1 over the first 30% (210ms), then holds.
//     Asymmetric duration is intentional — return is slightly
//     snappier so users don't feel "stuck on the picker" when bouncing back.
//   • Canvas zoom: scale 0.985 → 1, opacity 0.92 → 1 on dismiss; inverse
//     on return. Deliberately subtle (~1.5% scale) so it reads as
//     "settling into focus" rather than swelling.
//   • Reduced motion: animations bypassed; instant swap.
// ─────────────────────────────────────────────────────────────────────
const PICKER_DISMISS_DURATION_S = 0.9;
const PICKER_RETURN_DURATION_S = 0.7;
const PICKER_OPACITY_PORTION = 0.3; // 30% of the duration for the fade tail
const PICKER_OVERLAY_EASE = [0.32, 0.72, 0, 1] as const;
const CANVAS_ZOOM_SCALE = 0.985;
const CANVAS_ZOOM_OPACITY = 0.92;

// standardized-viewer-control T3 — the current journey stage sources off the
// active ViewerStep kind via `VIEWER_STEP_TO_JOURNEY` (no fallback), and the
// reached-set is an in-memory SET of reached stages. The canvas surface is a
// pure function of the active ViewerStep; there is no frame vocabulary on any
// of these paths.

// Linear journey order. The progress gate (2026-06-12) uses this to forbid
// JUMPING AHEAD of the step the user has actually reached.
const STEP_ORDER: StepId[] = ["ingest", "understand", "analyze", "integrate"];
const stepRank = (s: StepId): number => STEP_ORDER.indexOf(s);

function pillState(
  stepId: StepId,
  currentStep: StepId,
  completed: Set<StepId>,
  authSignedIn: boolean,
  scenarioPicked: boolean,
): StepPillState {
  if (stepId === currentStep) return "active";
  if (completed.has(stepId)) return "done-traversed";
  // Integrate is reachable only after sign-in (post-gate). AUTH-gated, not
  // progress-gated — a signed-in user reaches it from anywhere.
  if (stepId === "integrate" && !authSignedIn) return "disabled";
  // Understand, Analyze can't be jumped to until a sample is picked on the
  // ingest picker — they need a scenario to render anything meaningful.
  if ((stepId === "understand" || stepId === "analyze") && !scenarioPicked) return "disabled";
  // Progress gate (2026-06-12): you cannot jump AHEAD of the step you're on.
  // Analyze stays disabled until the user has actually reached it (the guided
  // flow advances them there). Without this, Report/Extract/Interact were
  // clickable from Understand and dropped the user into a surface that can't
  // render anything yet.
  if (stepId === "analyze" && stepRank(currentStep) < stepRank("analyze")) return "disabled";
  return "reachable-todo";
}

function analyzeSubsteps(
  activeSubstep: AnalyzeSubstep | undefined,
  gateOpen = false,
  analyzeReached = true,
): StepDescriptor["substeps"] {
  // standardized-viewer-control T3 — the active sub-pill is sourced off the
  // active ViewerStep kind's substep (via `VIEWER_STEP_TO_JOURNEY`), NOT the
  // frame. `extract-workbench` → extract, `interact-chat` → interact, `report`
  // → report. The render-vs-builder split (`report.surface`) doesn't change the
  // sub-pill — both are the Report sub-step.
  //
  // P1 (2026-05-29): while the sign-up gate is open the strip sits on
  // Understand, so the Analyze bracket shows no active sub-step (otherwise
  // both Understand and Interact would read as active at once).
  const extractActive = !gateOpen && activeSubstep === "extract";
  const interactActive = !gateOpen && activeSubstep === "interact";
  // Report is reachable for ALL scenarios once Analyze is reached (anon
  // previews the render surface; export/Save locked).
  const reportActive = !gateOpen && activeSubstep === "report";
  // Progress gate (2026-06-12): the Analyze sub-pills are DISABLED until the
  // user has reached the Analyze step — no jumping ahead from Understand. Once
  // on/past Analyze they are reachable again (same-bracket navigation between
  // Extract/Interact/Report). The currently active sub-pill always stays active.
  const subState = (active: boolean): StepPillState =>
    active ? "active" : analyzeReached ? "reachable-todo" : "disabled";
  const substeps = JOURNEY_CATALOG.analyze.substeps!;
  return [
    { id: "extract", label: substeps.extract.label, state: subState(extractActive) },
    { id: "interact", label: substeps.interact.label, state: subState(interactActive) },
    { id: "report", label: substeps.report.label, state: subState(reportActive) },
  ];
}

/**
 * OnboardingShell — composes the onboarding journey behind a shared
 * shell-level left-rail nav. The journey is a sequence of viewer steps,
 * not a frame machine; the only special surface is the ingest-picker
 * overlay that floats over the canvas before a sample is active.
 *
 *   • OnboardingNav lives at the shell root, mounted throughout. It owns
 *     its own collapsed/expanded state (chevron) and never animates during
 *     the picker ↔ canvas transition.
 *   • Ingest picker — the right-of-nav slot is the full-width picker
 *     (StepStrip on top, IngestView below). No chat column.
 *   • Active sample — the right-of-nav slot is the AppShell chat | canvas
 *     split. Chat column hosts ConversationFlow; canvas hosts the
 *     active ScopedViewerWidget via `<ScopedCanvas>` and viewer
 *     overlays such as sign-in and booking.
 *   • The picker ↔ shell transition slides ONLY chat + canvas; the nav
 *     is stable.
 *
 * Step strip lives at the top of the canvas (or the top of the picker),
 * NOT in the nav.
 */
export const OnboardingShell: FC = () => {
  const api = useApi();
  const { state: appMode } = useAppMode();
  const widgetRole = useWidgetRole();
  const { state: session, bootstrapSession, openGate, dismissGate, commitGate } = useOnboardingSession();
  // standardized-viewer-control T6 — the step-strip pills, Analyze sub-pills,
  // the post-gate "Continue to Integrate", and the Understand pill MOVE the
  // canvas ONLY by dispatching the corresponding intent (the single
  // viewer-mutation seam). OnboardingShell is always mounted inside
  // `CanvasOrchestratorProvider` (App.tsx + renderWithOnboardingProviders), so
  // the required hook is safe here.
  const { dispatch } = useCanvasOrchestrator();
  const { state: scenarioRegistry, byId: scenarioById } = useScenarioRegistry();
  // ChatStore is read up here so the StepStrip pill state below can
  // derive from the active ViewerStep (citation clicks push a
  // doc-viewer step → nav highlight follows the canvas swap, see
  // master-viewer-session). The same `chatStoreState` is used later
  // for overlay reads + canvas-content selection.
  const { state: chatStoreState, pushOverlay, popOverlay, appendAgentMessage } = useChatStore();
  const params = useParams<{ bucketId?: string; scenarioId?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const bookCallActive = new URLSearchParams(location.search).get("bookCall") === "1";
  const [bookCallEmbedState, setBookCallEmbedState] = useState<BookCallEmbedState>("initializing");
  const routeSignUpActive = location.pathname.endsWith("/onboarding/signup");
  const activeChatSessionEarly =
    chatStoreState.activeSessionId != null
      ? chatStoreState.sessions.get(chatStoreState.activeSessionId)
      : null;
  const signupOverlayEarly =
    activeChatSessionEarly?.viewer.overlays.find((o) => o.kind === "sign-up") ?? null;
  const signupSurfaceActiveEarly = routeSignUpActive || signupOverlayEarly != null;
  const activeEntityKeyEarly = activeChatSessionEarly?.activeEntityKey ?? null;
  const latestViewerStepEarly = selectActiveStep(activeChatSessionEarly);
  // standardized-viewer-control T3 — the StepStrip's CURRENT STAGE is sourced
  // off the active ViewerStep kind via the shared `VIEWER_STEP_TO_JOURNEY` map
  // (single source, also read by the viewer nav). The active step is always
  // present (seeded on mount, pushed on every dispatch thereafter). Clickable
  // citations push a `doc-viewer` step → maps to the Understand pill, so the nav
  // indicator matches what the canvas surfaces.
  // The only non-step source is the pre-scenario sign-up surface (no active
  // entity yet); absent both, the journey hasn't started → Ingest.
  const activeJourney = latestViewerStepEarly
    ? VIEWER_STEP_TO_JOURNEY[latestViewerStepEarly.kind]
    : undefined;
  const currentStep: StepId =
    signupSurfaceActiveEarly && session.scenario == null
      ? "ingest"
      : activeJourney?.step ?? "ingest";
  // standardized-viewer-control T6 — `isIngestPicker` (the ingest-picker overlay gate)
  // reads the ACTIVE STEP KIND. The picker is up when the active viewer step is
  // `ingest-picker` (the step the return-to-picker path pushes), OR when no step
  // has landed yet AND no scenario is active (the first-mount / deactivated
  // state, which the strip resolves to Ingest). Book-call / sign-up surfaces
  // suppress it (they overlay the canvas).
  const isIngestPicker =
    (latestViewerStepEarly
      ? latestViewerStepEarly.kind === "ingest-picker"
      : session.scenario == null) &&
    !bookCallActive &&
    !signupSurfaceActiveEarly;

  useEffect(() => {
    if (bookCallActive) setBookCallEmbedState("initializing");
  }, [bookCallActive]);

  // -- URL ↔ surface sync ----------------------------------------
  //
  // The URL is the source of truth for which surface is mounted:
  //   /onboarding                                  → ingest picker
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
  // Refs to the latest session actions + the orchestrator dispatch so the
  // useEffect below has stable references. The actions themselves are stable
  // (useCallback []), but they depend on `registry` which we don't pass into
  // the dep array — keep refs to dodge exhaustive-deps complaints without
  // re-firing on identity.
  const openGateRef = useRef(openGate);
  const dispatchRef = useRef(dispatch);
  const activeScenarioRef = useRef(session.scenario);
  const activeEntityKeyRef = useRef(activeEntityKeyEarly);
  const appScenarioRef = useRef(appMode.scenario);
  openGateRef.current = openGate;
  dispatchRef.current = dispatch;
  activeScenarioRef.current = session.scenario;
  activeEntityKeyRef.current = activeEntityKeyEarly;
  appScenarioRef.current = appMode.scenario;

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
      const targetEntityKey = `sample:${params.scenarioId}`;
      const sampleAlreadyActive =
        activeScenarioRef.current === params.scenarioId ||
        activeEntityKeyRef.current === targetEntityKey ||
        appScenarioRef.current === params.scenarioId;
      if (!sampleAlreadyActive) {
        // Activate the sample through the ONE dispatch seam — `showSample`'s
        // orchestrator handler calls `pickScenario` (resume-preserving,
        // idempotent on an already-active entity). No view reaches into the
        // session mutators directly; the deep-link mirrors IngestView's
        // sample-card click.
        dispatchRef.current({ kind: "showSample", scenario: params.scenarioId as Scenario }, "user");
      }
      return;
    }
    if (path.endsWith("/onboarding/signup")) {
      // `master-viewer-session` Phase 2 — overlay is now the source of
      // truth for the sign-up surface. `openGate("byo")` keeps lifecycle
      // analytics in sync, but it no longer swaps the chat column out of
      // ConversationFlow.
      pushOverlayRef.current({ kind: "sign-up", state: "pending" });
      openGateRef.current("byo");
      return;
    }
    if (path === "/onboarding" || path === "/onboarding/") {
      // Picker. standardized-viewer-control deletion-phase — dispatch the generic
      // `presentExperienceBeat` `ingest-picker` beat through the STANDARD seam.
      // The beat handler deactivates any active entity AND resets an open gate,
      // and pushes the ingest-picker step. Pop the
      // sign-up overlay so the viewer-side overlay disappears in lockstep with the
      // route/session reset.
      popOverlayRef.current("sign-up");
      dispatchRef.current({ kind: "presentExperienceBeat", beat: { kind: "ingest-picker" } }, "user");
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
    api.session.ensureAnonSession()
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
  }, [api.session, bootstrapSession, session.sessionId]);

  // standardized-viewer-control T6b — the reached-set drives the strip
  // checkmarks. It is a SET of reached stages (NOT a monotonic high-water value
  // — R3): `integrate` is auth-gated and reachable from anywhere, so the set is
  // genuinely non-contiguous. A stage is ADDED on its FIRST reach and never
  // removed, so a later citation jump back to Understand (which moves the current
  // stage off Analyze) does not re-lock the already-traversed bracket.
  //
  // SINGLE SOURCE OF TRUTH: the durable, persisted + server-twinned
  // `EntitySession.reachedStages` (written by `markStageReached`/`pickScenario`,
  // projected onto `session.reachedStages`). The strip reads THAT set unioned
  // with the current step. The union covers two windows the durable set hasn't
  // caught up on yet: (a) the brief render BEFORE `markStageReached` commits the
  // new stage, and (b) the no-entity case (pre-scenario / signup surface), where
  // the durable set is empty but the current stage always shows. Because the
  // durable set survives reload (ChatStore serialize/parse + the DB twin),
  // cross-reload checkmarks are now restored verbatim — no strip-local
  // re-accumulation that resets to the resumed step on hydrate.
  // `StepId` is an alias of the shared `JourneyStage`, so `session.reachedStages`
  // (a `ReadonlySet<JourneyStage>`) is directly a `ReadonlySet<StepId>` — no cast.
  const reachedStages = useMemo<Set<StepId>>(() => {
    const set = new Set<StepId>(session.reachedStages);
    set.add(currentStep);
    return set;
  }, [session.reachedStages, currentStep]);
  // The reached-set drives the done/traversed checkmarks. A stage is "completed"
  // (checkmark) only when it has been reached AND is not the one the user is on.
  const completedSteps = useMemo(() => {
    const set = new Set(reachedStages);
    set.delete(currentStep);
    return set;
  }, [reachedStages, currentStep]);

  // The active Analyze sub-step, sourced off the active ViewerStep kind (T3) —
  // never the frame. `extract-workbench` → extract, `interact-chat` → interact,
  // `report` → report.
  const activeSubstep: AnalyzeSubstep | undefined = activeJourney?.substep;

  const steps: StepDescriptor[] = useMemo(() => {
    const signedIn = appMode.authState === "signed-in";
    const scenarioPicked = session.scenario != null;
    // Analyze is "reached" once the user is on/past it, OR has already been
    // reached (so a citation-click that resets currentStep to Understand
    // doesn't re-lock a bracket the user already traversed — the reached-SET
    // retains `analyze`).
    const analyzeReached =
      stepRank(currentStep) >= stepRank("analyze") || reachedStages.has("analyze");
    return [
      { id: "ingest", label: JOURNEY_CATALOG.ingest.stepLabel, state: pillState("ingest", currentStep, completedSteps, signedIn, scenarioPicked) },
      { id: "understand", label: JOURNEY_CATALOG.understand.stepLabel, state: pillState("understand", currentStep, completedSteps, signedIn, scenarioPicked) },
      {
        id: "analyze",
        label: JOURNEY_CATALOG.analyze.stepLabel,
        state: pillState("analyze", currentStep, completedSteps, signedIn, scenarioPicked),
        substeps: analyzeSubsteps(activeSubstep, session.gate.status === "open", analyzeReached),
      },
      { id: "integrate", label: JOURNEY_CATALOG.integrate.stepLabel, state: pillState("integrate", currentStep, completedSteps, signedIn, scenarioPicked) },
    ];
  }, [currentStep, completedSteps, reachedStages, activeSubstep, appMode.authState, session.scenario, session.gate.status]);

  // standardized-viewer-control T6 — the navigation scope the step-strip /
  // sub-pill dispatches carry. `showExtract`/`showInteract` are document-scoped
  // (the active scenario's primary document); the orchestrator resolves the doc
  // from this scope so the shared widgets aren't doc-less. `showIntegrate` is
  // session-scoped (connectors are scope-independent — the handler ignores it;
  // mirrors GateChatRail's empty-documents scope). `showReport` uses the
  // bucket+projectId report scope (the GroundX data-org key for the demo).
  const navScenarioId = session.scenario ?? appMode.scenario ?? null;
  const navScenario = navScenarioId ? scenarioById(navScenarioId) : undefined;
  const navDocId = navScenario?.documents?.[0]?.documentId ?? null;
  const navDocScope: ContentScope = useMemo(
    () => (navDocId ? { type: "documents", documentIds: [navDocId] } : { type: "documents", documentIds: [] }),
    [navDocId],
  );
  const navReportScope: ContentScope = useMemo(
    () => ({
      type: "bucket",
      bucketId: scenarioRegistry.bucketId ?? 28454,
      filter: { projectId: navScenario?.projectId ?? "proj_utility" },
    }),
    [scenarioRegistry.bucketId, navScenario?.projectId],
  );

  const handleStepClick = useCallback(
    (stepId: StepId) => {
      if (stepId === "integrate" && appMode.authState !== "signed-in") return;
      // Understand + Analyze need a scenario; on the ingest picker the user
      // must click a sample card (or BYO) first.
      if ((stepId === "understand" || stepId === "analyze") && session.scenario == null) return;
      if (stepId === "ingest") {
        // Returning to the ingest picker is a URL navigation. The session
        // scenario gets cleared by the URL→state effect; AppShell
        // underneath keeps rendering whatever the canvas resolves to
        // (likely UnderstandView's BYO placeholder during the brief
        // return window before the picker covers it).
        navigate("/onboarding");
        return;
      }
      // T6 — each pill MOVES the canvas by dispatching its destination intent
      // (the single seam). The orchestrator's handler layers the onboarding
      // journey-progress (markStageReached) + first-reach analytics on top.
      // (`analyze` has no clickable header — the strip renders it as a bracket
      // GROUP whose sub-pills route through `handleSubstepClick`; only the
      // Pill-rendered steps reach here.)
      switch (stepId) {
        case "understand":
          // Understand = surfacing the active document (the doc-viewer step).
          if (navDocId) dispatch({ kind: "openDocument", documentId: navDocId, page: 1 }, "user");
          break;
        case "integrate":
          dispatch({ kind: "showIntegrate", scope: { type: "documents", documentIds: [] } }, "user");
          break;
      }
    },
    [appMode.authState, dispatch, navDocId, navigate, session.scenario],
  );

  // WF-01 C3 (2026-05-28). Sub-pill clicks (Extract / Interact / Report).
  // standardized-viewer-control T6 — each dispatches its destination intent
  // (showExtract / showInteract / showReport / editTemplate) through the
  // orchestrator, the single viewer-mutation seam.
  // 2026-05-29-smart-report-screen Phase 1 — Report is reachable for all
  // scenarios. report-empty-state: Report routing is TEMPLATE-AWARE — a present
  // report template id → the render surface (`showReport`); absent → the empty
  // builder (`editTemplate`), the new-customer norm (existing-or-new UX).
  // Extract/Interact are unconditional.
  const handleSubstepClick = useCallback(
    (subId: "extract" | "interact" | "report") => {
      if (session.scenario == null) return;
      if (subId === "extract") {
        dispatch(
          { kind: "showExtract", scope: navDocScope, schemaId: navScenarioId ?? "utility" },
          "user",
        );
        return;
      }
      if (subId === "interact") {
        dispatch({ kind: "showInteract", scope: navDocScope }, "user");
        return;
      }
      // Report — template-aware. The render-vs-builder split lives on the pushed
      // `report` step's `surface` field (R4): `showReport` → render, `editTemplate`
      // → builder. The templateId is required by the intent shape; the
      // `editTemplate` handler routes to the builder (which reads the in-memory
      // `reportOverlay` draft) and ignores the id, so the no-template case uses
      // the same `"report-draft"` sentinel SmartReportRender's "open draft
      // builder" button uses.
      const activeReportSession =
        chatStoreState.activeSessionId != null
          ? chatStoreState.sessions.get(chatStoreState.activeSessionId)
          : undefined;
      const loadedTemplateId = activeReportSession?.reportOverlay.templateId;
      if (loadedTemplateId) {
        dispatch({ kind: "showReport", templateId: loadedTemplateId, scope: navReportScope }, "user");
      } else {
        dispatch({ kind: "editTemplate", templateId: "report-draft" }, "user");
      }
    },
    [dispatch, session.scenario, navDocScope, navReportScope, navScenarioId, chatStoreState],
  );

  // Book a Call · Calendly embed.
  // Activated by `?bookCall=1` in the URL (set by the nav CTA, the
  // sign-in viewer, or the book_call tool). Lives on the same route
  // as the active-sample surfaces so all back-
  // button / reload semantics work out of the box: the URL is the
  // source of truth. When the param is present we push a viewer overlay
  // for Calendly and keep the active chat timeline mounted; booking
  // narration arrives as normal chat messages. The rest of the shell
  // stays put — StepStrip remains visible on top, the nav stays mounted
  // in its compact/expanded state.
  const clearBookCallParam = useCallback(
    (replace = false) => {
      const nextParams = new URLSearchParams(location.search);
      nextParams.delete("bookCall");
      const nextSearch = nextParams.toString();
      navigate(
        { pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" },
        { replace },
      );
    },
    [location.pathname, location.search, navigate],
  );
  const handleBookCallScheduled = useCallback(() => {
    commitGate("engineer-call");
    clearBookCallParam(true);
  }, [clearBookCallParam, commitGate]);

  // Canvas precedence:
  //   1. bookCall=1                → BookCallView overlay on the active viewer
  //   2. sign-up overlay/route     → SignUpWidget overlay on the active viewer
  //   3. active viewer step        → ScopedCanvas / ingest picker
  const activeChatSession =
    chatStoreState.activeSessionId != null
      ? chatStoreState.sessions.get(chatStoreState.activeSessionId)
      : null;

  useEffect(() => {
    if (bookCallActive) {
      pushOverlay({ kind: "book-call" });
      return;
    }
    popOverlay("book-call");
  }, [bookCallActive, popOverlay, pushOverlay]);

  const appendAgentMessageRef = useRef(appendAgentMessage);
  appendAgentMessageRef.current = appendAgentMessage;
  const chatStoreStateRef = useRef(chatStoreState);
  chatStoreStateRef.current = chatStoreState;
  const bookingNarrationKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const activeSessionId = chatStoreState.activeSessionId;
    if (!bookCallActive || !activeSessionId) {
      bookingNarrationKeyRef.current = null;
      return undefined;
    }
    const narrationKey = `${activeSessionId}:${location.pathname}:book-call`;
    if (bookingNarrationKeyRef.current === narrationKey) return undefined;
    bookingNarrationKeyRef.current = narrationKey;

    const schedule = [
      {
        delay: 180,
        text: "I'm opening the engineer booking calendar in the viewer now.",
      },
      {
        delay: 760,
        text: "Your conversation stays here while you choose a time.",
      },
      {
        delay: 1380,
        text: "Bring questions about your document type, volume, accuracy goals, where GroundX fits, or pilot scope.",
      },
    ];
    const timers = schedule.map(({ delay, text }) =>
      window.setTimeout(() => {
        const latestState = chatStoreStateRef.current;
        const latestSession = latestState.activeSessionId
          ? latestState.sessions.get(latestState.activeSessionId)
          : null;
        const alreadyInTimeline = latestSession?.messages.some(
          (message) => message.role === "assistant" && message.content === text,
        );
        if (!alreadyInTimeline) appendAgentMessageRef.current(text);
      }, delay),
    );

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      if (bookingNarrationKeyRef.current === narrationKey) {
        bookingNarrationKeyRef.current = null;
      }
    };
  }, [bookCallActive, chatStoreState.activeSessionId, location.pathname]);
  const signupOverlay =
    activeChatSession?.viewer.overlays.find((o) => o.kind === "sign-up") ?? null;
  const signupSurfaceActive = routeSignUpActive || signupOverlay != null;

  const signInNarrationKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const activeSessionId = chatStoreState.activeSessionId;
    if (!signupSurfaceActive || bookCallActive || !activeSessionId) {
      signInNarrationKeyRef.current = null;
      return undefined;
    }
    const trigger =
      session.gate.status === "open" || session.gate.status === "dismissed"
        ? session.gate.trigger
        : "byo";
    const narrationKey = `${activeSessionId}:${location.pathname}:sign-in:${trigger}`;
    if (signInNarrationKeyRef.current === narrationKey) return undefined;
    signInNarrationKeyRef.current = narrationKey;

    const first =
      trigger === "byo"
        ? "I opened sign-in in the viewer so you can bring your own documents into this same session."
        : "I opened sign-in in the viewer and kept this conversation active.";
    const schedule = [
      { delay: 180, text: first },
      {
        delay: 760,
        text: "You can close sign-in to return to the current demo state, or book time with an engineer from the same viewer.",
      },
    ];
    const timers = schedule.map(({ delay, text }) =>
      window.setTimeout(() => {
        const latestState = chatStoreStateRef.current;
        const latestSession = latestState.activeSessionId
          ? latestState.sessions.get(latestState.activeSessionId)
          : null;
        const alreadyInTimeline = latestSession?.messages.some(
          (message) => message.role === "assistant" && message.content === text,
        );
        if (!alreadyInTimeline) appendAgentMessageRef.current(text);
      }, delay),
    );

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
      if (signInNarrationKeyRef.current === narrationKey) {
        signInNarrationKeyRef.current = null;
      }
    };
  }, [
    bookCallActive,
    chatStoreState.activeSessionId,
    location.pathname,
    session.gate,
    signupSurfaceActive,
  ]);

  // post-mvs-cleanup Phase B / standardized-viewer-control T6 — the canvas
  // switches on the ACTIVE ViewerStep kind. Every navigation (StepStrip pill,
  // sub-pill, citation, auto-advance) pushes its ViewerStep through `dispatch`,
  // and the active step is seeded on mount, so the step is always present.
  // The only stepless edge (no active session yet) defaults to the
  // `ingest-picker` overlay, matching the strip's "no step → Ingest".
  const latestViewerStep = selectActiveStep(activeChatSession);
  const effectiveStepKind: import("@/contexts/ChatStoreContext").ViewerStep["kind"] =
    latestViewerStep?.kind ?? "ingest-picker";

  // 2026-05-30-onboarding-shell-shared-view Phase 2 — the per-frame
  // `canvasContent` switch is GONE. The canvas is now driven entirely by
  // `<ScopedCanvas>` (the SOLE viewer-widget mount path) fed the active
  // viewer step + the experience's resolved `ContentScope`. The shell no
  // longer mounts `UnderstandView`/`ExtractView`/`InteractView`/
  // `IntegrateView`/`ReportRenderView`/`ReportBuilderView` — those views
  // are retired. As of Phase 3a/3b ALL production frame surfaces are packaged
  // ScopedViewerWidgets (`doc-viewer`/`extract-workbench`/`report`/
  // `report-builder`/`integrate`) that `<ScopedCanvas>` mounts for real — no
  // canvas placeholder remains for any production frame. The ONLY remaining
  // ScopedCanvas placeholder kind is `ingest-picker` (the picker overlay).
  //
  // Gate / book-call remain WIDGET mounts the shell shows directly (NOT
  // views routed through ScopedCanvas) — they're anonymous-context
  // surfaces, not document-scoped ScopedViewerWidgets.

  // Resolve the document the canvas renders for the active scenario. A
  // citation-click doc-viewer step carries a RESOLVED GroundX UUID — prefer
  // it; otherwise fall back to the scenario's first document.
  const canvasScenarioId = appMode.scenario ?? session.scenario ?? null;
  const canvasScenario = canvasScenarioId ? scenarioById(canvasScenarioId) : undefined;
  // standardized-viewer-control T5 — both `doc-viewer` and a `showInteract`-
  // resolved `interact-chat` step carry a resolved document; prefer it over the
  // scenario's default so the canvas mounts what the intent named.
  const stepDocId =
    latestViewerStep?.kind === "doc-viewer" && isResolvedDocumentId(latestViewerStep.documentId)
      ? latestViewerStep.documentId
      : latestViewerStep?.kind === "interact-chat" &&
          latestViewerStep.documentId &&
          isResolvedDocumentId(latestViewerStep.documentId)
        ? latestViewerStep.documentId
        : null;
  const scenarioDocId = canvasScenario?.documents?.[0]?.documentId ?? null;
  const canvasDocId = stepDocId ?? scenarioDocId;

  // The scope ScopedCanvas feeds the mounted widget, by the active step kind:
  //   • doc-viewer / interact-chat → the single document (documents scope)
  //   • report → bucket + projectId filter (the GroundX data-org key for the
  //     active scenario; the opening display context for every demo sample)
  const canvasScope: ContentScope = useMemo(() => {
    if (effectiveStepKind === "report") {
      return {
        type: "bucket",
        bucketId: scenarioRegistry.bucketId ?? 28454,
        filter: { projectId: canvasScenario?.projectId ?? "proj_utility" },
      };
    }
    if (canvasDocId) {
      return { type: "documents", documentIds: [canvasDocId] };
    }
    // No resolved document yet (BYO / pre-resolution) — an empty documents
    // scope holds the widget's neutral loading state (PdfViewer gates its
    // fetch on a resolved id).
    return { type: "documents", documentIds: [] };
  }, [effectiveStepKind, scenarioRegistry.bucketId, canvasScenario?.projectId, canvasDocId]);

  // The viewer step ScopedCanvas selects the widget from. Use the live step
  // when present; otherwise synthesize from the frame projection so the
  // canvas resolves on initial mount before any step lands in history.
  const canvasStep: import("@/contexts/ChatStoreContext").ViewerStep = useMemo(() => {
    if (latestViewerStep) return latestViewerStep;
    switch (effectiveStepKind) {
      case "doc-viewer":
        return { kind: "doc-viewer", documentId: canvasDocId ?? "" };
      case "extract-workbench":
        return { kind: "extract-workbench", scenarioId: canvasScenarioId ?? "utility" };
      case "interact-chat":
        return { kind: "interact-chat" };
      case "report":
        return { kind: "report" };
      case "integrate":
        return { kind: "integrate" };
      case "ingest-picker":
      default:
        return { kind: "ingest-picker" };
    }
  }, [latestViewerStep, effectiveStepKind, canvasDocId, canvasScenarioId]);

  // standardized-viewer-control T6 (R4) — render vs builder is a sub-position on
  // the active `report` ViewerStep's `surface` field (pushed by `showReport` →
  // "render" / `editTemplate` → "builder"). `ScopedCanvas.stepToCanvasKind`
  // already prefers `step.surface` over this prop, so this is only the fallback
  // for the synthesized stepless `canvasStep` (which carries no surface);
  // default to render.
  const reportSurface: "render" | "builder" =
    latestViewerStep?.kind === "report" && latestViewerStep.surface === "builder"
      ? "builder"
      : "render";

  const handleSignInClose = useCallback(() => {
    dismissGate();
    popOverlay("sign-up");
    if (session.scenario == null || routeSignUpActive) {
      navigate("/onboarding");
    }
  }, [dismissGate, navigate, popOverlay, routeSignUpActive, session.scenario]);

  const handleSignInBookCall = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("bookCall", "1");
    navigate(
      { pathname: location.pathname, search: `?${params.toString()}` },
      { replace: false },
    );
  }, [location.pathname, location.search, navigate]);

  const handleSignInContinue = useCallback(() => {
    // standardized-viewer-control T6 — "Continue to Integrate" MOVES the canvas
    // via `showIntegrate` (the single seam). The orchestrator pushes the
    // `integrate` step and layers the onboarding Integrate journey advance (which
    // also pops a stale sign-up overlay). Session-scoped (the connectors surface
    // is scope-independent).
    dispatch({ kind: "showIntegrate", scope: { type: "documents", documentIds: [] } }, "user");
  }, [dispatch]);

  const signInCloseLabel = session.scenario == null ? "Back to samples" : "Close sign-in";

  const baseCanvasContent = useMemo(() => {
    // ARCH-06B: the ingest picker is rendered ONLY inside the ingest-picker
    // overlay (see render below); the canvas underneath stays blank during the
    // return-window so the user doesn't see it duplicated.
    if (effectiveStepKind === "ingest-picker") return null;
    return (
      <ScopedCanvas
        scope={canvasScope}
        step={canvasStep}
        role={widgetRole}
        reportSurface={reportSurface}
        active={!(signupSurfaceActive || bookCallActive)}
        experience="onboarding"
      />
    );
  }, [
    effectiveStepKind,
    canvasScope,
    canvasStep,
    widgetRole,
    reportSurface,
    bookCallActive,
    signupSurfaceActive,
  ]);

  const canvasContent = useMemo(() => {
    const blockingViewerOverlayActive = signupSurfaceActive || bookCallActive;
    const bookCallFrameLoading =
      bookCallEmbedState === "initializing" || bookCallEmbedState === "embedding"
        ? { label: "Loading booking calendar" }
        : null;
    const bookCallFrameStatus =
      bookCallEmbedState === "error"
        ? "We couldn't load the booking calendar. Please try again in a moment."
        : undefined;
    return (
      <Box
        data-testid="viewer-stack"
        sx={{ position: "relative", height: "100%", width: "100%", overflow: "hidden" }}
      >
        <Box
          data-testid="book-call-viewer-underlay"
          aria-hidden={blockingViewerOverlayActive || undefined}
          {...(blockingViewerOverlayActive ? { inert: "" as unknown as undefined } : {})}
          sx={{ height: "100%", width: "100%" }}
        >
          {baseCanvasContent}
        </Box>
        {signupSurfaceActive && (
          <Box
            data-testid="sign-up-viewer-overlay"
            aria-hidden={bookCallActive || undefined}
            {...(bookCallActive ? { inert: "" as unknown as undefined } : {})}
            sx={{
              position: "absolute",
              inset: 0,
              zIndex: 2,
              backgroundColor: WHITE,
            }}
          >
            <ViewerWidgetFrame
              widgetId="sign-up"
              active={!bookCallActive}
              {...viewerOverlayFrameDescriptors["sign-up"]}
              closeAction={{
                id: "close-sign-up",
                label: signInCloseLabel,
                icon: session.scenario == null ? "back" : "close",
                onClick: handleSignInClose,
              }}
            >
              <SignUpWidget
                role="anonymous"
                scope={{ type: "none" }}
                onBookCall={handleSignInBookCall}
                onContinueIntegrate={handleSignInContinue}
              />
            </ViewerWidgetFrame>
          </Box>
        )}
        {bookCallActive && (
          <Box
            data-testid="book-call-viewer-overlay"
            sx={{
              position: "absolute",
              inset: 0,
              zIndex: 3,
              backgroundColor: WHITE,
            }}
          >
            <ViewerWidgetFrame
              widgetId="book-call"
              active
              {...viewerOverlayFrameDescriptors["book-call"]}
              closeAction={{
                id: "close-book-call",
                label: "Close booking",
                icon: "close",
                onClick: () => clearBookCallParam(false),
              }}
              loading={bookCallFrameLoading}
              status={bookCallFrameStatus}
            >
              <BookCallView
                role="anonymous"
                scope={{ type: "none" }}
                onScheduled={handleBookCallScheduled}
                onEmbedStateChange={setBookCallEmbedState}
              />
            </ViewerWidgetFrame>
          </Box>
        )}
      </Box>
    );
  }, [
    baseCanvasContent,
    bookCallActive,
    bookCallEmbedState,
    clearBookCallParam,
    handleBookCallScheduled,
    handleSignInBookCall,
    handleSignInClose,
    handleSignInContinue,
    signInCloseLabel,
    session.scenario,
    signupSurfaceActive,
  ]);

  // Theme-driven breakpoint detection. Compact step strip activates below
  // md (900 = MUI default; iPad-portrait-to-landscape divide). Phones +
  // iPad-portrait get the thin progress bar; iPad-landscape and up get the
  // full pill strip — which is also where it fits on one row.
  const theme = useTheme();
  const stripCompact = useMediaQuery(theme.breakpoints.down("md"));

  const pickerLayout = (
    <Box
      // standardized-viewer-control (D2) — the ingest overlay is always the
      // `ingest-picker` step; its frame-free diagnostic testid is fixed
      // (the dynamic canvas testid below is omitted while this overlay covers it).
      data-testid={`onboarding-step-${viewerStepDiagnosticId({ kind: "ingest-picker" })}`}
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

  // ARCH-06B (2026-05-26): the picker ↔ canvas transition is now driven by
  // the AnimatePresence on the picker overlay in render below; the previous
  // transitionPhase state machine + setTimeout-based leaving-snapshot
  // ref was retired when the dual-shell mount pattern was replaced
  // by a single AppShell + overlay model. AppShell stays mounted at
  // all times; the picker enters/exits over top of it. See animation spec
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
      // Book a call CTA → the same URL-backed viewer path as the
      // `book_call` tool. The scheduler URL itself is browser-safe
      // app config consumed by BookCallView; the nav should never open
      // a parallel new-tab path.
      if (key === "call") {
        const params = new URLSearchParams(location.search);
        params.set("bookCall", "1");
        navigate(
          { pathname: location.pathname, search: `?${params.toString()}` },
          { replace: false },
        );
        return;
      }
      // Settings is in-app for signed-in users — client-side route.
      if (key === "settings") {
        navigate("/settings");
        return;
      }
      // support, anything else: no-op for now.
    },
    [location.pathname, location.search, navigate],
  );

  // The chat + canvas split that lives in the right-of-nav slot once a
  // sample is active. Sign-in and booking mount in the viewer stack; the
  // chat column keeps ConversationFlow mounted.
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
      <ChatColumn
        role={widgetRole}
        scope={{ type: "none" }}
        bookingActive={bookCallActive}
        signInActive={signupSurfaceActive}
      />
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
        // When isIngestPicker, the AppShell canvas slot is intentionally empty
        // (the ingest-picker overlay covers it). Omit the testid so it doesn't
        // duplicate the ingest-picker overlay's own
        // `onboarding-step-ingest-picker` and break selector-based assertions.
        // standardized-viewer-control (D2) — the diagnostic testid is sourced off
        // the ACTIVE viewer step (kind + sub-position).
        data-testid={
          isIngestPicker || !latestViewerStepEarly
            ? undefined
            : `onboarding-step-${viewerStepDiagnosticId(latestViewerStepEarly)}`
        }
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
  // (ARCH-06B 2026-05-26): the picker used to NOT mount the AppShell at
  // all, so the nav literally wasn't in the DOM on the picker. Today
  // AppShell is the canonical underlay and the picker floats over it as
  // an overlay — the nav is in the DOM, just visually obscured while the
  // picker covers the viewport. When the picker dismisses, the nav is revealed.
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
  // Canvas zoom (the AppShell underneath) and the picker overlay's
  // translate/fade are expressed as framer-motion variants so the
  // reduced-motion gate collapses both to instant on the appropriate setting.
  const canvasZoomAnimate = isIngestPicker
    ? { scale: CANVAS_ZOOM_SCALE, opacity: CANVAS_ZOOM_OPACITY }
    : { scale: 1, opacity: 1 };
  const canvasZoomTransition = reducedMotion
    ? { duration: 0 }
    : {
        duration: isIngestPicker ? PICKER_RETURN_DURATION_S : PICKER_DISMISS_DURATION_S,
        ease: PICKER_OVERLAY_EASE,
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
          opacity settle when the picker dismisses (and the inverse when
          the picker returns), reinforcing the "shell coming into focus"
          feel without any one element doing the heavy lift. */}
      <motion.div
        data-testid="onboarding-shell-underneath"
        // WF-01 C1 (2026-05-28). While the picker is up, the underneath shell is
        // visually masked by the opaque picker overlay AND must be hidden
        // from assistive tech + keyboard navigation. `aria-hidden`
        // pulls it out of the a11y tree; `inert` blocks focus + click
        // (React 19's first-class attr; we set it as a string for
        // React 18 forward-compat).
        aria-hidden={isIngestPicker || undefined}
        {...(isIngestPicker ? { inert: "" as unknown as undefined } : {})}
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 0,
          transformOrigin: "center center",
        }}
        animate={canvasZoomAnimate}
        transition={canvasZoomTransition}
      >
        {/* ARCH-06B (2026-05-26): keep AppShell fully populated even
            while the picker is up. Toggling hideNav/hideChat would
            re-trigger AppShell's internal AnimatePresence width-grow on
            nav + chat as the picker lifts away — visually competing with
            the picker overlay's lift. With nav/chat always mounted, the
            underneath shell is stable; only the wrapper's canvas zoom +
            the picker overlay's lift play during the transition. The user
            sees the shell as "always already there." */}
        <AppShell
          nav={navIdle}
          header={headerStrip}
          chat={chatIdle}
          canvas={canvasIdle}
          compactInitialFocus={bookCallActive || signupSurfaceActive ? "focus-canvas" : undefined}
          initialChatWidth={360}
          navWidth={navCollapsed ? ONBOARDING_NAV_WIDTH_COLLAPSED : ONBOARDING_NAV_WIDTH_FULL}
        />
      </motion.div>

      {/* Ingest-picker overlay — the picker floats on top of the
          always-there AppShell. Lifts up on dismiss (900ms, opacity held
          till 70% for a tactile lift instead of dissolve), returns down on
          Ingest-pill click (700ms, opacity fades in over first 30%).
          AnimatePresence drives the mount/unmount via the isIngestPicker flag;
          initial={false} suppresses the entrance animation on first
          page load so users landing on /onboarding don't see the picker
          fly in from above. */}
      <AnimatePresence initial={false}>
        {isIngestPicker ? (
          <motion.div
            key="picker-overlay"
            style={{ position: "absolute", inset: 0, zIndex: 10 }}
            initial={{ y: "-100%", opacity: 0 }}
            animate={{
              y: "0%",
              opacity: 1,
              transition: reducedMotion
                ? { duration: 0 }
                : {
                    y: { duration: PICKER_RETURN_DURATION_S, ease: PICKER_OVERLAY_EASE },
                    opacity: {
                      duration: PICKER_RETURN_DURATION_S * PICKER_OPACITY_PORTION,
                      ease: PICKER_OVERLAY_EASE,
                    },
                  },
            }}
            exit={{
              y: "-100%",
              opacity: 0,
              transition: reducedMotion
                ? { duration: 0 }
                : {
                    y: { duration: PICKER_DISMISS_DURATION_S, ease: PICKER_OVERLAY_EASE },
                    opacity: {
                      duration: PICKER_DISMISS_DURATION_S * PICKER_OPACITY_PORTION,
                      ease: PICKER_OVERLAY_EASE,
                      delay: PICKER_DISMISS_DURATION_S * (1 - PICKER_OPACITY_PORTION),
                    },
                  },
            }}
          >
            {pickerLayout}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Box>
  );
};
