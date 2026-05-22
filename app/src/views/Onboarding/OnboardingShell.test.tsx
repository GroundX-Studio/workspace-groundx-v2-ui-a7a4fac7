import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { OnboardingShell } from "./OnboardingShell";

const apiMocks = vi.hoisted(() => ({
  issueOnboardingSession: vi.fn(),
}));

vi.mock("@/api/entities/onboardingSessionEntity", () => ({
  issueOnboardingSession: apiMocks.issueOnboardingSession,
}));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  apiMocks.issueOnboardingSession.mockReset();
  apiMocks.issueOnboardingSession.mockResolvedValue({ sessionId: "anon-session-1", anonymous: true });
});

const SessionProbe = ({ onSnapshot }: { onSnapshot: (snapshot: { sessionId: string | null; frame: string }) => void }) => {
  const session = useOnboardingSession();
  onSnapshot({ sessionId: session.state.sessionId, frame: session.state.currentFrame });
  return null;
};

describe("OnboardingShell", () => {
  it("issues and stores an anonymous onboarding session on mount", async () => {
    let snapshot = { sessionId: null as string | null, frame: "" };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    await waitFor(() => expect(apiMocks.issueOnboardingSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(snapshot.sessionId).toBe("anon-session-1"));
  });

  it("keeps the preview usable when session bootstrap fails", async () => {
    apiMocks.issueOnboardingSession.mockRejectedValueOnce(new Error("middleware offline"));

    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f2", initialScenario: "utility" });

    expect(await screen.findByTestId("onboarding-frame-f2")).toBeInTheDocument();
    expect(screen.getByText("GroundX is parsing the document. You'll see the extract in a moment.")).toBeInTheDocument();
  });

  it("wires reachable step-strip pills to frames", async () => {
    const user = userEvent.setup();
    let snapshot = { sessionId: null as string | null, frame: "" };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f3", initialScenario: "utility" },
    );

    // The step number is rendered in a separate badge element, so the
    // accessible name on the pill is just the label text.
    await user.click(screen.getByText("Understand"));

    await waitFor(() => {
      expect(snapshot.frame).toBe("f2");
      expect(screen.getByTestId("onboarding-frame-f2")).toBeInTheDocument();
    });
  });

  it("does not leave the chat column blank after dismissing the F6 gate", async () => {
    const user = userEvent.setup();

    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f5", initialScenario: "utility" });

    await user.click(screen.getByTestId("advance-to-f6"));
    expect(await screen.findByTestId("gate-card")).toBeInTheDocument();

    await user.click(screen.getByTestId("gate-dismiss"));

    await waitFor(() => expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument());
    expect(screen.getByText("Ask anything about the sample. Citations appear next to every answer.")).toBeInTheDocument();
  });

  it("only makes Integrate reachable from the step strip after sign-in", async () => {
    const user = userEvent.setup();
    let snapshot = { sessionId: null as string | null, frame: "" };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialAuthState: "signed-in", initialFrame: "f3", initialScenario: "loan" },
    );

    await user.click(screen.getByText("Integrate"));

    await waitFor(() => {
      expect(snapshot.frame).toBe("f7");
      expect(screen.getByTestId("onboarding-frame-f7")).toBeInTheDocument();
    });
  });
});
