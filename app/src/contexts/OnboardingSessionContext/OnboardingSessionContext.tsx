import { createContext, useCallback, useContext, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import { journeyStageForStepKind, type JourneyStage } from "@groundx/shared";

import { toPersistedViewerStep, useChatStore, type ViewerStep } from "@/contexts/ChatStoreContext";
import { track } from "@/lib/analytics";
import { gaSetDefaults } from "@/lib/ga";
import {
  EntitySessionStoreProvider,
  makeEntityKey,
  useEntitySessionStore,
  type EntityKey,
  type EntitySession,
} from "@/contexts/EntitySessionStoreContext";
import type { GateTrigger, Scenario } from "@/types/onboarding";

import type { GateCause, GateStatus, OnboardingSessionApi, OnboardingSessionState } from "./types";

const OnboardingSessionContext = createContext<OnboardingSessionApi | null>(null);

/**
 * The "GroundX is reading the doc" beat for a freshly-opened sample — the
 * doc-viewer step that is active exactly while the chat ThinkingStream plays
 * (its onDone auto-advances to Extract). `scanning: true` makes <ScopedCanvas>
 * mount the PdfViewer with the reading scan-line. Citation-jump doc-viewer
 * steps are pushed by the cite-click sink, NOT this seed, so they never scan.
 *
 * standardized-viewer-control (D2) — `pickScenario` is the sole live caller; the
 * Understand reading beat is the journey origin for a freshly-opened sample.
 */
function scanningDocViewerStep(scenario: Scenario | null): ViewerStep {
  return {
    kind: "doc-viewer",
    documentId: scenario ? `scenario:${scenario}` : "scenario:unknown",
    scanning: true,
  };
}

interface OnboardingSessionProviderProps {
  children: ReactNode;
  /**
   * standardized-viewer-control (D2) — the ViewerStep the seeded active entity
   * is positioned on (FRAME-FREE). Replaces the retired `initialFrame` prop:
   * tests express position as a step directly (or via the test-only
   * `testFrameToStep` helper at the harness boundary).
   */
  initialStep?: ViewerStep | null;
  initialScenario?: Scenario | null;
}

/**
 * Internal facade hook — derives the legacy `OnboardingSessionState`
 * shape from the active entity in the EntityRegistry, and routes the
 * legacy mutation API (pickScenario / advanceFrame / openGate / …)
 * into registry operations.
 *
 * The legacy hook (`useOnboardingSession`) and the legacy state
 * shape are unchanged from a consumer's perspective. Existing F2–F7
 * views, tests, and Skill code keep working without modification.
 */
function useSessionFacade(): OnboardingSessionApi {
  const registry = useEntitySessionStore();
  // Destructure the STABLE action functions (useCallback []) from the
  // registry. The registry's `state` field changes per update, but
  // these action refs don't. Using them as deps in our own
  // useCallbacks keeps OUR action refs stable too — which matters
  // because anything that depends on `openGate`/`dismissGate`/etc.
  // via a useEffect would otherwise re-fire on every state change.
  // The classic symptom: a test harness that calls `openGate` in a
  // useEffect re-opens the gate immediately after the user dismisses
  // it, because dismiss → state change → new openGate ref → effect
  // re-fires.
  const { activate, upsertAndActivate, updateActive } = registry;
  // ChatStore primitives used directly for ViewerEvent recording.
  // EntityRegistry is a facade over ChatStore; viewer events are
  // session-level (not entity-level), so we reach for ChatStore
  // here instead of routing through EntityRegistry.
  const { appendViewerEvent, pushStep, pushOverlay, mutateOverlay, popOverlay } = useChatStore();
  const [sessionId, setSessionId] = useState<string | null>(null);
  // Gate is SESSION-LEVEL state, not per-entity. It represents the
  // user's auth-pending status, which is global across whatever
  // surface they're on. Once committed → signed in everywhere; once
  // dismissed → dismissed until something explicitly re-triggers it.
  const [gate, setGate] = useState<GateStatus>({ status: "idle" });
  // Live ref to the latest committed gate. `openGate` must decide its
  // one-time side effects (push the sign-up overlay, log analytics)
  // SYNCHRONOUSLY — it cannot read that decision out of the `setGate`
  // updater, because React only runs the updater eagerly when the fiber
  // has no other pending work. Under render pressure (e.g. a streaming
  // reply or scripted-narration reveal in flight) the updater runs
  // lazily, the side-effect flag stays false, and the overlay silently
  // never opens. Reading `gateRef.current` removes that dependence.
  const gateRef = useRef(gate);
  gateRef.current = gate;
  // Signup surface flag. When true, the user clicked BYO (a sign-up
  // trigger from the F1 picker) and we render the shell with the
  // gate in chat + BYO placeholder in canvas. BYO is intentionally
  // NOT an entity — it has no per-instance state, just a session
  // boolean + the session-level gate.
  // standardized-viewer-control (D2) — the shell now detects the signup surface
  // from the sign-up overlay / route (`signupSurfaceActive`), not this flag; the
  // value binding fed only the retired `currentFrame` projection, so only the
  // setter (which other paths still toggle as part of the gate lifecycle) remains.
  const [, setSignupOpen] = useState<boolean>(false);
  // The report section the builder (f4a) should pre-open. Set by the
  // render→builder `✎ edit §N` hand-off via `advanceFrame`; cleared when the
  // user leaves the builder frame.
  const [selectedReportSectionId, setSelectedReportSectionId] = useState<string | null>(null);

  // Live ref to the registry's current activeKey. Action callbacks
  // need to peek at `activeKey` to decide whether to upsert or
  // update, but can't close over it (closure would be stale OR the
  // useCallback dep would defeat the stability above). Reading via
  // ref keeps callbacks stable AND reads the latest value.
  const activeKeyRef = useRef<EntityKey | null>(registry.state.activeKey);
  activeKeyRef.current = registry.state.activeKey;

  const active: EntitySession | undefined = registry.state.activeKey
    ? registry.state.entities.get(registry.state.activeKey)
    : undefined;

  // standardized-viewer-control (D2) — the legacy `currentFrame` reverse
  // projection is GONE. The user's journey position lives entirely on the active
  // viewer step (rendered via the `onboarding-step-*` testid + read by the
  // frame-free StepStrip off `VIEWER_STEP_TO_JOURNEY`); the resume anchor is the
  // entity's `lastStep`. This state record carries only the session-level fields
  // that are not derivable from the active step.
  const state: OnboardingSessionState = useMemo(() => {
    return {
      sessionId,
      scenario: active?.kind === "sample" ? (active.id as Scenario) : null,
      gate,
      selectedReportSectionId,
    };
  }, [sessionId, active, gate, selectedReportSectionId]);

  const bootstrapSession = useCallback((id: string) => {
    setSessionId(id);
    // OB-02 — session.started fires once per onboarding bootstrap.
    track("session.started", { sessionId: id, mode: "onboarding" });
    // OB-03 — sessionId becomes a sticky GA4 dimension on every
    // subsequent event from this user's session.
    gaSetDefaults({ sessionId: id });
  }, []);

  const pickScenario = useCallback(
    (scenario: Scenario) => {
      setSignupOpen(false);
      // Engaging with a sample means the user has bailed out of any
      // open gate (e.g. they clicked Sign Up from F1, dismissed via
      // back, then chose a sample instead). An OPEN gate would keep
      // the OnboardingShell canvas swapped to SignUpWidget and starve
      // UnderstandView. `committed` (signed-in) and `dismissed` are
      // preserved — only the pending-open state resets.
      setGate((prev) => (prev.status === "open" ? { status: "idle" } : prev));
      // standardized-viewer-control D13/R5 — RESUME VERBATIM. Re-opening a
      // sample restores the entity's persisted active viewer step (`lastStep`)
      // exactly, so a user who left at Interact/Report/Integrate lands back
      // there, not at the F2 default. A first-time open seeds the Understand
      // doc-viewer step (the journey origin for a sample). `reachedStages`
      // seeds with the origin stages (ingest + understand) for the strip
      // checkmarks; later advances add more.
      const targetKey = makeEntityKey("sample", scenario);
      const existingEntity = registry.state.entities.get(targetKey);
      const freshStep: ViewerStep = scanningDocViewerStep(scenario);
      // `PersistedViewerStep` is the navigational subset of `ViewerStep`, so the
      // persisted resume anchor is itself a valid in-memory step (ephemeral
      // citation/scan fields stay absent — rebuilt on demand). Push it verbatim.
      const resumeStep: ViewerStep = existingEntity ? existingEntity.lastStep : freshStep;
      upsertAndActivate("sample", scenario, {
        lastStep: toPersistedViewerStep(freshStep),
        reachedStages: new Set<JourneyStage>(["ingest", "understand"]),
      });
      pushStep(resumeStep);
      // Phase E: record the entity-open ViewerEvent. Last ~10
      // viewer events feed the LLM context bundling.
      appendViewerEvent({
        action: "opened",
        entityKey: makeEntityKey("sample", scenario),
        source: "user",
        detail: { scenario },
      });
      // OB-02 — the user picked a sample. understand.started fires
      // immediately too since pickScenario lands the user on F2.
      track("sample.picked", { scenario });
      track("understand.started", { scenario });
      // OB-03 — currentSample sticks to GA4 events from this point.
      gaSetDefaults({ currentSample: scenario });
    },
    [upsertAndActivate, appendViewerEvent, pushStep],
  );

  // standardized-viewer-control — advance the onboarding JOURNEY STATE for a
  // destination VIEWER STEP, WITHOUT pushing it (the orchestrator's de-forked
  // `show*`/`editTemplate` handlers push the step themselves — the one canvas
  // outcome, both experiences — then call this to layer onboarding
  // journey-progress on top). FRAME-FREE: it takes the destination `ViewerStep`
  // and writes the new resume anchor (`lastStep` — the persisted navigational
  // projection) + adds the destination journey stage to the reached-set
  // (`reachedStages` — checkmarks; a SET, not a watermark — R3). Also records
  // the frame-free `journey-advanced` viewer event, pops the Integrate gate on
  // arrival (D12), and carries/clears the report-builder section pre-select.
  // Onboarding-only. NOTE: the ingest-picker return (entity-deactivate, a
  // BACKWARD transition — R2) is NOT handled here; it is `returnToIngestPicker`.
  const markStageReached = useCallback(
    (step: import("@/contexts/ChatStoreContext").ViewerStep) => {
      // Carry (or clear) the builder's pre-selected section. Only the report
      // BUILDER step keeps a selection; reaching anywhere else clears it so a
      // stale section can't pre-open a later builder visit.
      setSelectedReportSectionId(
        step.kind === "report" && step.surface === "builder"
          ? step.selectedSectionId ?? null
          : null,
      );
      if (!activeKeyRef.current) return;
      if (step.kind === "integrate") {
        // The Integrate overlay pop fires on ARRIVAL (D12) — a second arrival
        // with a live gate must still clear it (this runs every reach, not just
        // a first-reach).
        setSignupOpen(false);
        setGate((prev) =>
          prev.status === "open" || prev.status === "committed" ? { status: "idle" } : prev,
        );
        popOverlay("sign-up");
      }
      const entityKeyAtAdvance = activeKeyRef.current;
      const stage = journeyStageForStepKind(step.kind);
      const persisted = toPersistedViewerStep(step);
      updateActive((session) => {
        const reachedStages = stage ? new Set(session.reachedStages) : session.reachedStages;
        if (stage) (reachedStages as Set<JourneyStage>).add(stage);
        return { ...session, lastStep: persisted, reachedStages };
      });
      // standardized-viewer-control T6b (D14) — the viewer-event action
      // vocabulary is FRAME-FREE. Record the journey-progress advance as
      // `journey-advanced` carrying the destination's journey stage + step
      // kind (derived from the step itself), never a frame name.
      appendViewerEvent({
        action: "journey-advanced",
        entityKey: entityKeyAtAdvance,
        source: "user",
        detail: { stage, step: step.kind },
      });
    },
    [updateActive, appendViewerEvent, popOverlay],
  );

  // standardized-viewer-control deletion-phase — return to the Ingest picker AND
  // deactivate the active entity (the f1 BACKWARD-transition side effects: gate
  // reset, the "left" viewer event, the ingest-picker step push). The
  // `presentExperienceBeat` `ingest-picker` beat handler calls this; the optional
  // `attachedSchema` rides onto the picker step so the F3a Save → sign-in →
  // persist → picker hand-off lands the freshly-saved schema. Onboarding-only.
  const returnToIngestPicker = useCallback(
    (attachedSchema?: { schemaId: string; name: string }) => {
      setSelectedReportSectionId(null);
      // Capture the entity key BEFORE deactivating so the "left" event
      // references the right entity.
      const leavingKey = activeKeyRef.current;
      activate(null);
      setSignupOpen(false);
      // Returning to the picker means the user bailed out of any in-flight gate.
      // `committed` (signed-in) and `dismissed` are preserved; only the pending-
      // open state resets.
      setGate((prev) => (prev.status === "open" ? { status: "idle" } : prev));
      appendViewerEvent({
        action: "left",
        entityKey: leavingKey,
        source: "user",
      });
      pushStep({ kind: "ingest-picker", ...(attachedSchema ? { attachedSchema } : {}) });
    },
    [activate, appendViewerEvent, pushStep],
  );

  // standardized-viewer-control deletion-phase — `advanceFrame` is GONE. All
  // canvas navigation now dispatches a CanvasIntent through the orchestrator
  // (the de-forked `show*`/`editTemplate` handlers push the step + call
  // `markStageReached`); the f1 backward return is `returnToIngestPicker`; the
  // three residual onboarding-overlay beats route through `presentExperienceBeat`.

  // standardized-viewer-control T5 (R1/R6) — the Extract first-reach signal.
  // The orchestrator's `showExtract` handler calls this; it fires
  // `understand.completed` EXACTLY ONCE per session, decided from a SYNCED REF
  // (`extractReachedRef`) — never a flag mutated inside a setState updater, the
  // silently-failing pattern that bit `openGate`→sign-up-overlay. The payload is
  // FRAME-FREE (journey stage + active step, not fromFrame/toFrame).
  const extractReachedRef = useRef(false);
  const notifyExtractReached = useCallback(() => {
    if (extractReachedRef.current) return;
    extractReachedRef.current = true;
    track("understand.completed", { stage: "analyze", step: "extract-workbench" });
  }, []);

  const openGate = useCallback(
    (trigger: GateTrigger, options?: { cause?: GateCause }) => {
      if (trigger === "byo" && !activeKeyRef.current) {
        setSignupOpen(true);
      }
      const cause = options?.cause;
      // Decide the one-time side effects SYNCHRONOUSLY from the live gate
      // ref — NOT as a flag mutated inside the `setGate` updater (which
      // React may run lazily under render pressure, dropping the overlay).
      // Same predicate as the updater below, kept in lockstep:
      //   • `committed` → no-op (already signed in everywhere).
      //   • `open(sameTrigger, sameCause)` while open → no-op (already showing it).
      //   • everything else (incl. `dismissed → open(sameTrigger)`) → record + re-open.
      const prevGate = gateRef.current;
      const shouldRecord =
        prevGate.status !== "committed" &&
        !(prevGate.status === "open" && prevGate.trigger === trigger && prevGate.cause === cause);
      setGate((prev) => {
        if (prev.status === "committed") return prev;
        if (prev.status === "open" && prev.trigger === trigger && prev.cause === cause) return prev;
        return { status: "open", trigger, openedAt: Date.now(), cause };
      });
      if (shouldRecord) {
        // post-mvs-cleanup Phase C — openGate also pushes a viewer
        // overlay so the architecture is internally consistent. The
        // legacy gate.status === "open" slot is kept (transitional)
        // but the overlay is the authoritative source. `pushOverlay`
        // is idempotent on (kind, cause) so a re-fire doesn't
        // duplicate.
        pushOverlay({ kind: "sign-up", state: "pending", ...(cause ? { cause } : {}) });
        appendViewerEvent({
          action: "intent-dispatched",
          entityKey: activeKeyRef.current,
          source: "user",
          detail: { intent: "gate-open", trigger, cause: cause ?? null },
        });
        // OB-02 — gate.shown is the user-visible "the gate appeared"
        // event, distinct from the viewer-event intent log.
        track("gate.shown", { trigger });
      }
    },
    [appendViewerEvent, pushOverlay],
  );

  const dismissGate = useCallback(() => {
    let shouldRecord = false;
    setGate((prev) => {
      if (prev.status !== "open") return prev;
      shouldRecord = true;
      // Preserve the cause across dismiss so any post-dismiss
      // consumer (e.g. a "re-open the save-schema gate" reminder) can
      // tell what the user was originally trying to do.
      return { status: "dismissed", trigger: prev.trigger, dismissedAt: Date.now(), cause: prev.cause };
    });
    setSignupOpen(false);
    // post-mvs-cleanup Phase C — pop the sign-up overlay so the
    // canvas-side overlay disappears in lockstep with the legacy
    // gate.status flip.
    popOverlay("sign-up");
    if (shouldRecord) {
      appendViewerEvent({
        action: "intent-dispatched",
        entityKey: activeKeyRef.current,
        source: "user",
        detail: { intent: "gate-dismiss" },
      });
    }
  }, [appendViewerEvent, popOverlay]);

  const commitGate = useCallback(
    (method: "register" | "sso" | "engineer-call") => {
      setGate((prev) => {
        // Carry the cause forward from the open state so post-commit
        // consumers (e.g. ExtractView's save-schema retry effect) can
        // detect their own handoff path.
        const cause = prev.status === "open" || prev.status === "dismissed" ? prev.cause : undefined;
        return { status: "committed", method, cause };
      });
      // post-mvs-cleanup Phase C — mutate the overlay to "done" so
      // consumers reading the overlay state see the commit. Auto-pop
      // is the post-commit effect's job (ExtractView post-Save retry
      // handles the handoff and then the overlay is popped via the
      // next URL navigation or dismissGate).
      mutateOverlay("sign-up", { state: "done" });
      appendViewerEvent({
        action: "intent-dispatched",
        entityKey: activeKeyRef.current,
        source: "user",
        detail: { intent: "gate-commit", method },
      });
      // OB-02 — signup.completed fires on a real register / sso
      // commit. engineer-call is technically not a signup but the
      // funnel still benefits from one canonical "the gate closed
      // with a commit" event — distinguish via the `method` prop.
      track("signup.completed", { method });
    },
    [appendViewerEvent, mutateOverlay],
  );

  return useMemo<OnboardingSessionApi>(
    () => ({
      state,
      bootstrapSession,
      pickScenario,
      markStageReached,
      returnToIngestPicker,
      notifyExtractReached,
      openGate,
      dismissGate,
      commitGate,
    }),
    [
      state,
      bootstrapSession,
      pickScenario,
      markStageReached,
      returnToIngestPicker,
      notifyExtractReached,
      openGate,
      dismissGate,
      commitGate,
    ],
  );
}

/**
 * Inner provider — assumes EntitySessionStoreProvider is mounted above
 * it. Exposes the legacy `OnboardingSessionApi` to consumers.
 */
const InnerSessionProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const value = useSessionFacade();
  return <OnboardingSessionContext.Provider value={value}>{children}</OnboardingSessionContext.Provider>;
};

/**
 * Public provider — mounts the EntitySessionStoreProvider itself so
 * existing call sites don't have to know about the new store
 * layer. Tests and app code keep wrapping with
 * `<OnboardingSessionProvider>` and everything works as before, plus
 * sample state now persists across F1 round-trips.
 *
 * `initialStep` + `initialScenario` are translated into seed
 * EntityRegistry state SYNCHRONOUSLY — they become the registry's
 * initialEntities/initialActiveKey on first render. This matters for
 * tests: a synchronous `render()` followed by a synchronous DOM
 * query must see the test's requested viewer step (doc-viewer, extract,
 * …) instead of the picker, which it would if we seeded via useEffect.
 */
export const OnboardingSessionProvider: FC<OnboardingSessionProviderProps> = ({
  children,
  initialStep = null,
  initialScenario = null,
}) => {
  const { initialEntities, initialActiveKey, initialViewerStep } = useMemo(() => {
    if (!initialScenario) {
      return {
        initialEntities: undefined,
        initialActiveKey: null as EntityKey | null,
        initialViewerStep: null as ViewerStep | null,
      };
    }
    const key = makeEntityKey("sample", initialScenario);
    const now = Date.now();
    // standardized-viewer-control T3/D2 — the viewer step the seeded entity
    // sits on (frame-free). When the caller doesn't pass one, default to the
    // picker. EntitySessionStoreProvider primes the ChatStore viewer with this
    // step, making `selectActiveStep` non-null on first render — the frame-free
    // StepStrip reads the active step kind.
    const initialViewerStep: ViewerStep = initialStep ?? { kind: "ingest-picker" };
    // Frame-free entity seed: the resume anchor is the persisted projection of
    // the seeded step; the reached-set seeds with that step's journey stage.
    const seedStage = journeyStageForStepKind(initialViewerStep.kind);
    const seed: EntitySession = {
      kind: "sample",
      id: initialScenario,
      lastStep: toPersistedViewerStep(initialViewerStep),
      reachedStages: seedStage ? new Set<JourneyStage>([seedStage]) : new Set<JourneyStage>(),
      createdAt: now,
      lastVisitedAt: now,
    };
    const map = new Map<EntityKey, EntitySession>();
    map.set(key, seed);
    return { initialEntities: map, initialActiveKey: key, initialViewerStep };
  }, [initialStep, initialScenario]);

  return (
    <EntitySessionStoreProvider
      initialEntities={initialEntities}
      initialActiveKey={initialActiveKey}
      initialViewerStep={initialViewerStep}
    >
      <InnerSessionProvider>{children}</InnerSessionProvider>
    </EntitySessionStoreProvider>
  );
};

export const useOnboardingSession = (): OnboardingSessionApi => {
  const value = useContext(OnboardingSessionContext);
  if (!value) throw new Error("useOnboardingSession must be used inside OnboardingSessionProvider");
  return value;
};

/**
 * widget-llm-integration follow-up B.2 — soft variant for consumers
 * that work in BOTH the onboarding tree (where this provider is
 * mounted) and the steady tree (where it isn't). Returns `null`
 * instead of throwing. Mirrors the `useChatStoreOptional` pattern
 * the orchestrator already uses for `chatStore`-side effects.
 */
export const useOnboardingSessionOptional = (): OnboardingSessionApi | null => {
  return useContext(OnboardingSessionContext);
};

// re-export for external `makeEntityKey` callers (e.g., tests that
// need to construct an entity key for inspection)
export { makeEntityKey };
