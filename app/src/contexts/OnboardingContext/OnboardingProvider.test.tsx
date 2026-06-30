import { ReactNode, useState } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Auth, AuthContext, AuthContextI } from "@/contexts/AuthContext/AuthContext";
import { sdkSuccess } from "@/contexts/sdkContextTypes";
import { GxThemeProvider } from "@/ThemeProvider";

import { OnboardingProvider } from "./OnboardingProvider";

const loggedInAuth: Auth = {
  isLoggedIn: true,
  userName: "acct-1",
  token: "",
  xJwtToken: "",
};

const baseUser = {
  username: "acct-1",
  email: "pat@example.com",
  first: "Pat",
  last: "Lee",
};

const renderProvider = ({
  onboardingState,
  updateAppMetadata = vi.fn().mockResolvedValue(sdkSuccess(undefined)),
}: {
  onboardingState?: string | null;
  updateAppMetadata?: AuthContextI["updateAppMetadata"];
} = {}) => {
  const Harness = ({ children }: { children: ReactNode }) => {
    const [auth, setAuth] = useState<Auth>(loggedInAuth);
    const [user, setUser] = useState<AuthContextI["user"]>({
      ...baseUser,
      // chat-wire-types-shared — `AppUserMetadata.groundxUsername` is now the
      // one required field (the app narrows the rest). Fixture carries it.
      appMetadata: onboardingState === undefined ? null : { groundxUsername: "acct-1", onboardingState },
    });

    const contextValue: AuthContextI = {
      auth,
      setAuth,
      user,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      getUserData: vi.fn(),
      updateAppMetadata: async (metadata) => {
        const result = await updateAppMetadata(metadata);
        if (result.isSuccess) {
          setUser((currentUser) =>
            currentUser
              ? {
                ...currentUser,
                appMetadata: {
                    // chat-wire-types-shared — `groundxUsername` is required on
                    // the shared `AppUserMetadata`; carry the existing one (or
                    // the user's username) so the merged metadata stays typed.
                    groundxUsername: currentUser.appMetadata?.groundxUsername ?? currentUser.username,
                    ...(currentUser.appMetadata ?? {}),
                    ...metadata,
                  },
                }
              : currentUser
          );
        }
        return result;
      },
      resetPassword: vi.fn(),
      confirmChangingPassword: vi.fn(),
    };

    return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
  };

  render(
    <GxThemeProvider>
      <Harness>
        <OnboardingProvider>
          <div>Protected app</div>
        </OnboardingProvider>
      </Harness>
    </GxThemeProvider>
  );

  return { updateAppMetadata };
};

describe("OnboardingProvider", () => {
  it("opens the wizard for first-time authenticated users", async () => {
    renderProvider();

    expect(await screen.findByRole("dialog", { name: /welcome to groundx studio/i })).toBeInTheDocument();
    expect(screen.getByText("Pick up where the proof left off")).toBeInTheDocument();
    expect(screen.getByText(/current conversations and saved chat sessions/i)).toBeInTheDocument();
    expect(screen.getByText("Saved sessions")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /open onboarding sandbox/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Start with the app shell")).not.toBeInTheDocument();
    expect(screen.queryByText(/Replace the starter Home page/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Name your workspace/i)).not.toBeInTheDocument();
  });

  it("does not open after onboarding is complete", () => {
    renderProvider({ onboardingState: "complete" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes for the current page session without persisting when the user chooses Not now", async () => {
    const user = userEvent.setup();
    const { updateAppMetadata } = renderProvider();

    await act(async () => {
      await user.click(await screen.findByRole("button", { name: "Not now" }));
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateAppMetadata).not.toHaveBeenCalled();
  });

  it("persists completion only when the user clicks Finish", async () => {
    const user = userEvent.setup();
    const { updateAppMetadata } = renderProvider();

    await screen.findByRole("dialog", { name: /welcome to groundx studio/i });
    for (const label of ["Next: Workspaces", "Next: Sandbox", "Next: Outputs", "Next: Integrate"]) {
      await act(async () => {
        await user.click(screen.getByRole("button", { name: label }));
      });
    }
    await act(async () => {
      await user.click(screen.getByRole("button", { name: "Finish" }));
    });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(updateAppMetadata).toHaveBeenCalledWith({ onboardingState: "complete" });
  });
});
