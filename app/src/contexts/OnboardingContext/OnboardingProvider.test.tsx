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
      appMetadata: onboardingState === undefined ? null : { onboardingState },
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
    expect(screen.getByText("Start with the app shell")).toBeInTheDocument();
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
    for (const label of ["Explore navigation", "Next", "Next", "Next"]) {
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
