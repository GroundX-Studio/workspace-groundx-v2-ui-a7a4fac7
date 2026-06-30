import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";

vi.mock("@/appConfig", () => {
  const APP_NAME = "Acme Console";
  const APP_LOGOS = {
    auth: {
      src: "/assets/acme-mark.svg",
      alt: "Acme",
    },
    dark: {
      src: "/assets/acme-wordmark-white.svg",
      alt: "Acme Console",
    },
    passwordReset: {
      src: "/assets/acme-reset.svg",
      alt: "Acme Password Reset",
    },
  };
  const APP_CONFIG = {
    appName: APP_NAME,
    logos: APP_LOGOS,
    api: {
      basePath: "/api",
      defaultPageSize: 20,
    },
    legal: {
      termsUrl: "https://example.com/legal/terms",
    },
    onboarding: {
      enabled: true,
      steps: [],
    },
    design: {},
  };

  return {
    APP_CONFIG,
    APP_NAME,
    APP_LOGOS,
    getPageTitle: (pageTitle: string) => `${pageTitle} | ${APP_NAME}`,
  };
});

import { Login, LOGIN_PAGE_TITLE } from "@/views/Auth/Login";
import { Register } from "@/views/Auth/Register";
import { ResetPassword } from "@/views/Auth/ResetPassword";
import { renderWithAppProviders } from "@/test/renderWithAppProviders";

const renderRoute = (route: string, element: JSX.Element) =>
  renderWithAppProviders(
    <Routes>
      <Route path={route} element={element} />
      <Route path="/home" element={<div>Home route</div>} />
      <Route path="/auth/login" element={<div>Login route</div>} />
      <Route path="/auth/reset-password" element={<ResetPassword />} />
    </Routes>,
    { initialRoute: route }
  );

describe("configured app identity", () => {
  it.each([
    ["/auth/login", <Login />],
    ["/auth/register", <Register />],
  ])("uses the configured auth logo on %s", (route, element) => {
    renderRoute(route, element);

    expect(screen.getByAltText("Acme")).toHaveAttribute("src", "/assets/acme-mark.svg");
    expect(screen.queryByAltText("Acme Console")).not.toBeInTheDocument();
  });

  it("uses the configured legal link on the registration screen", () => {
    renderRoute("/auth/register", <Register />);

    expect(screen.getByRole("link", { name: /end user license agreement/i })).toHaveAttribute(
      "href",
      "https://example.com/legal/terms"
    );
  });

  it("uses the configured reset logo on the reset-password screen", () => {
    renderRoute("/auth/reset-password", <ResetPassword />);

    expect(screen.getByAltText("Acme Password Reset")).toHaveAttribute("src", "/assets/acme-reset.svg");
  });

  // ARCH-22 (2026-05-26): removed the "configured app name in
  // protected app shell" assertion. The scaffold-default
  // `<Dashboard />` layout that this test exercised is gone (the
  // product uses the canonical `<AppShell />` mounted by route-level
  // surfaces instead). The configured app name is still asserted by
  // the document-title test below for auth pages, and the steady-
  // mode shell test will pick it up after ARCH-07 mounts AppShell
  // with the configured name in its header.

  it.each([
    ["/auth/login", <Login />, `${LOGIN_PAGE_TITLE} | Acme Console`],
    ["/auth/register", <Register />, "Register | Acme Console"],
    ["/auth/reset-password", <ResetPassword />, "Reset Password | Acme Console"],
  ])("uses the configured app name in %s document title", async (route, element, expectedTitle) => {
    renderRoute(route, element);

    await waitFor(() => expect(document.title).toBe(expectedTitle));
  });
});
