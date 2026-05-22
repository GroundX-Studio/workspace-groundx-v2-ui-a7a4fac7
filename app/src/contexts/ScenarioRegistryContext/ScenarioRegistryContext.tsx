import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FC, type ReactNode } from "react";

import { listScenarios } from "@/api/entities/scenarioRegistryEntity";
import type { ScenarioConfig } from "@/types/scenarios";

import type { ScenarioRegistryApi, ScenarioRegistryState } from "./types";

const ScenarioRegistryContext = createContext<ScenarioRegistryApi | null>(null);

interface ScenarioRegistryProviderProps {
  children: ReactNode;
  /** Used by tests to bypass the network fetch. */
  initialScenarios?: ScenarioConfig[];
}

/**
 * Loads the sample scenario catalog from GET /api/scenarios on mount.
 * Consumers should render loading + error UI when state.status is anything
 * other than "ready". The catalog is partner-owned content that rarely
 * changes; we fetch once on mount and only re-fetch on explicit refresh().
 */
export const ScenarioRegistryProvider: FC<ScenarioRegistryProviderProps> = ({ children, initialScenarios }) => {
  const [state, setState] = useState<ScenarioRegistryState>(() =>
    initialScenarios
      ? { status: "ready", scenarios: initialScenarios, error: null }
      : { status: "idle", scenarios: [], error: null }
  );

  const refresh = useCallback(async () => {
    setState((previous) => ({ ...previous, status: "loading", error: null }));
    try {
      const scenarios = await listScenarios();
      setState({ status: "ready", scenarios, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load scenarios";
      setState({ status: "error", scenarios: [], error: message });
    }
  }, []);

  useEffect(() => {
    if (initialScenarios) return;
    void refresh();
  }, [initialScenarios, refresh]);

  const byId = useCallback(
    (id: string) => state.scenarios.find((scenario) => scenario.id === id),
    [state.scenarios]
  );

  const api: ScenarioRegistryApi = useMemo(() => ({ state, refresh, byId }), [state, refresh, byId]);

  return <ScenarioRegistryContext.Provider value={api}>{children}</ScenarioRegistryContext.Provider>;
};

export const useScenarioRegistry = (): ScenarioRegistryApi => {
  const ctx = useContext(ScenarioRegistryContext);
  if (!ctx) {
    throw new Error("useScenarioRegistry must be used within a ScenarioRegistryProvider");
  }
  return ctx;
};
