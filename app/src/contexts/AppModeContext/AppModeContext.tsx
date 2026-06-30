import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from "react";

import { gaSetDefaults } from "@/lib/ga";
import type { AppMode, AuthState, Scenario } from "@/types/onboarding";

import type { AppModeApi, AppModeState } from "./types";

const DEFAULT_BYO_PAGES_LIMIT = 100;

const AppModeContext = createContext<AppModeApi | null>(null);

interface AppModeProviderProps {
  children: ReactNode;
  initialMode?: AppMode;
  initialAuthState?: AuthState;
  initialScenario?: Scenario | null;
  byoPagesLimit?: number;
}

export const AppModeProvider: FC<AppModeProviderProps> = ({
  children,
  initialMode = "onboarding",
  initialAuthState = "anonymous",
  initialScenario = null,
  byoPagesLimit = DEFAULT_BYO_PAGES_LIMIT,
}) => {
  const [state, setState] = useState<AppModeState>(() => ({
    mode: initialMode,
    authState: initialAuthState,
    scenario: initialScenario,
    usage: { byoPages: 0, byoPagesLimit },
  }));

  const setScenario = useCallback((scenario: Scenario | null) => {
    setState((previous) => ({ ...previous, scenario }));
  }, []);

  const promoteToSignedIn = useCallback(() => {
    setState((previous) => ({
      ...previous,
      authState: "signed-in",
      usage: { byoPages: 0, byoPagesLimit: previous.usage.byoPagesLimit },
    }));
  }, []);

  const flipToSteady = useCallback(() => {
    setState((previous) => ({ ...previous, mode: "steady" }));
  }, []);

  const incrementByoPages = useCallback((pages: number) => {
    setState((previous) => ({
      ...previous,
      usage: { ...previous.usage, byoPages: previous.usage.byoPages + pages },
    }));
  }, []);

  // OB-03 — keep the GA4 `appMode` dimension in sync with our state.
  // Effect fires on every mode flip (onboarding ↔ steady) so the
  // dimension is sticky on subsequent events without each caller
  // having to remember.
  useEffect(() => {
    gaSetDefaults({ appMode: state.mode });
  }, [state.mode]);

  const value = useMemo<AppModeApi>(
    () => ({ state, setScenario, promoteToSignedIn, flipToSteady, incrementByoPages }),
    [state, setScenario, promoteToSignedIn, flipToSteady, incrementByoPages]
  );

  return <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>;
};

export const useAppMode = (): AppModeApi => {
  const value = useContext(AppModeContext);
  if (!value) throw new Error("useAppMode must be used inside AppModeProvider");
  return value;
};
