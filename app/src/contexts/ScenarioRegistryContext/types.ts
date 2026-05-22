import type { ScenarioConfig } from "@/types/scenarios";

export type ScenarioRegistryStatus = "idle" | "loading" | "ready" | "error";

export interface ScenarioRegistryState {
  status: ScenarioRegistryStatus;
  scenarios: ScenarioConfig[];
  error: string | null;
}

export interface ScenarioRegistryApi {
  state: ScenarioRegistryState;
  /** Re-fetch the catalog. Useful after a seed run. */
  refresh: () => Promise<void>;
  /** Find a scenario by id, or undefined if not loaded. */
  byId: (id: string) => ScenarioConfig | undefined;
}
