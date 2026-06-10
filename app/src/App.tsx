import { HelmetProvider } from "react-helmet-async";
import { RouterProvider } from "react-router-dom";
import type { FC, ReactNode } from "react";

import { realApi, type Api } from "@/api/client";
import { ApiProvider } from "@/contexts/ApiContext";
import { AuthProvider } from "@/contexts/AuthContext/AuthProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { AppModeProvider } from "@/contexts/AppModeContext";
import { DocumentsProvider } from "@/contexts/DocumentsContext/DocumentsProvider";
import { OnboardingSessionProvider } from "@/contexts/OnboardingSessionContext";
import { CanvasOrchestratorProvider } from "@/contexts/CanvasOrchestratorContext";
import { OnboardingSkillProvider } from "@/contexts/OnboardingSkillContext";
import { AnalyticsConsentProvider } from "@/components/privacy/AnalyticsConsent/AnalyticsConsentProvider";
import { ScenarioRegistryProviderWithDemoHooks } from "@/contexts/ScenarioRegistryContext";
import { AppErrorBoundary } from "@/components/layout/AppErrorBoundary/AppErrorBoundary";
import { DebugOverlay } from "@/components/layout/DebugOverlay/DebugOverlay";
import { MotionRoot } from "@/components/primitives/MotionRoot/MotionRoot";
import { WireframeFilters } from "@/components/brand/WireframeFilters/WireframeFilters";
import { GxThemeProvider } from "@/ThemeProvider";
import { router, ROUTER_FUTURE_FLAGS } from "@/router/router";

/**
 * AppProviders — the production provider stack, factored out of `App`
 * so tests can mount it around any probe without going through the
 * router.
 *
 * **The order matters and must stay the same as the runtime mount.**
 * When you add a new provider to the App tree, add it here too; the
 * `App.test.tsx` smoke test verifies the chain is intact.
 *
 * Drift between this stack and a test helper is exactly how the
 * 2026-05-25 `useDocumentsContext`-missing crash got into production:
 * the helper had `DocumentsProvider`, this didn't. Lesson burned in
 * — keep the test helper aligned with this component.
 */
export const AppProviders: FC<{ children: ReactNode; apiClient?: Api }> = ({
  children,
  apiClient = realApi,
}) => (
  <ApiProvider value={apiClient}>
    {/* ApiProvider is the OUTERMOST provider (above the consumer providers):
        DocumentsProvider / AuthProvider / OnboardingSessionProvider et al.
        read the injected network client via `useApi()`, so they must sit
        inside it. Production wires the real client (`realApi`); tests inject
        `makeFakeApi` through the render harnesses. */}
    <AppErrorBoundary captureException={apiClient.telemetry.captureException}>
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
          <AnalyticsConsentProvider>
            <LoadingProvider>
              <MessageBarProvider>
                {/* DocumentsProvider sits above AuthProvider so any
                  widget — sign-in modal, onboarding canvas, steady
                  shell — can read it. The widget hooks
                  (`useDocumentsContext`) throw if this is missing;
                  the AppErrorBoundary above is the last-line catch. */}
                <DocumentsProvider>
                  <AuthProvider>
                    <AppModeProvider>
                      <ScenarioRegistryProviderWithDemoHooks>
                        <OnboardingSessionProvider>
                          <CanvasOrchestratorProvider>
                            <OnboardingSkillProvider>
                              <HelmetProvider>{children}</HelmetProvider>
                            </OnboardingSkillProvider>
                          </CanvasOrchestratorProvider>
                        </OnboardingSessionProvider>
                      </ScenarioRegistryProviderWithDemoHooks>
                    </AppModeProvider>
                  </AuthProvider>
                </DocumentsProvider>
              </MessageBarProvider>
            </LoadingProvider>
          </AnalyticsConsentProvider>
        </MotionRoot>
      </GxThemeProvider>
    </AppErrorBoundary>
  </ApiProvider>
);

export default function App() {
  return (
    <AppProviders>
      <RouterProvider router={router} future={ROUTER_FUTURE_FLAGS} />
      {/* DBG-01: app-wide debug overlay, gated on `?debug=true`. Router-
          independent (reads window.location.search), so it mounts once
          here beside the router and covers every route. Renders null in
          production / without the param. */}
      {/* DBG-01: the single dev menu (gated on `?debug=true`). Includes the
          intent-firing panel (intent-coverage) as a toggle on canvas screens —
          one menu, not two. */}
      <DebugOverlay />
    </AppProviders>
  );
}
