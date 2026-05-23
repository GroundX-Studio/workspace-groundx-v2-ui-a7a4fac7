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

  it("disables the Understand pill on F1 when no scenario has been picked", () => {
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f1", initialScenario: null });
    // The Understand pill should be visually present but marked disabled
    // — clicking it from F1 with no scenario would land on a blank canvas.
    const understandPill = screen.getByText("Understand").closest('[role="button"]');
    expect(understandPill).toHaveAttribute("aria-disabled", "true");
    expect(understandPill).toHaveAttribute("tabIndex", "-1");
  });

  it("does not advance when the disabled Understand pill is clicked", async () => {
    const user = userEvent.setup();
    let snapshot = { sessionId: null as string | null, frame: "" };

    renderWithOnboardingProviders(
      <>
        <OnboardingShell />
        <SessionProbe onSnapshot={(next) => (snapshot = next)} />
      </>,
      { initialFrame: "f1", initialScenario: null },
    );

    await user.click(screen.getByText("Understand"));
    // Frame must NOT change. Wait briefly to catch any async state flip.
    await new Promise((r) => setTimeout(r, 50));
    expect(snapshot.frame).toBe("f1");
  });

  it("wraps nav, chat, and canvas in motion panes for the F1->F2 slide-in choreography", () => {
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f2", initialScenario: "utility" });
    // All three motion-driven wrappers must be present. The visual
    // animation timing (180px nav, 320px chat, canvas fade) is a
    // styling detail covered by visual review; this test guards the
    // structural wiring so a refactor that strips out the motion
    // wrappers fails loudly.
    expect(screen.getByTestId("onboarding-shell-nav-pane")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-shell-chat-pane")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-shell-canvas-pane")).toBeInTheDocument();
  });

  it("clicking BYO from F1 advances to F2 and renders the gate in the chat column", async () => {
    const user = userEvent.setup();
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f1", initialScenario: null });

    // We're on F1's full-bleed picker — no chat column visible yet.
    expect(screen.queryByLabelText("Chat column")).not.toBeInTheDocument();

    // Click any BYO Sign Up tile (header, Upload, Connect, Email all
    // route through handleByoClick).
    await user.click(screen.getByTestId("byo-pdf"));

    // After the click: frame advances to F2 (so the 3-column layout
    // renders), and the chat column hosts the GateView.
    expect(await screen.findByTestId("onboarding-frame-f2")).toBeInTheDocument();
    expect(screen.getByLabelText("Chat column")).toBeInTheDocument();
    expect(screen.getByTestId("gate-card")).toBeInTheDocument();
  });

  it("makes the Understand pill reachable once a scenario is picked", () => {
    renderWithOnboardingProviders(<OnboardingShell />, { initialFrame: "f2", initialScenario: "utility" });
    const understandPill = screen.getByText("Understand").closest('[role="button"]');
    // Active on F2; aria-disabled should be absent.
    expect(understandPill).not.toHaveAttribute("aria-disabled");
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
