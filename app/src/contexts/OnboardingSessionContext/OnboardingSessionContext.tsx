import { createContext, useCallback, useContext, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import { useChatStore } from "@/contexts/ChatStoreContext";
import {
  EntityRegistryProvider,
  makeEntityKey,
  useEntityRegistry,
  type EntityKey,
  type EntitySession,
} from "@/contexts/EntityRegistryContext";
import type { FFrame, GateTrigger, Scenario } from "@/types/onboarding";

import type { GateStatus, OnboardingSessionApi, OnboardingSessionState } from "./types";

const OnboardingSessionContext = createContext<OnboardingSessionApi | null>(null);

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
  const registry = useEntityRegistry();
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
  const { appendViewerEvent } = useChatStore();
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
    };
  }, [sessionId, active, signupOpen, gate]);

  const bootstrapSession = useCallback((id: string) => {
    setSessionId(id);
  }, []);

  const pickScenario = useCallback(
    (scenario: Scenario) => {
      setSignupOpen(false);
      upsertAndActivate("sample", scenario, {
        lastFrame: "f2",
        completedFrames: new Set<FFrame>(["f1"]),
      });
      // Phase E: record the entity-open ViewerEvent. Last ~10
      // viewer events feed the LLM context bundling.
      appendViewerEvent({
        action: "opened",
        entityKey: makeEntityKey("sample", scenario),
        source: "user",
        detail: { scenario },
      });
    },
    [upsertAndActivate, appendViewerEvent],
  );

  const advanceFrame = useCallback(
    (frame: FFrame) => {
      if (frame === "f1") {
        // Capture the entity key BEFORE deactivating so the "left"
        // event references the right entity.
        const leavingKey = activeKeyRef.current;
        activate(null);
        setSignupOpen(false);
        appendViewerEvent({
          action: "left",
          entityKey: leavingKey,
          source: "user",
        });
        return;
      }
      if (!activeKeyRef.current) {
        return;
      }
      const entityKeyAtAdvance = activeKeyRef.current;
      updateActive((session) => {
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
    },
    [activate, updateActive, appendViewerEvent],
  );

  const openGate = useCallback(
    (trigger: GateTrigger) => {
      if (trigger === "byo" && !activeKeyRef.current) {
        setSignupOpen(true);
      }
      let shouldRecord = false;
      setGate((prev) => {
        if (prev.status === "committed") return prev;
        // `open(sameTrigger)` while already open is a no-op — the gate is
        // already showing the right thing, no point re-recording.
        if (prev.status === "open" && prev.trigger === trigger) return prev;
        // `dismissed → open(sameTrigger)` MUST re-enter the gate.
        // The user clicked Sign Up, dismissed it, then clicked Sign Up
        // again — that's an explicit re-trigger and the gate should
        // re-open. (We previously short-circuited this and left the gate
        // stuck in `dismissed`, which broke the BYO re-click flow.)
        shouldRecord = true;
        return { status: "open", trigger, openedAt: Date.now() };
      });
      if (shouldRecord) {
        appendViewerEvent({
          action: "intent-dispatched",
          entityKey: activeKeyRef.current,
          source: "user",
          detail: { intent: "gate-open", trigger },
        });
      }
    },
    [appendViewerEvent],
  );

  const dismissGate = useCallback(() => {
    let shouldRecord = false;
    setGate((prev) => {
      if (prev.status !== "open") return prev;
      shouldRecord = true;
      return { status: "dismissed", trigger: prev.trigger, dismissedAt: Date.now() };
    });
    setSignupOpen(false);
    if (shouldRecord) {
      appendViewerEvent({
        action: "intent-dispatched",
        entityKey: activeKeyRef.current,
        source: "user",
        detail: { intent: "gate-dismiss" },
      });
    }
  }, [appendViewerEvent]);

  const commitGate = useCallback(
    (method: "magic-link" | "sso" | "engineer-call") => {
      setGate({ status: "committed", method });
      appendViewerEvent({
        action: "intent-dispatched",
        entityKey: activeKeyRef.current,
        source: "user",
        detail: { intent: "gate-commit", method },
      });
    },
    [appendViewerEvent],
  );

  return useMemo<OnboardingSessionApi>(
    () => ({ state, bootstrapSession, pickScenario, advanceFrame, openGate, dismissGate, commitGate }),
    [state, bootstrapSession, pickScenario, advanceFrame, openGate, dismissGate, commitGate],
  );
}

/**
 * Inner provider — assumes EntityRegistryProvider is mounted above
 * it. Exposes the legacy `OnboardingSessionApi` to consumers.
 */
const InnerSessionProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const value = useSessionFacade();
  return <OnboardingSessionContext.Provider value={value}>{children}</OnboardingSessionContext.Provider>;
};

/**
 * Public provider — mounts the EntityRegistryProvider itself so
 * existing call sites don't have to know about the new registry
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
    <EntityRegistryProvider initialEntities={initialEntities} initialActiveKey={initialActiveKey}>
      <InnerSessionProvider>{children}</InnerSessionProvider>
    </EntityRegistryProvider>
  );
};

export const useOnboardingSession = (): OnboardingSessionApi => {
  const value = useContext(OnboardingSessionContext);
  if (!value) throw new Error("useOnboardingSession must be used inside OnboardingSessionProvider");
  return value;
};

// re-export for external `makeEntityKey` callers (e.g., tests that
// need to construct an entity key for inspection)
export { makeEntityKey };
