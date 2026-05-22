import { createContext, useCallback, useContext, useMemo, useState, type FC, type ReactNode } from "react";

import type { FFrame, GateTrigger, Scenario } from "@/types/onboarding";

import type { GateStatus, OnboardingSessionApi, OnboardingSessionState } from "./types";

const OnboardingSessionContext = createContext<OnboardingSessionApi | null>(null);

interface OnboardingSessionProviderProps {
  children: ReactNode;
  initialFrame?: FFrame;
}

export const OnboardingSessionProvider: FC<OnboardingSessionProviderProps> = ({
  children,
  initialFrame = "f1",
}) => {
  const [state, setState] = useState<OnboardingSessionState>(() => ({
    sessionId: null,
    currentFrame: initialFrame,
    completedFrames: new Set<FFrame>(),
    scenario: null,
    gate: { status: "idle" },
  }));

  const bootstrapSession = useCallback((sessionId: string) => {
    setState((previous) => ({ ...previous, sessionId }));
  }, []);

  const pickScenario = useCallback((scenario: Scenario) => {
    setState((previous) => ({ ...previous, scenario }));
  }, []);

  const advanceFrame = useCallback((frame: FFrame) => {
    setState((previous) => {
      const completedFrames = new Set(previous.completedFrames);
      completedFrames.add(previous.currentFrame);
      return { ...previous, currentFrame: frame, completedFrames };
    });
  }, []);

  const openGate = useCallback((trigger: GateTrigger) => {
    setState((previous) => {
      // Once committed, never re-open.
      if (previous.gate.status === "committed") return previous;
      const gate: GateStatus = { status: "open", trigger, openedAt: Date.now() };
      return { ...previous, gate };
    });
  }, []);

  const dismissGate = useCallback(() => {
    setState((previous) => {
      if (previous.gate.status !== "open") return previous;
      const gate: GateStatus = {
        status: "dismissed",
        trigger: previous.gate.trigger,
        dismissedAt: Date.now(),
      };
      return { ...previous, gate };
    });
  }, []);

  const commitGate = useCallback((method: "magic-link" | "sso" | "engineer-call") => {
    setState((previous) => ({ ...previous, gate: { status: "committed", method } }));
  }, []);

  const value = useMemo<OnboardingSessionApi>(
    () => ({ state, bootstrapSession, pickScenario, advanceFrame, openGate, dismissGate, commitGate }),
    [state, bootstrapSession, pickScenario, advanceFrame, openGate, dismissGate, commitGate]
  );

  return <OnboardingSessionContext.Provider value={value}>{children}</OnboardingSessionContext.Provider>;
};

export const useOnboardingSession = (): OnboardingSessionApi => {
  const value = useContext(OnboardingSessionContext);
  if (!value) throw new Error("useOnboardingSession must be used inside OnboardingSessionProvider");
  return value;
};
