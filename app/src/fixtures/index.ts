import type { Scenario } from "@/types/onboarding";

import { loanFixture } from "./loan";
import { solarFixture } from "./solar";
import type { ScenarioFixture } from "./types";
import { utilityFixture } from "./utility";

export const scenarioFixtures: Record<Scenario, ScenarioFixture> = {
  utility: utilityFixture,
  loan: loanFixture,
  solar: solarFixture,
};

export const getScenarioFixture = (scenario: Scenario): ScenarioFixture => scenarioFixtures[scenario];

export type { ScenarioFixture } from "./types";
export type { FixtureChatTurn, FixtureCategory, FixtureDoc, FixtureField, FixtureReport, FixtureReportSection, FixtureSchema } from "./types";
