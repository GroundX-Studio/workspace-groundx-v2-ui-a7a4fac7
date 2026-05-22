import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";

import { AgentToolBusProvider } from "@/contexts/AgentToolBusContext";
import { AppModeProvider } from "@/contexts/AppModeContext";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";
import { OnboardingSessionProvider } from "@/contexts/OnboardingSessionContext";
import { OnboardingSkillProvider } from "@/contexts/OnboardingSkillContext";
import { ScenarioRegistryProvider } from "@/contexts/ScenarioRegistryContext";
import { GxThemeProvider } from "@/ThemeProvider";
import { allTestScenarios } from "@/test/scenarioFixtures";
import type { AuthState, FFrame, Scenario } from "@/types/onboarding";
import type { ScenarioConfig } from "@/types/scenarios";

interface RenderOnboardingOptions {
  initialFrame?: FFrame;
  initialAuthState?: AuthState;
  initialScenario?: Scenario | null;
  initialScenarios?: ScenarioConfig[];
}

export const renderWithOnboardingProviders = (
  ui: ReactElement,
  { initialAuthState = "anonymous", initialFrame = "f1", initialScenario = null, initialScenarios = allTestScenarios }: RenderOnboardingOptions = {},
) =>
  render(
    <GxThemeProvider>
      <AppModeProvider initialAuthState={initialAuthState} initialScenario={initialScenario}>
        <ScenarioRegistryProvider initialScenarios={initialScenarios}>
          <OnboardingSessionProvider initialFrame={initialFrame} initialScenario={initialScenario}>
            <AgentToolBusProvider>
              <CanvasOrchestratorProvider>
                <OnboardingSkillProvider>
                  <HelmetProvider>{ui}</HelmetProvider>
                </OnboardingSkillProvider>
              </CanvasOrchestratorProvider>
            </AgentToolBusProvider>
          </OnboardingSessionProvider>
        </ScenarioRegistryProvider>
      </AppModeProvider>
    </GxThemeProvider>,
  );
