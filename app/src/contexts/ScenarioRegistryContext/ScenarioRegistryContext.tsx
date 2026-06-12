import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FC, type ReactNode } from "react";

import { useApi } from "@/contexts/ApiContext";
import { readRegistryDemoOverride } from "@/lib/demoState";
import type { ScenarioConfig } from "@/types/scenarios";

import type { ScenarioRegistryApi, ScenarioRegistryState } from "./types";

const ScenarioRegistryContext = createContext<ScenarioRegistryApi | null>(null);
const INITIAL_LOAD_ATTEMPTS = 4;
const INITIAL_LOAD_RETRY_DELAY_MS = 750;

interface LoadScenariosOptions {
  attempts?: number;
  retryDelayMs?: number;
  shouldContinue?: () => boolean;
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, ms));

interface ScenarioRegistryProviderProps {
  children: ReactNode;
  /** Used by tests to bypass the network fetch. */
  initialScenarios?: ScenarioConfig[];
  /**
   * Dev-only demo-state override. When non-null, this state replaces both
   * the initial state and the result of any `refresh()` call. Production
   * builds tree-shake the URL-reading helper so this is always null in
   * prod; in dev, the App.tsx wrapper reads URL params (?registry=...)
   * and passes the parsed override in here. Tests pass it directly.
   */
  forcedDemoState?: ScenarioRegistryState | null;
}

/**
 * Loads the sample scenario catalog from GET /api/scenarios on mount.
 * Consumers should render loading + error UI when state.status is anything
 * other than "ready". The catalog is partner-owned content that rarely
 * changes; we fetch once on mount and only re-fetch on explicit refresh().
 *
 * Demo override (dev only): pass `forcedDemoState` (or in App.tsx, let
 * the URL parser read `?registry=empty|error|loading`). When set, the
 * provider skips the network fetch and any refresh() returns the same
 * forced state. Useful for previewing non-default UI without manipulating
 * the bucket or middleware.
 */
export const ScenarioRegistryProvider: FC<ScenarioRegistryProviderProps> = ({
  children,
  initialScenarios,
  forcedDemoState,
}) => {
  const apiClient = useApi();
  const loadGenerationRef = useRef(0);
  // forcedDemoState wins over initialScenarios. If neither is set, the
  // provider starts in `idle` and the useEffect kicks off the real fetch.
  const [state, setState] = useState<ScenarioRegistryState>(() => {
    if (forcedDemoState) return forcedDemoState;
    if (initialScenarios) return { status: "ready", scenarios: initialScenarios, bucketId: null, error: null };
    return { status: "idle", scenarios: [], bucketId: null, error: null };
  });

  const loadScenarios = useCallback(async ({
    attempts = 1,
    retryDelayMs = 0,
    shouldContinue = () => true,
  }: LoadScenariosOptions = {}) => {
    const generation = loadGenerationRef.current + 1;
    loadGenerationRef.current = generation;
    const canCommit = () => loadGenerationRef.current === generation && shouldContinue();

    // In demo mode, refresh() re-asserts the forced state instead of
    // hitting the network. This means the Retry button in the F1 status
    // panel is still clickable and visible-state-stable when demoing.
    if (forcedDemoState) {
      setState(forcedDemoState);
      return;
    }
    setState((previous) => ({ ...previous, status: "loading", error: null }));

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const { bucketId, scenarios } = await apiClient.scenario.listScenarios();
        if (!canCommit()) return;
        setState({ status: "ready", scenarios, bucketId, error: null });
        return;
      } catch (error) {
        lastError = error;
        if (attempt < attempts) {
          await delay(retryDelayMs);
          if (!canCommit()) return;
        }
      }
    }

    if (!canCommit()) return;
    const message = lastError instanceof Error ? lastError.message : "Failed to load scenarios";
    setState({ status: "error", scenarios: [], bucketId: null, error: message });
  }, [apiClient.scenario, forcedDemoState]);

  const refresh = useCallback(async () => {
    await loadScenarios();
  }, [loadScenarios]);

  useEffect(() => {
    // Demo mode: never fetch.
    if (forcedDemoState) return;
    if (initialScenarios) return;
    let active = true;
    void loadScenarios({
      attempts: INITIAL_LOAD_ATTEMPTS,
      retryDelayMs: INITIAL_LOAD_RETRY_DELAY_MS,
      shouldContinue: () => active,
    });
    return () => {
      active = false;
    };
  }, [forcedDemoState, initialScenarios, loadScenarios]);

  // `all()` is the Catalog<ScenarioConfig> enumerate view over the
  // ready-state data; `byId` is the lookup view. The async status +
  // `refresh()` remain the remote-catalog extension (RCC design.md §3).
  const all = useCallback(() => state.scenarios, [state.scenarios]);

  const byId = useCallback(
    (id: string) => state.scenarios.find((scenario) => scenario.id === id),
    [state.scenarios]
  );

  const api: ScenarioRegistryApi = useMemo(
    () => ({ state, refresh, all, byId }),
    [state, refresh, all, byId]
  );

  return <ScenarioRegistryContext.Provider value={api}>{children}</ScenarioRegistryContext.Provider>;
};

/**
 * Convenience wrapper used at the App root: reads `?registry=...` from
 * the URL and passes it as `forcedDemoState` to the underlying provider.
 * Tests and other callers can keep using `<ScenarioRegistryProvider>`
 * directly.
 */
export const ScenarioRegistryProviderWithDemoHooks: FC<{ children: ReactNode }> = ({ children }) => {
  const forced = readRegistryDemoOverride();
  return <ScenarioRegistryProvider forcedDemoState={forced}>{children}</ScenarioRegistryProvider>;
};

export const useScenarioRegistry = (): ScenarioRegistryApi => {
  const ctx = useContext(ScenarioRegistryContext);
  if (!ctx) {
    throw new Error("useScenarioRegistry must be used within a ScenarioRegistryProvider");
  }
  return ctx;
};

/**
 * Non-throwing variant — returns `null` when no provider is present. Mirrors
 * `useOnboardingSessionOptional`. Used by `ChatColumn`, which is mounted by
 * BOTH shells: the steady chat (a non-onboarding session) never reads the
 * scenario registry, so its narrower mount trees needn't supply the provider.
 */
export const useScenarioRegistryOptional = (): ScenarioRegistryApi | null => {
  return useContext(ScenarioRegistryContext) ?? null;
};
