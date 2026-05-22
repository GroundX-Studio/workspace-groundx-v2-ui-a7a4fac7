import { HelmetProvider } from "react-helmet-async";
import { RouterProvider } from "react-router-dom";

import { AuthProvider } from "@/contexts/AuthContext/AuthProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { AppModeProvider } from "@/contexts/AppModeContext";
import { OnboardingSessionProvider } from "@/contexts/OnboardingSessionContext";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";
import { AgentToolBusProvider } from "@/contexts/AgentToolBusContext";
import { OnboardingSkillProvider } from "@/contexts/OnboardingSkillContext";
import { ScenarioRegistryProvider } from "@/contexts/ScenarioRegistryContext";
import { WireframeFilters } from "@/shared/components/WireframeFilters";
import { GxThemeProvider } from "@/ThemeProvider";
import { router } from "@/router/router";

export default function App() {
  return (
    <GxThemeProvider>
      {/* Global SVG defs used by the F-series sample cards / BYO tiles to get
          the slightly-rough wireframe edge — see `WireframeFilters`. */}
      <WireframeFilters />
      <LoadingProvider>
        <MessageBarProvider>
          <AuthProvider>
            <AppModeProvider>
              <ScenarioRegistryProvider>
                <OnboardingSessionProvider>
                  <AgentToolBusProvider>
                    <CanvasOrchestratorProvider>
                      <OnboardingSkillProvider>
                        <HelmetProvider>
                          <RouterProvider router={router} />
                        </HelmetProvider>
                      </OnboardingSkillProvider>
                    </CanvasOrchestratorProvider>
                  </AgentToolBusProvider>
                </OnboardingSessionProvider>
              </ScenarioRegistryProvider>
            </AppModeProvider>
          </AuthProvider>
        </MessageBarProvider>
      </LoadingProvider>
    </GxThemeProvider>
  );
}
