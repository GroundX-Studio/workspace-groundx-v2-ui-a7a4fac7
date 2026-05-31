import { Outlet, createBrowserRouter, Navigate } from "react-router-dom";

import { AppInitialization } from "@/AppInitialization";
import { Banned } from "@/views/Banned/Banned";
import { OnboardingProvider } from "@/contexts/OnboardingContext/OnboardingProvider";
import { Health } from "@/views/_scaffold/Health/Health";
import { Home } from "@/views/Home/Home";
import { Login } from "@/views/Auth/Login";
import { Register } from "@/views/Auth/Register";
import { ResetPassword } from "@/views/Auth/ResetPassword";
import { OnboardingShell } from "@/views/Onboarding/OnboardingShell";
import { SteadyShell } from "@/views/Steady/SteadyShell";
import { WorkspacesView, ProjectsView } from "@/views/Scoped/ScopedConversationShell";
import { ROUTER_PATHS } from "@/router/routerPaths";

export const router = createBrowserRouter([
  {
    // ARCH-22 (2026-05-26): the scaffold-default `<Dashboard />`
    // boxed-content + topbar layout was removed. The canonical
    // layout for the product is `<AppShell />` mounted by each route
    // that needs it (OnboardingShell, SteadyShell). The `/` route
    // now just composes the always-on providers (AppInitialization
    // + OnboardingProvider) and renders an Outlet for whichever
    // child route matches.
    //
    // ARCH-21 (2026-05-26): `Home` is an auth-aware redirect, not a
    // marketing page. Anonymous → /onboarding; signed-in →
    // /c/<lastSessionId> from persisted ChatStore or /onboarding.
    //
    // ARCH-24 (2026-05-26): `/status` + the `AppStatus` stub were
    // deleted (no real surface behind the route). `Banned` stayed —
    // the route is load-bearing for axios 403-on-archived-customer
    // and Login's banned-account branch. `Health` moved under
    // `views/_scaffold/` to mark it explicitly as non-product
    // scaffold infrastructure (k8s probe target only).
    path: "/",
    element: (
      <AppInitialization>
        <OnboardingProvider>
          <Outlet />
        </OnboardingProvider>
      </AppInitialization>
    ),
    errorElement: <>Something went wrong</>,
    children: [
      { path: "", element: <Navigate to={ROUTER_PATHS.HOME} /> },
      { path: ROUTER_PATHS.HOME, element: <Home /> },
    ],
  },
  { path: ROUTER_PATHS.AUTH_LOGIN, element: <Login /> },
  { path: ROUTER_PATHS.AUTH_REGISTER, element: <Register /> },
  { path: ROUTER_PATHS.AUTH_RESET_PASSWORD, element: <ResetPassword /> },
  { path: ROUTER_PATHS.HEALTH, element: <Health /> },
  { path: ROUTER_PATHS.BANNED, element: <Banned /> },
  // Onboarding surfaces — URL is the source of truth for which
  // surface mounts (picker / signup / specific sample). The
  // OnboardingShell reads useParams() and useLocation() and dispatches
  // to the right surface. See OnboardingShell's URL-sync useEffect.
  { path: ROUTER_PATHS.ONBOARDING, element: <OnboardingShell /> },
  { path: `${ROUTER_PATHS.ONBOARDING}/signup`, element: <OnboardingShell /> },
  { path: `${ROUTER_PATHS.ONBOARDING}/:bucketId/:scenarioId`, element: <OnboardingShell /> },
  // WF-01 C4 (2026-05-28). Catch unknown sub-paths under an onboarding
  // scenario so they don't trip the error boundary. Currently the only
  // canonical sub-paths recognized at the shell level are the scenario
  // root + signup; per-frame routing happens via state (advanceFrame),
  // not URL. A splat here mounts the same OnboardingShell, which then
  // ignores the extra segment and renders the canonical scenario URL's
  // surface. (If we add real per-frame deep-links later, this splat
  // becomes the dispatch table.)
  { path: `${ROUTER_PATHS.ONBOARDING}/:bucketId/:scenarioId/*`, element: <OnboardingShell /> },
  // Steady-mode chat-session URL. Authenticated users land here after
  // the onboarding flow completes; the URL carries the active chat
  // session so refresh / share keeps you in the same conversation.
  { path: ROUTER_PATHS.STEADY_SESSION, element: <SteadyShell /> },
  // 2026-05-31-onboarding-experiences — the Workspace / Project scoped
  // conversations the authenticated nav-rail entries open. Top-level routes
  // (like onboarding/steady): the core contexts — ScenarioRegistry, ChatStore
  // — are provided app-wide by AppProviders, so each surface mounts its own
  // AppShell + the shared ConversationFlow composed with the looked-up
  // ChatExperience. No new flow component, no flow `mode`.
  { path: ROUTER_PATHS.WORKSPACES, element: <WorkspacesView /> },
  { path: ROUTER_PATHS.PROJECTS, element: <ProjectsView /> },
]);
