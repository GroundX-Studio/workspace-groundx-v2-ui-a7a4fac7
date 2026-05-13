import { ReactNode, useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { Auth, AuthContext, AuthContextI } from "@/contexts/AuthContext/AuthContext";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { GxThemeProvider } from "@/ThemeProvider";

import { Dashboard } from "./Dashboard";

const emptyAuth: Auth = {
  userName: "acct-1",
  token: "",
  isLoggedIn: true,
  xJwtToken: "",
};

const logout = vi.fn().mockResolvedValue(undefined);

const setCompactNavigation = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("max-width") ? matches : !matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
};

const AuthHarness = ({ children }: { children: ReactNode }) => {
  const [auth, setAuth] = useState<Auth>(emptyAuth);
  const contextValue: AuthContextI = {
    auth,
    setAuth,
    user: { username: "acct-1", email: "pat@example.com", first: "Pat", last: "Lee" },
    login: vi.fn(),
    register: vi.fn(),
    logout,
    getUserData: vi.fn(),
    updateAppMetadata: vi.fn(),
    resetPassword: vi.fn(),
    confirmChangingPassword: vi.fn(),
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

const renderDashboard = (initialRoute = "/home") =>
  render(
    <GxThemeProvider>
      <LoadingProvider>
        <MessageBarProvider>
          <AuthHarness>
            <MemoryRouter initialEntries={[initialRoute]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
              <Routes>
                <Route path="/" element={<Dashboard />}>
                  <Route path="status" element={<div>App status route</div>} />
                  <Route path="home" element={<div>Home content</div>} />
                </Route>
                <Route path="/auth/login" element={<div>Login route</div>} />
                <Route path="/health" element={<div>Health route</div>} />
              </Routes>
            </MemoryRouter>
          </AuthHarness>
        </MessageBarProvider>
      </LoadingProvider>
    </GxThemeProvider>
  );

describe("Dashboard navigation shell", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the desktop app bar and permanent side rail", () => {
    setCompactNavigation(false);
    renderDashboard();

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByTestId("side-rail-top-menu")).toContainElement(screen.getByRole("link", { name: "Home" }));
    expect(screen.getByTestId("side-rail-bottom-menu")).toContainElement(screen.getByRole("link", { name: "App Status" }));
    expect(screen.getByAltText("GroundX Studio")).toHaveAttribute("src", "/assets/logos/groundx-studio-white.png");
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("active");
    expect(screen.getByRole("link", { name: "App Status" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open navigation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open account menu" })).toBeInTheDocument();
    expect(screen.getByText("GroundX Studio")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("Home content")).toBeInTheDocument();
  });

  it("uses a hamburger drawer for tablet and phone widths", async () => {
    setCompactNavigation(true);
    renderDashboard();

    expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    });

    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveClass("active");

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Close navigation" }));
    });
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument());
  });

  it("routes from the compact drawer and closes it after navigation", async () => {
    setCompactNavigation(true);
    renderDashboard();

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    });
    await act(async () => {
      await userEvent.click(screen.getByRole("link", { name: "App Status" }));
    });

    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Primary navigation" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { level: 1, name: "App Status" })).toBeInTheDocument();
    expect(screen.getByText("App status route")).toBeInTheDocument();
  });

  it("uses route metadata for the header and page title on direct route loads", () => {
    setCompactNavigation(false);
    renderDashboard("/status");

    expect(screen.getByRole("link", { name: "App Status" })).toHaveClass("active");
    expect(screen.getByRole("heading", { level: 6, name: "App Status" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "App Status" })).toBeInTheDocument();
    expect(screen.getByText("App status route")).toBeInTheDocument();
  });

  it("keeps the account menu available in compact navigation", async () => {
    setCompactNavigation(true);
    renderDashboard();

    const accountMenuButton = screen.getByRole("button", { name: "Open account menu" });
    expect(accountMenuButton).not.toHaveAttribute("aria-expanded");

    await act(async () => {
      await userEvent.click(accountMenuButton);
    });

    expect(accountMenuButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Logout" })).toBeInTheDocument();
  });

  it("shows account details in the header profile menu and routes logout to login", async () => {
    setCompactNavigation(false);
    renderDashboard();

    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: "Open account menu" }));
    });

    expect(screen.getByText("pat@example.com")).toBeInTheDocument();
    expect(screen.getByText("Account acct-1")).toBeInTheDocument();

    await act(async () => {
      await userEvent.click(screen.getByRole("menuitem", { name: "Logout" }));
    });

    expect(logout).toHaveBeenCalled();
    expect(screen.getByText("Login route")).toBeInTheDocument();
  });
});
