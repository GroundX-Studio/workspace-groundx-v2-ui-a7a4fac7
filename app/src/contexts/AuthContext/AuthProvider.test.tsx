import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { api } from "@/api";
import { AuthProvider } from "@/contexts/AuthContext/AuthProvider";
import { useAuthContext } from "@/contexts/AuthContext";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { useMessageContext, MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";

vi.mock("@/api", () => ({
  api: {
    confirmUserChangingPassword: vi.fn(),
    getUserData: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    register: vi.fn(),
    resetUserPassword: vi.fn(),
    updateAppMetadata: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

const user = { username: "acct-1", email: "pat@example.com", first: "Pat", last: "Lee" };

const Harness = () => {
  const { auth, user: authedUser, login, logout, register, resetPassword, confirmChangingPassword, updateAppMetadata } = useAuthContext();
  const { errorMessage, successMessage, setSuccessMessage } = useMessageContext();

  return (
    <div>
      <div data-testid="logged-in">{String(auth.isLoggedIn)}</div>
      <div data-testid="username">{auth.userName}</div>
      <div data-testid="email">{authedUser?.email || ""}</div>
      <div data-testid="onboarding-state">{authedUser?.appMetadata?.onboardingState || ""}</div>
      <div data-testid="error">{errorMessage}</div>
      <div data-testid="success">{successMessage}</div>
      <button type="button" onClick={() => login({ email: "pat@example.com", password: "secret" })}>
        Login
      </button>
      <button
        type="button"
        onClick={() =>
          register({
            first: "Pat",
            last: "Lee",
            email: "pat@company.com",
            password: "password1",
            confirmPassword: "password1",
            endUserLicenseAgreement: true,
          })
        }
      >
        Register
      </button>
      <button type="button" onClick={() => resetPassword("pat@example.com")}>
        Reset
      </button>
      <button type="button" onClick={() => confirmChangingPassword("123456", "pat@example.com", "password1")}>
        Confirm
      </button>
      <button type="button" onClick={() => setSuccessMessage("Saved")}>
        Success
      </button>
      <button type="button" onClick={() => updateAppMetadata({ onboardingState: "complete" })}>
        Complete Onboarding
      </button>
      <button type="button" onClick={logout}>
        Logout
      </button>
    </div>
  );
};

const renderHarness = () =>
  render(
    <LoadingProvider>
      <MessageBarProvider>
        <AuthProvider>
          <Harness />
        </AuthProvider>
      </MessageBarProvider>
    </LoadingProvider>
  );

const clickAuthAction = async (name: string) => {
  await act(async () => {
    await userEvent.click(screen.getByRole("button", { name }));
  });
};

describe("AuthProvider", () => {
  afterEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("logs in, receives the session cookie server-side, and loads user data", async () => {
    mockedApi.login.mockResolvedValueOnce({ username: "acct-1", token: "token-1", xJwtToken: "jwt-1", customer: user });
    mockedApi.getUserData.mockResolvedValueOnce({
      customer: user,
      appMetadata: { groundxUsername: "acct-1", onboardingState: "not-started" },
    });

    renderHarness();
    await clickAuthAction("Login");

    await waitFor(() => expect(screen.getByTestId("logged-in")).toHaveTextContent("true"));
    expect(screen.getByTestId("username")).toHaveTextContent("acct-1");
    expect(screen.getByTestId("email")).toHaveTextContent("pat@example.com");
    expect(screen.getByTestId("onboarding-state")).toHaveTextContent("not-started");
    expect(sessionStorage.getItem("n")).toBeNull();
    expect(sessionStorage.getItem("t")).toBeNull();
    expect(sessionStorage.getItem("j")).toBeNull();
  });

  it("updates app metadata without storing browser-side secrets", async () => {
    mockedApi.login.mockResolvedValueOnce({ username: "acct-1", token: "token-1", xJwtToken: "jwt-1", customer: user });
    mockedApi.getUserData.mockResolvedValueOnce({ customer: user });
    mockedApi.updateAppMetadata.mockResolvedValueOnce({ groundxUsername: "acct-1", onboardingState: "complete" });

    renderHarness();
    await clickAuthAction("Login");
    await clickAuthAction("Complete Onboarding");

    await waitFor(() => expect(screen.getByTestId("onboarding-state")).toHaveTextContent("complete"));
    expect(mockedApi.updateAppMetadata).toHaveBeenCalledWith({ onboardingState: "complete" });
    expect(sessionStorage.getItem("n")).toBeNull();
    expect(sessionStorage.getItem("t")).toBeNull();
    expect(sessionStorage.getItem("j")).toBeNull();
  });

  it("registers a new user through the cookie session contract", async () => {
    mockedApi.register.mockResolvedValueOnce({ username: "acct-2", token: "token-2", xJwtToken: "jwt-2", apiKeys: [] });
    mockedApi.getUserData.mockResolvedValueOnce({ customer: { ...user, username: "acct-2" } });

    renderHarness();
    await clickAuthAction("Register");

    await waitFor(() => expect(screen.getByTestId("logged-in")).toHaveTextContent("true"));
    expect(screen.getByTestId("username")).toHaveTextContent("acct-2");
    expect(sessionStorage.getItem("n")).toBeNull();
    expect(sessionStorage.getItem("t")).toBeNull();
    expect(sessionStorage.getItem("j")).toBeNull();
  });

  it("surfaces duplicate-account registration errors", async () => {
    mockedApi.register.mockRejectedValueOnce({ response: { status: 409 } });

    renderHarness();
    await clickAuthAction("Register");

    await waitFor(() => {
      expect(screen.getByTestId("error")).toHaveTextContent("An account with this email already exists");
    });
  });

  it("resets password, confirms the change, and clears session on logout", async () => {
    mockedApi.resetUserPassword.mockResolvedValueOnce({ message: "OK" });
    mockedApi.confirmUserChangingPassword.mockResolvedValueOnce({ message: "OK" });
    mockedApi.logout.mockResolvedValueOnce({ success: true });

    renderHarness();
    await clickAuthAction("Reset");
    await clickAuthAction("Confirm");
    await clickAuthAction("Success");
    await clickAuthAction("Logout");

    expect(mockedApi.resetUserPassword).toHaveBeenCalledWith("pat@example.com");
    expect(mockedApi.confirmUserChangingPassword).toHaveBeenCalledWith("123456", "pat@example.com", "password1");
    expect(mockedApi.logout).toHaveBeenCalled();
    expect(screen.getByTestId("success")).toHaveTextContent("Saved");
    expect(screen.getByTestId("logged-in")).toHaveTextContent("false");
  });
});
