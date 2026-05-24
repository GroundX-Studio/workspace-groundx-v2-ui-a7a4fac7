import axios from "@/api/axios";
import { scenariosUrl } from "@/api/common";
import type { ScenarioConfig } from "@/types/scenarios";

export interface ListScenariosResponse {
  /**
   * Numeric GroundX bucket the samples live in. Returned by the
   * middleware so the frontend can build canonical URLs of the form
   * `/onboarding/<bucketId>/<scenarioId>` without needing its own
   * env. `null` when the middleware doesn't know (mostly tests or
   * deployments without the env var set).
   */
  bucketId: number | null;
  scenarios: ScenarioConfig[];
}

export interface ListScenariosResult {
  bucketId: number | null;
  scenarios: ScenarioConfig[];
}

/**
 * Fetch the onboarding sample catalog from the middleware. The catalog is
 * sourced from the partner's GroundX samples bucket (every doc's `filter`
 * carries scenario metadata; the first doc per scenario carries the full
 * manifest). See middleware/src/scenarios/registry.ts.
 *
 * No auth required — samples are public, partner-owned content.
 */
export const listScenarios = async (): Promise<ListScenariosResult> => {
  const response = await axios.get<ListScenariosResponse>(scenariosUrl);
  return { bucketId: response.data.bucketId ?? null, scenarios: response.data.scenarios };
};
