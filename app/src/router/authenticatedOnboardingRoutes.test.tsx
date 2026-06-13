import { ReactNode, useEffect } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppProviders } from "@/App";
import { useAppMode } from "@/contexts/AppModeContext";
import { useAuthContext } from "@/contexts/AuthContext";
import { sdkFailure } from "@/contexts/sdkContextTypes";
import { makeFakeApi } from "@/test/makeFakeApi";

import { ProductRouteLayout, PublicOnboardingLayout } from "./router";

const customer = {
  username: "acct-1",
  email: "pat@example.com",
  first: "Pat",
  last: "Lee",
};

const ProductRouteMarker = () => {
  const location = useLocation();
  const { state } = useAppMode();
  return (
    <div
      data-testid="product-route"
      data-app-mode={state.mode}
      data-auth-state={state.authState}
    >
      {location.pathname}
    </div>
  );
};

const HydrateExistingAuth = ({ children }: { children: ReactNode }) => {
  const { getUserData } = useAuthContext();

  useEffect(() => {
    void getUserData("acct-1");
  }, [getUserData]);

  return <>{children}</>;
};

const makeGetUserData = (onboardingState?: string | null) =>
  vi.fn().mockResolvedValue({
    username: "acct-1",
    customer: {
      ...customer,
      appMetadata: onboardingState === undefined ? null : { groundxUsername: "acct-1", onboardingState },
    },
    appMetadata: onboardingState === undefined ? null : { groundxUsername: "acct-1", onboardingState },
  });

const renderWithRoutes = ({
  initialRoute,
  getUserData = makeGetUserData(),
  usePublicOnboardingLayout = false,
  hydrateExistingAuth = false,
}: {
  initialRoute: string;
  getUserData?: ReturnType<typeof vi.fn>;
  usePublicOnboardingLayout?: boolean;
  hydrateExistingAuth?: boolean;
}) => {
  const listScenarios = vi.fn(() => new Promise<never>(() => undefined));
  const apiClient = makeFakeApi({ auth: { getUserData }, scenario: { listScenarios } });
  const Layout = usePublicOnboardingLayout ? PublicOnboardingLayout : ProductRouteLayout;
  const content = (
    <MemoryRouter initialEntries={[initialRoute]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/projects" element={<ProductRouteMarker />} />
          <Route path="/workspaces" element={<ProductRouteMarker />} />
          <Route path="/onboarding" element={<ProductRouteMarker />} />
          <Route path="/c/:sessionId" element={<ProductRouteMarker />} />
        </Route>
        <Route path="/auth/login" element={<div data-testid="login-route">Login</div>} />
      </Routes>
    </MemoryRouter>
  );

  render(
    <AppProviders apiClient={apiClient}>
      {hydrateExistingAuth ? <HydrateExistingAuth>{content}</HydrateExistingAuth> : content}
    </AppProviders>,
  );

  return { getUserData };
};

describe("authenticated onboarding route reachability", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([["/projects"], ["/workspaces"], ["/c/session-1"]])(
    "opens the signed-in wizard on cold-loaded %s without leaving the product route",
    async (route) => {
      const { getUserData } = renderWithRoutes({ initialRoute: route });

      await waitFor(() => expect(getUserData).toHaveBeenCalledWith(""));
      expect(await screen.findByRole("dialog", { name: /welcome to groundx studio/i })).toBeInTheDocument();
      expect(screen.getByTestId("product-route")).toHaveTextContent(route);
    },
  );

  it("opens the signed-in wizard on /onboarding when an authenticated session is already present", async () => {
    const { getUserData } = renderWithRoutes({
      initialRoute: "/onboarding",
      usePublicOnboardingLayout: true,
      hydrateExistingAuth: true,
    });

    await waitFor(() => expect(getUserData).toHaveBeenCalledWith("acct-1"));
    expect(await screen.findByRole("dialog", { name: /welcome to groundx studio/i })).toBeInTheDocument();
    expect(screen.getByTestId("product-route")).toHaveTextContent("/onboarding");
  });

  it("does not open the signed-in wizard after onboarding is complete", async () => {
    const { getUserData } = renderWithRoutes({
      initialRoute: "/projects",
      getUserData: makeGetUserData("complete"),
    });

    await waitFor(() => expect(getUserData).toHaveBeenCalledWith(""));
    expect(await screen.findByTestId("product-route")).toHaveTextContent("/projects");
    expect(screen.queryByRole("dialog", { name: /welcome to groundx studio/i })).not.toBeInTheDocument();
  });

  it("composes product routes as signed-in steady surfaces after auth hydration", async () => {
    renderWithRoutes({
      initialRoute: "/workspaces",
      getUserData: makeGetUserData("complete"),
    });

    const route = await screen.findByTestId("product-route");
    await waitFor(() => expect(route).toHaveAttribute("data-app-mode", "steady"));
    expect(route).toHaveAttribute("data-auth-state", "signed-in");
  });

  it("redirects anonymous product-route users without opening the signed-in wizard", async () => {
    const getUserData = vi.fn().mockResolvedValue(sdkFailure(new Error("no session")));
    renderWithRoutes({ initialRoute: "/projects", getUserData });

    await screen.findByTestId("login-route");
    expect(screen.queryByRole("dialog", { name: /welcome to groundx studio/i })).not.toBeInTheDocument();
  });

  it("keeps anonymous /onboarding public and silent", async () => {
    const getUserData = vi.fn().mockResolvedValue(sdkFailure(new Error("no session")));

    renderWithRoutes({
      initialRoute: "/onboarding",
      getUserData,
      usePublicOnboardingLayout: true,
    });

    expect(screen.getByTestId("product-route")).toHaveTextContent("/onboarding");
    expect(getUserData).not.toHaveBeenCalled();
    expect(screen.queryByTestId("login-route")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: /welcome to groundx studio/i })).not.toBeInTheDocument();
  });
});
