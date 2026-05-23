import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no matchMedia, so framer-motion's useReducedMotion() defaults
// to TRUE there. That short-circuits the typing animation. Force it to
// FALSE so the animation timing is exercised in these tests; a separate
// test could pin reduceMotion=true to verify the skip path.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => false };
});

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { GateChatPanel } from "./GateChatPanel";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * Tiny harness that opens the gate the same way IngestView does, so we
 * can simulate the BYO trigger inside a unit test. Mounting this child
 * inside GateChatPanel's providers gives us deterministic control over
 * the gate.status transition.
 */
function GateOpener() {
  const { openGate } = useOnboardingSession();
  return (
    <button data-testid="open-gate" onClick={() => openGate("byo")}>
      open
    </button>
  );
}

describe("GateChatPanel", () => {
  it("renders the idle chat placeholder when gate is not active", () => {
    renderWithOnboardingProviders(<GateChatPanel />, { initialFrame: "f2", initialScenario: "utility" });
    expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
    expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
  });

  it("shows a typing indicator first, then the gate after a composing delay", async () => {
    vi.useFakeTimers();

    renderWithOnboardingProviders(
      <>
        <GateOpener />
        <GateChatPanel />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    // Trigger the gate (the same call IngestView.handleByoClick makes).
    act(() => {
      screen.getByTestId("open-gate").click();
    });

    // Right after the gate becomes "open": typing indicator visible,
    // gate card NOT yet.
    expect(screen.getByTestId("gate-typing-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument();

    // Advance time past the composing delay (~600ms). The typing
    // indicator should disappear and the gate card should appear.
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("gate-card")).toBeInTheDocument();
  });

  it("skips the typing indicator if gate is already committed on mount", () => {
    // This case happens if a session resumes with the gate already
    // committed (e.g. F7 navigation). The component should render the
    // post-commit state immediately, no fake delay.
    function CommittedHarness() {
      const { commitGate } = useOnboardingSession();
      return (
        <button data-testid="commit-gate" onClick={() => commitGate("magic-link")}>
          commit
        </button>
      );
    }
    renderWithOnboardingProviders(
      <>
        <CommittedHarness />
        <GateChatPanel />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    act(() => {
      screen.getByTestId("commit-gate").click();
    });
    // Committed state should render the GateView's committed mode
    // immediately, no typing indicator beforehand.
    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("gate-committed")).toBeInTheDocument();
  });
});
