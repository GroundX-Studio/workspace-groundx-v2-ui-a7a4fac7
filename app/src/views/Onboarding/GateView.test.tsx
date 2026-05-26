import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

// Hoisted vi.mock + factory pattern: every test gets a fresh function it can
// configure per-case without leaking state across files.
const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  claimAnonymousChat: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/api/entities/customerEntity", () => ({
  // The DocumentsProvider (added to the shared test renderer for the
  // production-widget rewire) pulls in the `@/api` barrel, which
  // re-exports every entity. Provide stubs for the other customer
  // entity functions so the barrel re-export resolves.
  register: mocks.register,
  login: vi.fn(),
  logout: vi.fn(),
  getUserData: vi.fn(),
  updateAppMetadata: vi.fn(),
  resetUserPassword: vi.fn(),
  confirmUserChangingPassword: vi.fn(),
}));
vi.mock("@/api/claimAnonymousChat", () => ({
  claimAnonymousChat: mocks.claimAnonymousChat,
}));
// CF-13: claim failures route to the Sentry wrapper.
vi.mock("@/lib/sentry", () => ({
  captureException: mocks.captureException,
  initSentry: vi.fn(() => false),
}));

import { GateView } from "./GateView";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.register.mockReset();
  mocks.claimAnonymousChat.mockReset();
  mocks.captureException.mockReset();
  mocks.register.mockResolvedValue({ username: "gx-user", token: "t", xJwtToken: "x", apiKeys: [] });
  mocks.claimAnonymousChat.mockResolvedValue({ rekeyedSessions: 1 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const OpenGateHarness = ({ trigger = "save" }: { trigger?: "save" | "export" | "byo" | "threshold" }) => {
  const { openGate } = useOnboardingSession();
  useEffect(() => {
    openGate(trigger);
  }, [openGate, trigger]);
  return <GateView />;
};

const StateProbe = ({ onSnapshot }: { onSnapshot: (snapshot: { authState: string; frame: string; gateStatus: string }) => void }) => {
  const app = useAppMode();
  const session = useOnboardingSession();
  onSnapshot({
    authState: app.state.authState,
    frame: session.state.currentFrame,
    gateStatus: session.state.gate.status,
  });
  return null;
};

async function fillRegisterForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByTestId("gate-first-input"), "Pat");
  await user.type(await screen.findByTestId("gate-last-input"), "Buyer");
  await user.type(await screen.findByTestId("gate-email-input"), "buyer@example.com");
  await user.type(await screen.findByTestId("gate-password-input"), "secret123");
  await user.type(await screen.findByTestId("gate-confirm-input"), "secret123");
}

describe("GateView (F6)", () => {
  it("renders the inline gate with register form, engineer call, and keep-exploring actions", async () => {
    renderWithOnboardingProviders(<OpenGateHarness />, { initialScenario: "utility", initialFrame: "f6" });

    expect(await screen.findByTestId("gate-card")).toBeInTheDocument();
    expect(screen.getByText("Save your work to come back to it. One quick step.")).toBeInTheDocument();
    expect(screen.getByTestId("gate-first-input")).toBeInTheDocument();
    expect(screen.getByTestId("gate-last-input")).toBeInTheDocument();
    expect(screen.getByTestId("gate-email-input")).toBeInTheDocument();
    expect(screen.getByTestId("gate-password-input")).toBeInTheDocument();
    expect(screen.getByTestId("gate-confirm-input")).toBeInTheDocument();
    expect(screen.getByTestId("gate-book-call")).toBeInTheDocument();
    expect(screen.getByTestId("gate-keep-exploring")).toHaveTextContent("Keep chatting with the sample");
  });

  it("dismisses the open gate with Escape", async () => {
    const user = userEvent.setup();
    let gateStatus = "";

    renderWithOnboardingProviders(
      <>
        <OpenGateHarness />
        <StateProbe onSnapshot={(snapshot) => (gateStatus = snapshot.gateStatus)} />
      </>,
      { initialScenario: "utility", initialFrame: "f6" },
    );

    expect(await screen.findByTestId("gate-card")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    await waitFor(() => expect(gateStatus).toBe("dismissed"));
    expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument();
  });

  it("registers, claims, and commits with method=register on submit", async () => {
    const user = userEvent.setup();
    let snapshot = { authState: "", frame: "", gateStatus: "" };

    renderWithOnboardingProviders(
      <>
        <OpenGateHarness />
        <StateProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialScenario: "utility", initialFrame: "f6" },
    );

    await fillRegisterForm(user);
    await user.click(screen.getByTestId("gate-register-submit"));

    // Register fires with the form's contents.
    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    const arg = mocks.register.mock.calls[0][0];
    expect(arg).toMatchObject({
      first: "Pat",
      last: "Buyer",
      email: "buyer@example.com",
      password: "secret123",
      confirmPassword: "secret123",
      endUserLicenseAgreement: true,
    });

    // Claim follows register.
    await waitFor(() => expect(mocks.claimAnonymousChat).toHaveBeenCalledTimes(1));
    const order = mocks.register.mock.invocationCallOrder[0];
    const claimOrder = mocks.claimAnonymousChat.mock.invocationCallOrder[0];
    expect(claimOrder).toBeGreaterThan(order);

    // Gate transitions to committed; app mode promoted.
    expect(await screen.findByTestId("gate-committed")).toBeInTheDocument();
    await waitFor(() => {
      expect(snapshot.authState).toBe("signed-in");
      expect(snapshot.gateStatus).toBe("committed");
    });

    // "Continue to Integrate" advances to F7.
    await user.click(screen.getByTestId("gate-continue-integrate"));
    await waitFor(() => expect(snapshot.frame).toBe("f7"));
  });

  it("shows an inline error and leaves the gate open when register fails", async () => {
    const user = userEvent.setup();
    mocks.register.mockRejectedValueOnce({ response: { data: { error: "Email already registered" } } });

    let snapshot = { authState: "", frame: "", gateStatus: "" };
    renderWithOnboardingProviders(
      <>
        <OpenGateHarness />
        <StateProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialScenario: "utility", initialFrame: "f6" },
    );

    await fillRegisterForm(user);
    await user.click(screen.getByTestId("gate-register-submit"));

    await waitFor(() => expect(mocks.register).toHaveBeenCalledTimes(1));
    expect(mocks.claimAnonymousChat).not.toHaveBeenCalled();

    // Inline error rendered.
    expect(await screen.findByTestId("gate-error")).toHaveTextContent(/already registered/i);

    // Gate is still open (not committed, not dismissed).
    expect(screen.getByTestId("gate-card")).toBeInTheDocument();
    expect(snapshot.gateStatus).toBe("open");
    expect(snapshot.authState).toBe("anonymous");
  });

  it("rejects mismatched password + confirm before calling register", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<OpenGateHarness />, { initialScenario: "utility", initialFrame: "f6" });

    await user.type(await screen.findByTestId("gate-first-input"), "Pat");
    await user.type(await screen.findByTestId("gate-last-input"), "Buyer");
    await user.type(await screen.findByTestId("gate-email-input"), "buyer@example.com");
    await user.type(await screen.findByTestId("gate-password-input"), "secret123");
    await user.type(await screen.findByTestId("gate-confirm-input"), "different");
    await user.click(screen.getByTestId("gate-register-submit"));

    expect(await screen.findByTestId("gate-error")).toHaveTextContent(/passwords/i);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("still commits even if claim fails after a successful register (best-effort)", async () => {
    const user = userEvent.setup();
    mocks.claimAnonymousChat.mockRejectedValueOnce(new Error("claim 502"));

    let snapshot = { authState: "", frame: "", gateStatus: "" };
    renderWithOnboardingProviders(
      <>
        <OpenGateHarness />
        <StateProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialScenario: "utility", initialFrame: "f6" },
    );

    await fillRegisterForm(user);
    await user.click(screen.getByTestId("gate-register-submit"));

    expect(await screen.findByTestId("gate-committed")).toBeInTheDocument();
    await waitFor(() => {
      expect(snapshot.authState).toBe("signed-in");
      expect(snapshot.gateStatus).toBe("committed");
    });
  });

  // CF-13 — claim failures route to Sentry.captureException with
  // enough context (route + stage) to triage in the dashboard. The
  // commit still completes; capture is observability, not blocking UX.
  it("claim failure after register → captures exception with route + stage extras", async () => {
    const user = userEvent.setup();
    const claimErr = new Error("claim 502");
    mocks.claimAnonymousChat.mockRejectedValueOnce(claimErr);

    renderWithOnboardingProviders(<OpenGateHarness />, {
      initialScenario: "utility",
      initialFrame: "f6",
    });

    await fillRegisterForm(user);
    await user.click(screen.getByTestId("gate-register-submit"));

    await waitFor(() => {
      expect(mocks.captureException).toHaveBeenCalledTimes(1);
    });
    const [err, extras] = mocks.captureException.mock.calls[0];
    expect(err).toBe(claimErr);
    expect(extras).toMatchObject({
      route: "/api/chat-sessions/claim",
      stage: "after-register",
    });
  });

  it("claim success → does NOT capture (no spurious Sentry events on the happy path)", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<OpenGateHarness />, {
      initialScenario: "utility",
      initialFrame: "f6",
    });

    await fillRegisterForm(user);
    await user.click(screen.getByTestId("gate-register-submit"));

    expect(await screen.findByTestId("gate-committed")).toBeInTheDocument();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it("collapses the committed confirmation without reopening the gate", async () => {
    const user = userEvent.setup();
    let gateStatus = "";

    renderWithOnboardingProviders(
      <>
        <OpenGateHarness />
        <StateProbe onSnapshot={(snapshot) => (gateStatus = snapshot.gateStatus)} />
      </>,
      { initialScenario: "utility", initialFrame: "f6" },
    );

    await fillRegisterForm(user);
    await user.click(screen.getByTestId("gate-register-submit"));
    await user.click(await screen.findByTestId("gate-committed-close"));

    await waitFor(() => expect(gateStatus).toBe("committed"));
    expect(screen.queryByTestId("gate-committed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument();
  });

  it("commits the engineer-call path from keyboard activation", async () => {
    const user = userEvent.setup();

    renderWithOnboardingProviders(<OpenGateHarness />, { initialScenario: null, initialFrame: "f1" });

    const bookCall = await screen.findByTestId("gate-book-call");
    bookCall.focus();
    await user.keyboard("{Enter}");

    expect(await screen.findByTestId("gate-committed")).toBeInTheDocument();
    expect(screen.getByText(/Calendly confirmation/)).toBeInTheDocument();
  });
});
