import { createContext, useCallback, useContext, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import { useChatStore } from "@/contexts/ChatStoreContext";
import { track } from "@/lib/analytics";
import { gaSetDefaults } from "@/lib/ga";
import {
  EntitySessionStoreProvider,
  makeEntityKey,
  useEntitySessionStore,
  type EntityKey,
  type EntitySession,
} from "@/contexts/EntitySessionStoreContext";
import type { FFrame, GateTrigger, Scenario } from "@/types/onboarding";

import type { GateCause, GateStatus, OnboardingSessionApi, OnboardingSessionState } from "./types";

const OnboardingSessionContext = createContext<OnboardingSessionApi | null>(null);

/**
 * `master-viewer-session` Phase 3 / post-mvs-cleanup Phase B — map an
 * F-series frame to its canonical `ViewerStep` projection. Hoisted out
 * of the hook so it can be called from `pickScenario` and `advanceFrame`
 * regardless of declaration order. The scenario id rides along on step
 * kinds that need it.
 */
function frameToStepStandalone(
  frame: FFrame,
  scenario: Scenario | null,
): import("@/contexts/ChatStoreContext").ViewerStep {
  switch (frame) {
    case "f1":
      return { kind: "ingest-picker" };
    case "f2":
      return { kind: "doc-viewer", documentId: scenario ? `scenario:${scenario}` : "scenario:unknown" };
    case "f3":
    case "f3a":
      return { kind: "extract-workbench", scenarioId: scenario ?? "unknown" };
    // 2026-05-29-smart-report-screen Phase 1 — f4 = Report render (S3),
    // f4a = Report builder (S3a). Both project to the `report` ViewerStep
    // kind (the render surface reads the active scenario's scope); f4 used
    // to mis-route to `extract-workbench` (the bug this change fixes).
    case "f4":
    case "f4a":
      return { kind: "report" };
    case "f5":
    case "f6":
      return { kind: "interact-chat", scenarioId: scenario ?? "unknown" };
    case "f7":
      return { kind: "integrate" };
    default:
      return { kind: "ingest-picker" };
  }
}

interface OnboardingSessionProviderProps {
  children: ReactNode;
  initialFrame?: FFrame;
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
  // Signup surface flag. When true, the user clicked BYO (a sign-up
  // trigger from the F1 picker) and we render the shell with the
  // gate in chat + BYO placeholder in canvas. BYO is intentionally
  // NOT an entity — it has no per-instance state, just a session
  // boolean + the session-level gate.
  const [signupOpen, setSignupOpen] = useState<boolean>(false);
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

  // Derive the legacy state shape. Frame logic:
  //   - active entity → entity.lastFrame
  //   - signup surface → "f2" (shell renders the BYO placeholder
  //     using UnderstandView's scenario=null path)
  //   - picker → "f1"
  const state: OnboardingSessionState = useMemo(() => {
    let currentFrame: FFrame;
    if (active) currentFrame = active.lastFrame;
    else if (signupOpen) currentFrame = "f2";
    else currentFrame = "f1";
    return {
      sessionId,
      currentFrame,
      completedFrames: active?.completedFrames ?? new Set<FFrame>(),
      scenario: active?.kind === "sample" ? (active.id as Scenario) : null,
      gate,
      selectedReportSectionId,
    };
  }, [sessionId, active, signupOpen, gate, selectedReportSectionId]);

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
      // post-mvs-cleanup Phase B fix — push the viewer step matching the
      // entity's RESOLVED frame, not the assumed F2 default. Existing
      // entities preserve their lastFrame across upsertAndActivate; if we
      // unconditionally pushed `doc-viewer` we'd render UnderstandView
      // when the entity was previously at F5/F6.
      const targetKey = makeEntityKey("sample", scenario);
      const existingEntity = registry.state.entities.get(targetKey);
      const resolvedFrame: FFrame = existingEntity?.lastFrame ?? "f2";
      upsertAndActivate("sample", scenario, {
        lastFrame: "f2",
        completedFrames: new Set<FFrame>(["f1"]),
      });
      pushStep(frameToStepStandalone(resolvedFrame, scenario));
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

  // post-mvs-cleanup Phase B — `frameToStepStandalone` is now a module-
  // level function (hoisted above the hook); see top of file.

  const advanceFrame = useCallback(
    (frame: FFrame, options?: { selectedReportSectionId?: string }) => {
      // Carry (or clear) the builder's pre-selected section. Only the builder
      // frame (f4a) keeps a selection; advancing anywhere else clears it so a
      // stale section can't pre-open a later builder visit.
      setSelectedReportSectionId(
        frame === "f4a" ? options?.selectedReportSectionId ?? null : null,
      );
      if (frame === "f1") {
        // Capture the entity key BEFORE deactivating so the "left"
        // event references the right entity.
        const leavingKey = activeKeyRef.current;
        // Diagnostic — dev-only console trace of frame transitions.
        // eslint-disable-next-line no-console
        console.log("[advanceFrame] →", frame, "(deactivating entity)");
        activate(null);
        setSignupOpen(false);
        // Returning to the F1 picker means the user has bailed out of
        // any in-flight gate (e.g. they clicked Sign Up from F1, then
        // clicked the Ingest step or hit the browser back button).
        // Leaving the gate `open` would keep `OnboardingShell.gateActive`
        // true and the canvas swap would render `<SignUpWidget />` over
        // the F1 picker — and then over F2 when the user picks a
        // sample. `committed` (signed-in) and `dismissed` are
        // preserved; only the pending-open state resets.
        setGate((prev) => (prev.status === "open" ? { status: "idle" } : prev));
        appendViewerEvent({
          action: "left",
          entityKey: leavingKey,
          source: "user",
        });
        // `master-viewer-session` Phase 3 — accumulate the viewer step.
        pushStep(frameToStepStandalone("f1", null));
        return;
      }
      if (!activeKeyRef.current) {
        return;
      }
      const entityKeyAtAdvance = activeKeyRef.current;
      updateActive((session) => {
        // Diagnostic — log the actual from→to transition.
        // eslint-disable-next-line no-console
        console.log(
          "[advanceFrame]",
          session.lastFrame,
          "→",
          frame,
          session.lastFrame === frame ? "(no-op, already there)" : "",
        );
        if (session.lastFrame === frame) return session;
        const completedFrames = new Set(session.completedFrames);
        completedFrames.add(session.lastFrame);
        return { ...session, lastFrame: frame, completedFrames };
      });
      appendViewerEvent({
        action: "frame-advanced",
        entityKey: entityKeyAtAdvance,
        source: "user",
        detail: { frame },
      });
      // `master-viewer-session` Phase 3 — accumulate the viewer step.
      // Derive the scenario id from the entity key (`sample:utility` →
      // `utility`); falls back to `unknown` if the key isn't a sample
      // entity. The pushStep action is idempotent on structural
      // equality, so a re-fire of the same frame transition won't
      // pollute history.
      const scenarioFromKey = entityKeyAtAdvance?.startsWith("sample:")
        ? (entityKeyAtAdvance.slice("sample:".length) as Scenario)
        : null;
      pushStep(frameToStepStandalone(frame, scenarioFromKey));
      // OB-02 — understand.completed when leaving F2 (the scan
      // animation finished and the user advanced).
      if (frame === "f3" || frame === "f3a") {
        track("understand.completed", { fromFrame: "f2", toFrame: frame });
      }
    },
    [activate, updateActive, appendViewerEvent, pushStep],
  );

  const openGate = useCallback(
    (trigger: GateTrigger, options?: { cause?: GateCause }) => {
      if (trigger === "byo" && !activeKeyRef.current) {
        setSignupOpen(true);
      }
      const cause = options?.cause;
      let shouldRecord = false;
      setGate((prev) => {
        if (prev.status === "committed") return prev;
        // `open(sameTrigger, sameCause)` while already open is a no-op
        // — the gate is already showing the right thing, no point
        // re-recording. Different cause IS a meaningful re-open.
        if (prev.status === "open" && prev.trigger === trigger && prev.cause === cause) return prev;
        // `dismissed → open(sameTrigger)` MUST re-enter the gate.
        // The user clicked Sign Up, dismissed it, then clicked Sign Up
        // again — that's an explicit re-trigger and the gate should
        // re-open. (We previously short-circuited this and left the gate
        // stuck in `dismissed`, which broke the BYO re-click flow.)
        shouldRecord = true;
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
      advanceFrame,
      openGate,
      dismissGate,
      commitGate,
    }),
    [
      state,
      bootstrapSession,
      pickScenario,
      advanceFrame,
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
 * `initialFrame` + `initialScenario` are translated into seed
 * EntityRegistry state SYNCHRONOUSLY — they become the registry's
 * initialEntities/initialActiveKey on first render. This matters for
 * tests: a synchronous `render()` followed by a synchronous DOM
 * query must see the test's requested frame (F2, F3, …) instead of
 * F1, which it would if we seeded via useEffect.
 */
export const OnboardingSessionProvider: FC<OnboardingSessionProviderProps> = ({
  children,
  initialFrame = "f1",
  initialScenario = null,
}) => {
  const { initialEntities, initialActiveKey } = useMemo(() => {
    if (!initialScenario) {
      return { initialEntities: undefined, initialActiveKey: null as EntityKey | null };
    }
    const key = makeEntityKey("sample", initialScenario);
    const now = Date.now();
    const seed: EntitySession = {
      kind: "sample",
      id: initialScenario,
      lastFrame: initialFrame,
      completedFrames: new Set<FFrame>(),
      createdAt: now,
      lastVisitedAt: now,
    };
    const map = new Map<EntityKey, EntitySession>();
    map.set(key, seed);
    return { initialEntities: map, initialActiveKey: key };
  }, [initialFrame, initialScenario]);

  return (
    <EntitySessionStoreProvider initialEntities={initialEntities} initialActiveKey={initialActiveKey}>
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
