/**
 * ARCH-05A (2026-05-26): SignUpWidget is the viewer-slot half of the
 * sign-up surface. The chat-side half is `GateChatRail`. Together
 * they replace the monolithic `GateView` that crammed form fields,
 * preamble, dismiss links, AND book-a-call into the chat column.
 *
 * The motivating bug: today the gate opens on top of whatever was in
 * the viewer (an F2 sample doc, the F1 ingest picker). The user sees
 * a sample doc behind a sign-up form. SignUpWidget lets the
 * OnboardingShell swap the viewer to the form so the surface is
 * coherent.
 *
 * These tests pin the contract:
 *   - Renders the four required form fields (first/last/email/password).
 *   - Validates passwords match before submit.
 *   - Calls register() → claimAnonymousChat() → promoteToSignedIn() →
 *     commitGate("register") in that order on a happy-path submit.
 *   - Surfaces server errors inline without losing typed values.
 *   - Accepts the widget-contract `mode` prop (default "onboarding";
 *     "steady" doesn't render the gate-commit side effects).
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/api/entities/customerEntity", () => ({
  register: vi.fn(),
}));

vi.mock("@/api/claimAnonymousChat", () => ({
  claimAnonymousChat: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

const promoteToSignedIn = vi.fn();
const commitGate = vi.fn();

vi.mock("@/contexts/AppModeContext", () => ({
  useAppMode: () => ({
    state: { mode: "onboarding", authState: "anonymous", scenario: null, usage: { byoPages: 0, byoPagesLimit: 100 } },
    setScenario: vi.fn(),
    promoteToSignedIn,
    flipToSteady: vi.fn(),
    incrementByoPages: vi.fn(),
  }),
}));

let mockGate: { status: "open" | "committed" | "dismissed" | "idle"; trigger?: string; method?: string } = {
  status: "open",
  trigger: "byo",
};

vi.mock("@/contexts/OnboardingSessionContext", () => ({
  useOnboardingSession: () => ({
    state: { gate: mockGate, currentFrame: "f6" },
    commitGate,
    dismissGate: vi.fn(),
    advanceFrame: vi.fn(),
  }),
}));

import { register } from "@/api/entities/customerEntity";
import { claimAnonymousChat } from "@/api/claimAnonymousChat";

import { SignUpWidget } from "./SignUpWidget";

const mockedRegister = vi.mocked(register);
const mockedClaim = vi.mocked(claimAnonymousChat);

const renderWidget = (ui: ReactNode = <SignUpWidget />) => render(ui);

describe("SignUpWidget", () => {
  beforeEach(() => {
    promoteToSignedIn.mockReset();
    commitGate.mockReset();
    mockedRegister.mockReset();
    mockedClaim.mockReset();
    mockGate = { status: "open", trigger: "byo" };
  });

  it("renders the four required form fields", () => {
    renderWidget();
    expect(screen.getByTestId("signup-first-input")).toBeInTheDocument();
    expect(screen.getByTestId("signup-last-input")).toBeInTheDocument();
    expect(screen.getByTestId("signup-email-input")).toBeInTheDocument();
    expect(screen.getByTestId("signup-password-input")).toBeInTheDocument();
    expect(screen.getByTestId("signup-confirm-input")).toBeInTheDocument();
    expect(screen.getByTestId("signup-submit")).toBeInTheDocument();
  });

  it("blocks submit and shows inline error when passwords don't match", async () => {
    renderWidget();
    fireEvent.change(screen.getByTestId("signup-first-input"), { target: { value: "Pat" } });
    fireEvent.change(screen.getByTestId("signup-last-input"), { target: { value: "Lee" } });
    fireEvent.change(screen.getByTestId("signup-email-input"), { target: { value: "pat@example.com" } });
    fireEvent.change(screen.getByTestId("signup-password-input"), { target: { value: "longenoughpw" } });
    fireEvent.change(screen.getByTestId("signup-confirm-input"), { target: { value: "different" } });
    fireEvent.click(screen.getByTestId("signup-submit"));
    expect(await screen.findByTestId("signup-error")).toHaveTextContent(/match/i);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("blocks submit and shows inline error when password is too short", async () => {
    renderWidget();
    fireEvent.change(screen.getByTestId("signup-first-input"), { target: { value: "Pat" } });
    fireEvent.change(screen.getByTestId("signup-last-input"), { target: { value: "Lee" } });
    fireEvent.change(screen.getByTestId("signup-email-input"), { target: { value: "pat@example.com" } });
    fireEvent.change(screen.getByTestId("signup-password-input"), { target: { value: "short" } });
    fireEvent.change(screen.getByTestId("signup-confirm-input"), { target: { value: "short" } });
    fireEvent.click(screen.getByTestId("signup-submit"));
    expect(await screen.findByTestId("signup-error")).toHaveTextContent(/8 characters/i);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("happy-path submit: register → claim → promoteToSignedIn → commitGate('register')", async () => {
    mockedRegister.mockResolvedValueOnce({} as Awaited<ReturnType<typeof register>>);
    mockedClaim.mockResolvedValueOnce(undefined as unknown as Awaited<ReturnType<typeof claimAnonymousChat>>);
    renderWidget();
    fireEvent.change(screen.getByTestId("signup-first-input"), { target: { value: "Pat" } });
    fireEvent.change(screen.getByTestId("signup-last-input"), { target: { value: "Lee" } });
    fireEvent.change(screen.getByTestId("signup-email-input"), { target: { value: "pat@example.com" } });
    fireEvent.change(screen.getByTestId("signup-password-input"), { target: { value: "longenoughpw" } });
    fireEvent.change(screen.getByTestId("signup-confirm-input"), { target: { value: "longenoughpw" } });
    fireEvent.click(screen.getByTestId("signup-submit"));

    await waitFor(() => expect(mockedRegister).toHaveBeenCalledTimes(1));
    expect(mockedRegister).toHaveBeenCalledWith({
      first: "Pat",
      last: "Lee",
      email: "pat@example.com",
      password: "longenoughpw",
      confirmPassword: "longenoughpw",
      endUserLicenseAgreement: true,
    });
    await waitFor(() => expect(mockedClaim).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(promoteToSignedIn).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(commitGate).toHaveBeenCalledWith("register"));
  });

  it("surfaces server-side error inline without clearing typed values", async () => {
    mockedRegister.mockRejectedValueOnce({ response: { data: { error: "Email is already in use." } } });
    renderWidget();
    fireEvent.change(screen.getByTestId("signup-first-input"), { target: { value: "Pat" } });
    fireEvent.change(screen.getByTestId("signup-last-input"), { target: { value: "Lee" } });
    fireEvent.change(screen.getByTestId("signup-email-input"), { target: { value: "pat@example.com" } });
    fireEvent.change(screen.getByTestId("signup-password-input"), { target: { value: "longenoughpw" } });
    fireEvent.change(screen.getByTestId("signup-confirm-input"), { target: { value: "longenoughpw" } });
    fireEvent.click(screen.getByTestId("signup-submit"));

    expect(await screen.findByTestId("signup-error")).toHaveTextContent(/already in use/i);
    expect(screen.getByTestId("signup-email-input")).toHaveValue("pat@example.com");
    expect(commitGate).not.toHaveBeenCalled();
  });

  it("renders a celebration card (NOT the form) when gate.status === 'committed'", () => {
    mockGate = { status: "committed", method: "register" };
    renderWidget();
    expect(screen.getByTestId("signup-celebration")).toBeInTheDocument();
    // Form fields must be gone — the user already submitted; showing
    // the filled form behind a "Welcome!" card in chat would be odd.
    expect(screen.queryByTestId("signup-first-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("signup-submit")).not.toBeInTheDocument();
  });

  it("in steady mode, does NOT call commitGate after a successful register", async () => {
    mockedRegister.mockResolvedValueOnce({} as Awaited<ReturnType<typeof register>>);
    mockedClaim.mockResolvedValueOnce(undefined as unknown as Awaited<ReturnType<typeof claimAnonymousChat>>);
    renderWidget(<SignUpWidget mode="steady" />);
    fireEvent.change(screen.getByTestId("signup-first-input"), { target: { value: "Pat" } });
    fireEvent.change(screen.getByTestId("signup-last-input"), { target: { value: "Lee" } });
    fireEvent.change(screen.getByTestId("signup-email-input"), { target: { value: "pat@example.com" } });
    fireEvent.change(screen.getByTestId("signup-password-input"), { target: { value: "longenoughpw" } });
    fireEvent.change(screen.getByTestId("signup-confirm-input"), { target: { value: "longenoughpw" } });
    fireEvent.click(screen.getByTestId("signup-submit"));

    await waitFor(() => expect(promoteToSignedIn).toHaveBeenCalledTimes(1));
    // Steady mode: still promotes (account is real), but doesn't commit
    // the onboarding gate because there isn't one here.
    expect(commitGate).not.toHaveBeenCalled();
  });
});
