import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no matchMedia, so framer-motion's useReducedMotion() returns
// true there and short-circuits the streaming timer. Pin it to false so
// the timing tests actually exercise the stream.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => false };
});

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { OnboardingChatColumn } from "./OnboardingChatColumn";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OnboardingChatColumn", () => {
  it("on F1 (no scenario picked), shows the idle placeholder", () => {
    renderWithOnboardingProviders(<OnboardingChatColumn />, { initialFrame: "f1", initialScenario: null });
    expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
  });

  it("on F2 with a scenario, renders the wireframe conversation chrome", () => {
    renderWithOnboardingProviders(<OnboardingChatColumn />, { initialFrame: "f2", initialScenario: "utility" });
    // Wireframe markers: a Conversation header, the scenario name as the
    // first user bubble, a sample-switcher subline.
    expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-header")).toHaveTextContent(/Conversation/i);
    expect(screen.getByTestId("onboarding-chat-sample-switch")).toHaveTextContent(/Utility Bill/i);
    expect(screen.getByTestId("onboarding-chat-user-bubble")).toHaveTextContent(/Utility Bill/i);
    expect(screen.getByTestId("onboarding-chat-bot-lead")).toHaveTextContent(/Reading/i);
  });

  it("streams thinking notes into the chat one at a time, then surfaces Done + Pick-a-view", () => {
    vi.useFakeTimers();
    renderWithOnboardingProviders(<OnboardingChatColumn />, { initialFrame: "f2", initialScenario: "utility" });

    // First note is visible immediately.
    expect(screen.getAllByTestId(/onboarding-chat-thinking-note-/).length).toBe(1);
    // Done + Pick-a-view do NOT show before the stream finishes.
    expect(screen.queryByTestId("onboarding-chat-done")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-a-view")).not.toBeInTheDocument();

    // Walk forward in 1100ms ticks so each setState → effect → next
    // setTimeout chain commits between fires. The utility manifest has
    // 6 notes; 10 ticks is comfortably past the stream.
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        vi.advanceTimersByTime(1100);
      });
    }
    // Then the DONE_REVEAL_DELAY_MS pause + a margin.
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    const notes = screen.getAllByTestId(/onboarding-chat-thinking-note-/);
    expect(notes.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("onboarding-chat-done")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-pick-a-view")).toBeInTheDocument();
  });

  it("Pick-a-view pills advance to F3 on click", () => {
    vi.useFakeTimers();
    let lastFrame = "";
    function FrameProbe() {
      const { state } = useOnboardingSession();
      lastFrame = state.currentFrame;
      return null;
    }
    renderWithOnboardingProviders(
      <>
        <OnboardingChatColumn />
        <FrameProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    // Walk forward through the stream until the pills appear.
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(1100);
      });
    }

    const pill = screen.getByTestId("onboarding-chat-pick-view-meters");
    act(() => {
      pill.click();
    });
    expect(lastFrame).toBe("f3");
  });

  it("on F6 (gate open), the chat dispatches to GateChatPanel", () => {
    // Defensive: when the gate is active the chat column hands off to
    // GateChatPanel. Same flow that drives the F1 BYO -> signup
    // experience. (Pure F2+with no scenario + no gate is not a state
    // OnboardingSession can produce — the F2 BYO path opens the gate,
    // so the gate-active branch covers it.)
    function GateOpener() {
      const { openGate } = useOnboardingSession();
      return (
        <button data-testid="open-gate-byo" onClick={() => openGate("byo")}>
          open
        </button>
      );
    }
    renderWithOnboardingProviders(
      <>
        <GateOpener />
        <OnboardingChatColumn />
      </>,
      { initialFrame: "f1", initialScenario: null },
    );
    act(() => {
      screen.getByTestId("open-gate-byo").click();
    });
    // GateChatPanel mounts; the conversation chrome does NOT.
    expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
    // GateChatPanel renders either the typing indicator or the gate
    // card depending on its composing delay — either is fine here.
    const hasGateIndicator =
      screen.queryByTestId("gate-typing-indicator") !== null ||
      screen.queryByTestId("gate-card") !== null;
    expect(hasGateIndicator).toBe(true);
  });
});
