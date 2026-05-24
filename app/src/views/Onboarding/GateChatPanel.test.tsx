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
function GateOpener({ trigger = "byo" }: { trigger?: "byo" | "save" | "export" | "threshold" }) {
  const { openGate } = useOnboardingSession();
  return (
    <button data-testid="open-gate" onClick={() => openGate(trigger)}>
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

  it("shows a typing indicator first, then the gate after a composing delay (save trigger — short)", async () => {
    vi.useFakeTimers();

    renderWithOnboardingProviders(
      <>
        <GateOpener trigger="save" />
        <GateChatPanel />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    act(() => {
      screen.getByTestId("open-gate").click();
    });

    expect(screen.getByTestId("gate-typing-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument();

    // Standard composing delay is ~600ms for save/export/threshold.
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("gate-card")).toBeInTheDocument();
  });

  it("uses a longer composing delay AND a more substantial typing message for the BYO/signup trigger", async () => {
    // BYO is the only path where the gate IS the destination — the
    // user just clicked Sign Up from F1 and there's no prior context
    // in the chat. A 600ms beat feels rushed for that case; bump to
    // ~1500ms so the bot's "thinking" reads as a genuine reply.
    // The typing copy also gets richer than the default "GroundX is
    // composing" — long enough to read in the longer window.
    vi.useFakeTimers();

    renderWithOnboardingProviders(
      <>
        <GateOpener trigger="byo" />
        <GateChatPanel />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    act(() => {
      screen.getByTestId("open-gate").click();
    });

    // Right after the open: typing visible AND the copy mentions
    // setting up sign-up (longer than just "composing").
    const indicator = screen.getByTestId("gate-typing-indicator");
    expect(indicator).toBeInTheDocument();
    // The BYO-specific copy should reference the sign-up specifically,
    // not just "is composing" — it's the start of a multi-turn
    // sign-up chat moment.
    expect(indicator.textContent ?? "").toMatch(/sign.?up|preparing|save your work/i);
    expect(indicator.textContent ?? "").not.toMatch(/^GroundX is composing$/);

    // At 700ms (past the SAVE-trigger threshold), BYO should STILL be
    // typing — the longer delay is the whole point.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByTestId("gate-typing-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("gate-card")).not.toBeInTheDocument();

    // At 1700ms total, the longer BYO delay has elapsed.
    act(() => {
      vi.advanceTimersByTime(1000);
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
