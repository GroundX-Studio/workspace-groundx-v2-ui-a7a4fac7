import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { GateView } from "./GateView";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
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

describe("GateView (F6)", () => {
  it("renders the inline gate with email, engineer call, and keep-exploring actions", async () => {
    renderWithOnboardingProviders(<OpenGateHarness />, { initialScenario: "utility", initialFrame: "f6" });

    expect(await screen.findByTestId("gate-card")).toBeInTheDocument();
    expect(screen.getByText("Save your work to come back to it. One quick step.")).toBeInTheDocument();
    expect(screen.getByTestId("gate-email-input")).toBeInTheDocument();
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

  it("commits email, then continues to the Integrate frame with signed-in app state", async () => {
    const user = userEvent.setup();
    let snapshot = { authState: "", frame: "", gateStatus: "" };

    renderWithOnboardingProviders(
      <>
        <OpenGateHarness />
        <StateProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialScenario: "utility", initialFrame: "f6" },
    );

    await user.type(await screen.findByTestId("gate-email-input"), "buyer@example.com");
    await user.click(screen.getByTestId("gate-email-submit"));

    expect(await screen.findByTestId("gate-committed")).toBeInTheDocument();
    await user.click(screen.getByTestId("gate-continue-integrate"));

    await waitFor(() => {
      expect(snapshot.authState).toBe("signed-in");
      expect(snapshot.frame).toBe("f7");
      expect(snapshot.gateStatus).toBe("committed");
    });
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

    await user.type(await screen.findByTestId("gate-email-input"), "buyer@example.com");
    await user.click(screen.getByTestId("gate-email-submit"));
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
