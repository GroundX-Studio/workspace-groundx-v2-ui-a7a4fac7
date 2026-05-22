import axios from "@/api/axios";
import { scenariosUrl } from "@/api/common";
import type { ScenarioConfig } from "@/types/scenarios";

export interface ListScenariosResponse {
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
export const listScenarios = async (): Promise<ScenarioConfig[]> => {
  const response = await axios.get<ListScenariosResponse>(scenariosUrl);
  return response.data.scenarios;
};
