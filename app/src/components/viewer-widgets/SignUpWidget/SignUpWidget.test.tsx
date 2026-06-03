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
 * 2026-05-30 (widget-role-access Phase 2b): migrated to the role+scope
 * contract. The retired `mode: "onboarding" | "steady"` prop is gone.
 *   - `role: WidgetRole` ("anonymous" | "member") satisfies the widget
 *     contract; it is forward-looking and does NOT gate any affordance
 *     here today (no affordance is role-locked).
 *   - `scope: WidgetScope` is `{ type: "none" }` — sign-up is not a
 *     document-scoped widget.
 *   - The gate-commit side effect + the committed-state celebration are
 *     RE-SOURCED from gate-state (`useOnboardingSession`), NOT from a
 *     mode/role prop. A real gate awaiting commit (open/dismissed) gets
 *     `commitGate("register")`; an already-committed gate renders the
 *     celebration; no gate (idle) registers + promotes but never touches
 *     the gate.
 *
 * Matrix row (`docs/agents/widget-access-matrix.md`): availability is
 * anonymous ✅ / member ❌ — enforced at the MOUNT SITE, not inside this
 * widget. So this widget renders identically under both roles; the test
 * asserts that (no role-locked affordance), which is the matrix row's
 * affordance stance ("none today").
 *
 * These tests pin the contract:
 *   - Renders the four required form fields (first/last/email/password).
 *   - Validates passwords match before submit.
 *   - Calls register() → claimAnonymousChat() → promoteToSignedIn() →
 *     commitGate("register") in that order on a happy-path submit when a
 *     gate is awaiting commit.
 *   - Surfaces server errors inline without losing typed values.
 *   - Renders identically under role "anonymous" and "member" (no
 *     role-locked affordance).
 *   - Re-sources the gate-commit from gate-state: an idle gate does NOT
 *     commitGate even on a successful register.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

vi.mock("@/api/entities/customerEntity", async () => {
  const actual = await vi.importActual<typeof import("@/api/entities/customerEntity")>(
    "@/api/entities/customerEntity",
  );
  return {
    ...actual,
    register: vi.fn(),
  };
});

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
import { withApiProvider } from "@/test/withApiProvider";

import { SignUpWidget } from "./SignUpWidget";

const mockedRegister = vi.mocked(register);
const mockedClaim = vi.fn();

const NONE_SCOPE: WidgetScope = { type: "none" };

const renderWidget = (role: WidgetRole = "anonymous", scope: WidgetScope = NONE_SCOPE): ReturnType<typeof render> =>
  render(
    withApiProvider(<SignUpWidget role={role} scope={scope} />, {
      chat: { claimAnonymousChat: mockedClaim },
    }),
  );

const fillForm = (overrides?: { confirm?: string; password?: string }) => {
  fireEvent.change(screen.getByTestId("signup-first-input"), { target: { value: "Pat" } });
  fireEvent.change(screen.getByTestId("signup-last-input"), { target: { value: "Lee" } });
  fireEvent.change(screen.getByTestId("signup-email-input"), { target: { value: "pat@example.com" } });
  fireEvent.change(screen.getByTestId("signup-password-input"), {
    target: { value: overrides?.password ?? "longenoughpw" },
  });
  fireEvent.change(screen.getByTestId("signup-confirm-input"), {
    target: { value: overrides?.confirm ?? overrides?.password ?? "longenoughpw" },
  });
};

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

  it("renders the same form under role 'anonymous' and 'member' (no role-locked affordance)", () => {
    const { unmount } = renderWidget("anonymous");
    expect(screen.getByTestId("signup-submit")).not.toBeDisabled();
    expect(screen.getByTestId("signup-first-input")).toBeInTheDocument();
    unmount();

    renderWidget("member");
    // Matrix: affordance locks "none today" — the form is identical.
    expect(screen.getByTestId("signup-submit")).not.toBeDisabled();
    expect(screen.getByTestId("signup-first-input")).toBeInTheDocument();
  });

  it("blocks submit and shows inline error when passwords don't match", async () => {
    renderWidget();
    fillForm({ confirm: "different" });
    fireEvent.click(screen.getByTestId("signup-submit"));
    expect(await screen.findByTestId("signup-error")).toHaveTextContent(/match/i);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("blocks submit and shows inline error when password is too short", async () => {
    renderWidget();
    fillForm({ password: "short" });
    fireEvent.click(screen.getByTestId("signup-submit"));
    expect(await screen.findByTestId("signup-error")).toHaveTextContent(/8 characters/i);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it("happy-path submit: register → claim → promoteToSignedIn → commitGate('register')", async () => {
    mockedRegister.mockResolvedValueOnce({} as Awaited<ReturnType<typeof register>>);
    mockedClaim.mockResolvedValueOnce(undefined);
    renderWidget();
    fillForm();
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

  it("commits the gate from gate-state regardless of role (member role, open gate)", async () => {
    mockedRegister.mockResolvedValueOnce({} as Awaited<ReturnType<typeof register>>);
    mockedClaim.mockResolvedValueOnce(undefined);
    renderWidget("member");
    fillForm();
    fireEvent.click(screen.getByTestId("signup-submit"));

    // Gate-commit is sourced from gate-state (status "open"), NOT role —
    // so even the "member" role commits when a gate is awaiting commit.
    await waitFor(() => expect(commitGate).toHaveBeenCalledWith("register"));
  });

  it("surfaces server-side error inline without clearing typed values", async () => {
    mockedRegister.mockRejectedValueOnce({ response: { data: { error: "Email is already in use." } } });
    renderWidget();
    fillForm();
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

  it("does NOT commitGate when there is no active gate (idle) — gate-state, not role", async () => {
    mockGate = { status: "idle" };
    mockedRegister.mockResolvedValueOnce({} as Awaited<ReturnType<typeof register>>);
    mockedClaim.mockResolvedValueOnce(undefined);
    renderWidget();
    fillForm();
    fireEvent.click(screen.getByTestId("signup-submit"));

    await waitFor(() => expect(promoteToSignedIn).toHaveBeenCalledTimes(1));
    // No gate awaiting commit → register + promote run, but the gate is
    // not touched.
    expect(commitGate).not.toHaveBeenCalled();
  });
});
