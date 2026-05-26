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
import { ScenarioRegistryProviderWithDemoHooks } from "@/contexts/ScenarioRegistryContext";
import { MotionRoot } from "@/shared/components/MotionRoot";
import { WireframeFilters } from "@/shared/components/WireframeFilters";
import { GxThemeProvider } from "@/ThemeProvider";
import { router } from "@/router/router";

export default function App() {
  return (
    <GxThemeProvider>
      {/* UR-03: global MotionConfig — honors OS `prefers-reduced-motion`
          for every descendant `motion.X`. When reduced is on, the
          default transition floor is 80 ms (linear). Per-component
          `transition` props still override; this is the floor, not
          the ceiling. */}
      <MotionRoot>
        {/* Global SVG defs used by the F-series sample cards / BYO tiles to get
            the slightly-rough wireframe edge — see `WireframeFilters`. */}
        <WireframeFilters />
        <LoadingProvider>
          <MessageBarProvider>
            <AuthProvider>
              <AppModeProvider>
                <ScenarioRegistryProviderWithDemoHooks>
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
                </ScenarioRegistryProviderWithDemoHooks>
              </AppModeProvider>
            </AuthProvider>
          </MessageBarProvider>
        </LoadingProvider>
      </MotionRoot>
    </GxThemeProvider>
  );
}
