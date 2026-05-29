import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AppModeProvider } from "@/contexts/AppModeContext";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";
import { DocumentsProvider } from "@/contexts/DocumentsContext/DocumentsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
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
  /**
   * Initial URL the MemoryRouter mounts at. Defaults to "/onboarding"
   * so existing tests don't need to think about routes. Pass a deeper
   * URL like "/onboarding/28454/utility" to exercise URL-driven
   * surface activation.
   */
  initialUrl?: string;
  /**
   * Forced bucket id for the ScenarioRegistry. Tests that exercise
   * URL routing need this to match the URL's bucket segment, since
   * production gets bucketId from the middleware response. Defaults
   * to 28454 (the staging/dev samples bucket).
   */
  registryBucketId?: number | null;
}

export const renderWithOnboardingProviders = (
  ui: ReactElement,
  {
    initialAuthState = "anonymous",
    initialFrame = "f1",
    initialScenario = null,
    initialScenarios = allTestScenarios,
    initialUrl,
    registryBucketId = 28454,
  }: RenderOnboardingOptions = {},
) => {
  // If the caller didn't specify a URL, derive one from
  // initialScenario so the URL ↔ state sync inside OnboardingShell
  // doesn't immediately deactivate the seeded entity. This keeps
  // pre-router tests (which only pass initialFrame/initialScenario)
  // working unchanged.
  const resolvedUrl =
    initialUrl ??
    (initialScenario ? `/onboarding/${registryBucketId}/${initialScenario}` : "/onboarding");
  return render(
    <GxThemeProvider>
      <LoadingProvider>
        <MessageBarProvider>
          <AppModeProvider initialAuthState={initialAuthState} initialScenario={initialScenario}>
            <ScenarioRegistryProvider
              forcedDemoState={{
                status: "ready",
                scenarios: initialScenarios,
                bucketId: registryBucketId,
                error: null,
              }}
            >
              {/* Production widgets (PdfViewerWidget etc.) consume
                  DocumentsContext. The provider sits inside the loading
                  + message bar wrappers because it dispatches to both. */}
              <DocumentsProvider>
                <OnboardingSessionProvider initialFrame={initialFrame} initialScenario={initialScenario}>
                  <CanvasOrchestratorProvider>
                    <OnboardingSkillProvider>
                      <HelmetProvider>
                        <MemoryRouter initialEntries={[resolvedUrl]}>
                          <Routes>
                            {/* Three onboarding route shapes — the
                                OnboardingShell reads useParams() and
                                useLocation() to decide what surface to
                                mount. */}
                            <Route path="/onboarding" element={ui} />
                            <Route path="/onboarding/signup" element={ui} />
                            <Route path="/onboarding/:bucketId/:scenarioId" element={ui} />
                            {/* Catch-all so tests that don't care about
                                routing still get their UI rendered. */}
                            <Route path="*" element={ui} />
                          </Routes>
                        </MemoryRouter>
                      </HelmetProvider>
                    </OnboardingSkillProvider>
                  </CanvasOrchestratorProvider>
                </OnboardingSessionProvider>
              </DocumentsProvider>
            </ScenarioRegistryProvider>
          </AppModeProvider>
        </MessageBarProvider>
      </LoadingProvider>
    </GxThemeProvider>,
  );
};
