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

// GateChatPanel is anonymous-only (the gate IS the pre-sign-up moment)
// and session-scoped, so every mount declares these.
const GATE_ROLE = "anonymous" as const;
const GATE_SCOPE = { type: "none" } as const;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  // The "has the gate finished composing" flag persists in
  // localStorage per anon user — clear it so each test starts fresh.
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
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
    renderWithOnboardingProviders(<GateChatPanel role={GATE_ROLE} scope={GATE_SCOPE} />, {
      initialFrame: "f2",
      initialScenario: "utility",
    });
    expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
    expect(screen.queryByTestId("gate-rail-preamble")).not.toBeInTheDocument();
    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
  });

  it("shows a typing indicator first, then the gate after a composing delay (save trigger — short)", async () => {
    vi.useFakeTimers();

    renderWithOnboardingProviders(
      <>
        <GateOpener trigger="save" />
        <GateChatPanel role={GATE_ROLE} scope={GATE_SCOPE} />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    act(() => {
      screen.getByTestId("open-gate").click();
    });

    expect(screen.getByTestId("gate-typing-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("gate-rail-preamble")).not.toBeInTheDocument();

    // Standard composing delay is ~600ms for save/export/threshold.
    act(() => {
      vi.advanceTimersByTime(700);
    });

    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("gate-rail-preamble")).toBeInTheDocument();
  });

  it("uses a longer composing delay for the BYO/signup trigger (same typing copy as the rest)", async () => {
    // BYO is the only path where the gate IS the destination — the
    // user just clicked Sign Up from F1 and there's no prior context
    // in the chat. A 600ms beat feels rushed for that case; bump to
    // ~1500ms so the bot's "thinking" reads as a genuine reply. The
    // copy stays the shared "GroundX is composing" — a typing indicator
    // should read as a composing beat, not a full sentence that flashes
    // then vanishes (the prior wordy byo copy read as a dropped message).
    vi.useFakeTimers();

    renderWithOnboardingProviders(
      <>
        <GateOpener trigger="byo" />
        <GateChatPanel role={GATE_ROLE} scope={GATE_SCOPE} />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    act(() => {
      screen.getByTestId("open-gate").click();
    });

    // Right after the open: typing visible with the shared composing copy.
    const indicator = screen.getByTestId("gate-typing-indicator");
    expect(indicator).toBeInTheDocument();
    expect(indicator.textContent ?? "").toMatch(/GroundX is composing/);

    // At 700ms (past the SAVE-trigger threshold), BYO should STILL be
    // typing — the longer delay is the whole point.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(screen.getByTestId("gate-typing-indicator")).toBeInTheDocument();
    expect(screen.queryByTestId("gate-rail-preamble")).not.toBeInTheDocument();

    // At 1700ms total, the longer BYO delay has elapsed.
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("gate-rail-preamble")).toBeInTheDocument();
  });

  it("does NOT replay the typing animation on re-entry after dismiss within the same session", async () => {
    // Bug fix: user clicks Sign Up (typing → GateView), then clicks
    // Ingest to go back to F1 (dismisses the gate), then clicks Sign
    // Up again. Old behavior: typing replays every time. New
    // behavior: typing fires the FIRST time only; subsequent opens
    // (within the same anon user / browser) jump straight to the
    // GateView.
    vi.useFakeTimers();

    function GateActions() {
      const { openGate, dismissGate } = useOnboardingSession();
      return (
        <>
          <button data-testid="open-gate-byo" onClick={() => openGate("byo")}>open</button>
          <button data-testid="dismiss-gate" onClick={() => dismissGate()}>dismiss</button>
        </>
      );
    }

    renderWithOnboardingProviders(
      <>
        <GateActions />
        <GateChatPanel role={GATE_ROLE} scope={GATE_SCOPE} />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    // First open — typing indicator, then GateView after the BYO
    // delay (~1500ms).
    act(() => {
      screen.getByTestId("open-gate-byo").click();
    });
    expect(screen.getByTestId("gate-typing-indicator")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(1600);
    });
    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("gate-rail-preamble")).toBeInTheDocument();

    // Dismiss (simulates clicking Ingest in the StepStrip).
    act(() => {
      screen.getByTestId("dismiss-gate").click();
    });
    expect(screen.queryByTestId("gate-rail-preamble")).not.toBeInTheDocument();

    // Re-open (user clicks Sign Up again). MUST jump straight to
    // GateView with no typing indicator.
    act(() => {
      screen.getByTestId("open-gate-byo").click();
    });
    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("gate-rail-preamble")).toBeInTheDocument();
  });

  it("skips the typing indicator if gate is already committed on mount", () => {
    // This case happens if a session resumes with the gate already
    // committed (e.g. F7 navigation). The component should render the
    // post-commit state immediately, no fake delay.
    function CommittedHarness() {
      const { commitGate } = useOnboardingSession();
      return (
        <button data-testid="commit-gate" onClick={() => commitGate("register")}>
          commit
        </button>
      );
    }
    renderWithOnboardingProviders(
      <>
        <CommittedHarness />
        <GateChatPanel role={GATE_ROLE} scope={GATE_SCOPE} />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    act(() => {
      screen.getByTestId("commit-gate").click();
    });
    // Committed state should render the GateView's committed mode
    // immediately, no typing indicator beforehand.
    expect(screen.queryByTestId("gate-typing-indicator")).not.toBeInTheDocument();
    expect(screen.getByTestId("gate-rail-committed")).toBeInTheDocument();
  });
});
