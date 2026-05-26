import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no matchMedia, so framer-motion's useReducedMotion() returns
// true there and short-circuits the streaming timer. Pin it to false so
// the timing tests actually exercise the stream.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => false };
});

// CF-18: F2 chat input wires through the same sendChatMessage path
// InteractView (F5) uses. Mock the API module so we can sniff the call
// + control the assistant reply.
vi.mock("@/api/chatSessions", async () => {
  const actual = await vi.importActual<typeof import("@/api/chatSessions")>("@/api/chatSessions");
  return {
    ...actual,
    sendChatMessage: vi.fn(),
  };
});
import { ChatApiError, sendChatMessage } from "@/api/chatSessions";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { OnboardingChatColumn } from "./OnboardingChatColumn";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(sendChatMessage).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("OnboardingChatColumn", () => {
  // Replay-bug fix (2026-05-25) gates the thinking-stream behind
  // a sessionStorage key per scenario. Each test starts with a
  // clean slate so the stream always plays.
  beforeEach(() => {
    if (typeof window !== "undefined") window.sessionStorage.clear();
  });

  it("on F1 (no scenario picked), shows the idle placeholder", () => {
    renderWithOnboardingProviders(<OnboardingChatColumn />, { initialFrame: "f1", initialScenario: null });
    expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
  });

  it("on F2 with a scenario, renders the wireframe conversation chrome", () => {
    renderWithOnboardingProviders(<OnboardingChatColumn />, { initialFrame: "f2", initialScenario: "utility" });
    // Wireframe markers: a header that shows the FILE NAME (was
    // "Conversation" pre-2026-05-25, user wanted real context), the
    // scenario name as the first user bubble, a sample-switcher
    // subline.
    expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
    // Header text now reads the document fileName instead of the
    // generic "Conversation" label.
    const header = screen.getByTestId("onboarding-chat-header");
    expect(header.textContent ?? "").not.toMatch(/^Conversation/i);
    expect(header.textContent ?? "").toMatch(/\.pdf|utility/i);
    expect(screen.getByTestId("onboarding-chat-sample-switch")).toHaveTextContent(/Utility Bill/i);
    expect(screen.getByTestId("onboarding-chat-user-bubble")).toHaveTextContent(/Utility Bill/i);
    expect(screen.getByTestId("onboarding-chat-bot-lead")).toHaveTextContent(/Reading/i);
  });

  it("the chat header G icon is a button that navigates to /onboarding", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const { useLocation } = await import("react-router-dom");
    let pathname = "";
    const PathProbe = () => {
      pathname = useLocation().pathname;
      return null;
    };
    renderWithOnboardingProviders(
      <>
        <OnboardingChatColumn />
        <PathProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    const home = screen.getByTestId("onboarding-chat-home");
    expect(home).toBeInTheDocument();
    await user.click(home);
    expect(pathname).toBe("/onboarding");
  });

  it("streams thinking notes into the chat one at a time, then surfaces Done + Pick-a-view", () => {
    vi.useFakeTimers();
    renderWithOnboardingProviders(<OnboardingChatColumn />, { initialFrame: "f2", initialScenario: "utility" });

    // First note is visible immediately.
    expect(screen.getAllByTestId(/thinking-note-/).length).toBe(1);
    // Done + Pick-a-view do NOT show before the stream finishes.
    expect(screen.queryByTestId("onboarding-chat-done")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-a-view")).not.toBeInTheDocument();

    // Walk forward in 1100ms ticks so each setState → effect → next
    // setTimeout chain commits between fires. The utility manifest has
    // 6 notes; 10 ticks is comfortably past the stream.
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        // Per-note pause is now randomized 1500..2800ms (2026-05-25);
        // advance by the upper bound + a margin so every loop iter is
        // guaranteed to fire at most one reveal regardless of the
        // RNG seed.
        vi.advanceTimersByTime(3000);
      });
    }
    // Then the DONE_REVEAL_DELAY_MS pause + a margin.
    act(() => {
      vi.advanceTimersByTime(1200);
    });

    const notes = screen.getAllByTestId(/thinking-note-/);
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
        // Per-note pause is now randomized 1500..2800ms (2026-05-25);
        // advance by the upper bound + a margin so every loop iter is
        // guaranteed to fire at most one reveal regardless of the
        // RNG seed.
        vi.advanceTimersByTime(3000);
      });
    }

    const pill = screen.getByTestId("onboarding-chat-pick-view-meters");
    act(() => {
      pill.click();
    });
    expect(lastFrame).toBe("f3");
  });

  it("derives Pick-a-view pills from the active scenario's extraction schema (Loan != Utility)", () => {
    vi.useFakeTimers();
    renderWithOnboardingProviders(<OnboardingChatColumn />, { initialFrame: "f2", initialScenario: "loan" });
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        // Per-note pause is now randomized 1500..2800ms (2026-05-25);
        // advance by the upper bound + a margin so every loop iter is
        // guaranteed to fire at most one reveal regardless of the
        // RNG seed.
        vi.advanceTimersByTime(3000);
      });
    }
    // Loan schema categories are `applicant` and `risk` (per the
    // fixture). Pills should reflect THOSE keys, not utility's
    // statement/meters/charges.
    expect(screen.getByTestId("onboarding-chat-pick-view-applicant")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-view-meters")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-view-statement")).not.toBeInTheDocument();
    // Edit-schema pill is always last.
    expect(screen.getByTestId("onboarding-chat-pick-view-edit-schema")).toBeInTheDocument();
  });

  it("on a schemaless scenario (Solar), surfaces a single 'show me chat' pill that jumps to F5", () => {
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
      { initialFrame: "f2", initialScenario: "solar" },
    );
    for (let i = 0; i < 4; i += 1) {
      act(() => {
        // Per-note pause is now randomized 1500..2800ms (2026-05-25);
        // advance by the upper bound + a margin so every loop iter is
        // guaranteed to fire at most one reveal regardless of the
        // RNG seed.
        vi.advanceTimersByTime(3000);
      });
    }
    const pill = screen.getByTestId("onboarding-chat-pick-view-interact");
    act(() => {
      pill.click();
    });
    expect(lastFrame).toBe("f5");
  });

  it("the sample switcher chip exposes the other scenarios as a menu", () => {
    renderWithOnboardingProviders(<OnboardingChatColumn />, { initialFrame: "f2", initialScenario: "utility" });
    const trigger = screen.getByTestId("onboarding-chat-sample-switch-trigger");
    act(() => {
      trigger.click();
    });
    // Loan and Solar are listed (Utility is excluded — it's the active sample).
    expect(screen.getByTestId("onboarding-chat-sample-switch-item-loan")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-sample-switch-item-solar")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-sample-switch-item-utility")).not.toBeInTheDocument();
  });

  // ────────────────────────────────────────────────────────────────────
  // CF-18: F2 chat input wire-up. Replaces the visual stub with a real
  // form that posts via sendChatMessage and renders the assistant turn
  // in the conversation body. Mirrors InteractView (F5).
  // ────────────────────────────────────────────────────────────────────
  describe("F2 chat input (CF-18)", () => {
    it("renders a real input + send button (not the visual stub copy)", () => {
      renderWithOnboardingProviders(<OnboardingChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      // The stub displayed bare placeholder text. The real bar exposes
      // an input element + a Send action.
      expect(screen.getByTestId("onboarding-chat-input")).toBeInTheDocument();
      expect(screen.queryByText(/ready when you are/i)).not.toBeInTheDocument();
    });

    it("submitting a question posts via sendChatMessage and renders the assistant reply", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-1",
        assistantMessageId: "a-1",
        reply: {
          mode: "rag",
          answer: "The bill total is $214.07.",
          citations: [],
          suggestedActions: [],
          tools: [],
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<OnboardingChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "What is the bill total?");
      await user.click(screen.getByTestId("onboarding-chat-send"));

      // The optimistic user turn renders immediately.
      expect(screen.getByTestId("onboarding-chat-live-user")).toHaveTextContent(
        "What is the bill total?",
      );

      // Wait for the assistant reply to land.
      await waitFor(() => {
        expect(screen.getByTestId("onboarding-chat-live-assistant")).toHaveTextContent(
          "The bill total is $214.07.",
        );
      });

      // And the call carried the right payload.
      expect(sendChatMessage).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendChatMessage).mock.calls[0][0]).toMatchObject({
        newUserMessage: "What is the bill total?",
      });
    });

    it("on a network failure, renders the 'couldn't reach' copy", async () => {
      vi.mocked(sendChatMessage).mockRejectedValueOnce(new Error("Failed to fetch"));

      const user = userEvent.setup();
      renderWithOnboardingProviders(<OnboardingChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "anything");
      await user.click(screen.getByTestId("onboarding-chat-send"));

      await waitFor(() => {
        expect(screen.getByTestId("onboarding-chat-live-assistant")).toHaveTextContent(
          /couldn't reach the chat service/i,
        );
      });
    });

    // CF-08 — per-status copy in F2 catch site.
    it("504 → renders 'took too long' copy (CF-08)", async () => {
      vi.mocked(sendChatMessage).mockRejectedValueOnce(new ChatApiError("timeout", 504, null));
      const user = userEvent.setup();
      renderWithOnboardingProviders(<OnboardingChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "Q");
      await user.click(screen.getByTestId("onboarding-chat-send"));
      await waitFor(() => {
        expect(screen.getByTestId("onboarding-chat-live-assistant")).toHaveTextContent(
          /took too long/i,
        );
      });
    });

    it("401 → renders 'sign in to continue' copy (CF-08)", async () => {
      vi.mocked(sendChatMessage).mockRejectedValueOnce(new ChatApiError("unauth", 401, null));
      const user = userEvent.setup();
      renderWithOnboardingProviders(<OnboardingChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "Q");
      await user.click(screen.getByTestId("onboarding-chat-send"));
      await waitFor(() => {
        expect(screen.getByTestId("onboarding-chat-live-assistant")).toHaveTextContent(
          /sign in/i,
        );
      });
    });

    it("501 → renders 'can't answer that yet' copy (CF-08)", async () => {
      vi.mocked(sendChatMessage).mockRejectedValueOnce(new ChatApiError("nyi", 501, null));
      const user = userEvent.setup();
      renderWithOnboardingProviders(<OnboardingChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "Q");
      await user.click(screen.getByTestId("onboarding-chat-send"));
      await waitFor(() => {
        expect(screen.getByTestId("onboarding-chat-live-assistant")).toHaveTextContent(
          /can't answer that yet/i,
        );
      });
    });

    it("empty / whitespace input does not post", async () => {
      const user = userEvent.setup();
      renderWithOnboardingProviders(<OnboardingChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "   ");
      await user.click(screen.getByTestId("onboarding-chat-send"));
      expect(sendChatMessage).not.toHaveBeenCalled();
      expect(screen.queryByTestId("onboarding-chat-live-user")).not.toBeInTheDocument();
    });
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
      screen.queryByTestId("gate-rail-preamble") !== null;
    expect(hasGateIndicator).toBe(true);
  });
});
