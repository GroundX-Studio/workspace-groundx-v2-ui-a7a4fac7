import type { Catalog } from "@groundx/shared";

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

/**
 * The scenario registry's data-access API. Its ready-state data view
 * satisfies the shared `Catalog<ScenarioConfig>` read contract
 * (`all()` + `byId()`); the async status machine + `refresh()` + Context
 * delivery are the legitimate remote-catalog extension layered on top
 * (RCC design.md §3 — sourcing/delivery differs, the read contract is shared).
 */
export interface ScenarioRegistryApi extends Catalog<ScenarioConfig> {
  state: ScenarioRegistryState;
  /** Re-fetch the catalog. Useful after a seed run. */
  refresh: () => Promise<void>;
  /**
   * Every loaded scenario, in stable order (`state.scenarios`). Empty
   * before the catalog loads. Satisfies `Catalog<T>.all()`.
   */
  all: () => readonly ScenarioConfig[];
  /** Find a scenario by id, or undefined if not loaded. */
  byId: (id: string) => ScenarioConfig | undefined;
}
