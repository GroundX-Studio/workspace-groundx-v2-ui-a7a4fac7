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
import { GxThemeProvider } from "@/ThemeProvider";
import { router } from "@/router/router";

export default function App() {
  return (
    <GxThemeProvider>
      <LoadingProvider>
        <MessageBarProvider>
          <AuthProvider>
            <AppModeProvider>
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
            </AppModeProvider>
          </AuthProvider>
        </MessageBarProvider>
      </LoadingProvider>
    </GxThemeProvider>
  );
}
