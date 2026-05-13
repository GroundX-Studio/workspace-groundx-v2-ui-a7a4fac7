import { ReactNode, useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { AppInitialization } from "@/AppInitialization";
import { Auth, AuthContext, AuthContextI } from "@/contexts/AuthContext/AuthContext";

const emptyAuth: Auth = {
  userName: "",
  token: "",
  isLoggedIn: false,
  xJwtToken: "",
};

const Harness = ({ children }: { children: ReactNode }) => {
  const [auth, setAuth] = useState<Auth>(emptyAuth);
  const getUserData = vi.fn(async () => {
    setAuth({ isLoggedIn: true, userName: "acct-1", token: "", xJwtToken: "" });
    return { response: { username: "acct-1", email: "pat@example.com", first: "Pat", last: "Lee" }, error: false };
  });
  const contextValue: AuthContextI = {
    auth,
    setAuth,
    user: null,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    getUserData,
    updateAppMetadata: vi.fn(),
    resetPassword: vi.fn(),
    confirmChangingPassword: vi.fn(),
  };

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

const renderInitializedApp = () =>
  render(
    <Harness>
      <MemoryRouter initialEntries={["/"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route
            path="/"
            element={
              <AppInitialization>
                <div>Protected app</div>
              </AppInitialization>
            }
          />
          <Route path="/auth/login" element={<div>Login route</div>} />
        </Routes>
      </MemoryRouter>
    </Harness>
  );

describe("AppInitialization", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("hydrates auth state from /api/auth/me and renders the protected app", async () => {
    renderInitializedApp();

    await expect(screen.findByText("Protected app")).resolves.toBeInTheDocument();
  });

  it("redirects to login when the session cookie is not valid", async () => {
    const FailingHarness = ({ children }: { children: ReactNode }) => {
      const [auth, setAuth] = useState<Auth>(emptyAuth);
      const contextValue: AuthContextI = {
        auth,
        setAuth,
        user: null,
        login: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
        getUserData: vi.fn().mockResolvedValue({ response: null, error: true }),
        updateAppMetadata: vi.fn(),
        resetPassword: vi.fn(),
        confirmChangingPassword: vi.fn(),
      };
      return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
    };

    render(
      <FailingHarness>
        <MemoryRouter initialEntries={["/"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
          <Routes>
            <Route
              path="/"
              element={
                <AppInitialization>
                  <div>Protected app</div>
                </AppInitialization>
              }
            />
            <Route path="/auth/login" element={<div>Login route</div>} />
          </Routes>
        </MemoryRouter>
      </FailingHarness>
    );

    await waitFor(() => expect(screen.getByText("Login route")).toBeInTheDocument());
  });
});
