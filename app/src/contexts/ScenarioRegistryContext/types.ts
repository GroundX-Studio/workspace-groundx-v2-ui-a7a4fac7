import type { ScenarioConfig } from "@/types/scenarios";

export type ScenarioRegistryStatus = "idle" | "loading" | "ready" | "error";

export interface ScenarioRegistryState {
  status: ScenarioRegistryStatus;
  scenarios: ScenarioConfig[];
  /**
   * Numeric GroundX bucket holding the samples. Returned by the
   * middleware alongside the scenarios; used by URL routing to
   * construct canonical sample URLs (/onboarding/<bucketId>/<scenarioId>).
   * `null` when the middleware can't report it (no env var) or
   * before the registry loads.
   */
  bucketId: number | null;
  error: string | null;
}

export interface ScenarioRegistryApi {
  state: ScenarioRegistryState;
  /** Re-fetch the catalog. Useful after a seed run. */
  refresh: () => Promise<void>;
  /** Find a scenario by id, or undefined if not loaded. */
  byId: (id: string) => ScenarioConfig | undefined;
}
