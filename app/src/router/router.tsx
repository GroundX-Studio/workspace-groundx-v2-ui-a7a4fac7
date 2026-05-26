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
  // Steady-mode chat-session URL. Authenticated users land here after
  // the onboarding flow completes; the URL carries the active chat
  // session so refresh / share keeps you in the same conversation.
  { path: ROUTER_PATHS.STEADY_SESSION, element: <SteadyShell /> },
]);
