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
//
// RT-01: `listChatMessages` is also mocked here so the on-mount
// hydration effect doesn't try to hit a real network. Default is
// `[]` so existing tests still see an empty thread on mount; the
// RT-01 round-trip test overrides with persisted turns.
vi.mock("@/api/chatSessions", async () => {
  const actual = await vi.importActual<typeof import("@/api/chatSessions")>("@/api/chatSessions");
  return {
    ...actual,
    sendChatMessage: vi.fn(),
    listChatMessages: vi.fn(),
  };
});
import { ChatApiError, listChatMessages, sendChatMessage } from "@/api/chatSessions";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { ChatColumn } from "./ChatColumn";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(sendChatMessage).mockReset();
  vi.mocked(listChatMessages).mockReset();
  // Default: no persisted thread (empty array). Individual tests
  // can override to assert RT-01 hydration behavior.
  vi.mocked(listChatMessages).mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ChatColumn", () => {
  // Replay-bug fix (2026-05-25) gates the thinking-stream behind
  // a sessionStorage key per scenario. Each test starts with a
  // clean slate so the stream always plays.
  beforeEach(() => {
    if (typeof window !== "undefined") window.sessionStorage.clear();
  });

  it("on F1 (no scenario picked), shows the idle placeholder", () => {
    renderWithOnboardingProviders(<ChatColumn />, { initialFrame: "f1", initialScenario: null });
    expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
  });

  it("on F2 with a scenario, renders the wireframe conversation chrome", () => {
    renderWithOnboardingProviders(<ChatColumn />, { initialFrame: "f2", initialScenario: "utility" });
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
        <ChatColumn />
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
    renderWithOnboardingProviders(<ChatColumn />, { initialFrame: "f2", initialScenario: "utility" });

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
        <ChatColumn />
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
    renderWithOnboardingProviders(<ChatColumn />, { initialFrame: "f2", initialScenario: "loan" });
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
    // Per realign-f3a-entry-point: F2's Pick-a-view bubble SHALL NOT
    // contain the Edit-schema pill. F3a is reached from F3's
    // fields-panel hamburger instead.
    expect(screen.queryByTestId("onboarding-chat-pick-view-edit-schema")).not.toBeInTheDocument();
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
        <ChatColumn />
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
    renderWithOnboardingProviders(<ChatColumn />, { initialFrame: "f2", initialScenario: "utility" });
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
  // schema-agent-chat-affordances: F3a-only chrome — Schema-Agent header
  // and earlier-turns summary above the conversation. The header appears
  // ONLY on F3a; F2 / F5 stay unchanged.
  // ────────────────────────────────────────────────────────────────────
  describe("schema-agent-chat-affordances", () => {
    it("renders the Schema Agent header + sample switcher chip on F3a", () => {
      renderWithOnboardingProviders(<ChatColumn />, {
        initialFrame: "f3a",
        initialScenario: "utility",
      });
      const header = screen.getByTestId("chat-schema-agent-header");
      expect(header).toHaveTextContent(/Schema Agent/);
      const chip = screen.getByTestId("chat-schema-agent-sample-switcher");
      expect(chip).toHaveTextContent(/sample:/);
      expect(chip).toHaveTextContent(/Utility Bill/);
      expect(chip).toHaveTextContent(/switch ▾/);
    });

    it("omits the Schema-Agent header on F2 (frame-conditional)", () => {
      renderWithOnboardingProviders(<ChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      expect(screen.queryByTestId("chat-schema-agent-header")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chat-schema-agent-sample-switcher")).not.toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // CF-18: F2 chat input wire-up. Replaces the visual stub with a real
  // form that posts via sendChatMessage and renders the assistant turn
  // in the conversation body. Mirrors InteractView (F5).
  // ────────────────────────────────────────────────────────────────────
  describe("F2 chat input (CF-18)", () => {
    it("renders a real input + send button (not the visual stub copy)", () => {
      renderWithOnboardingProviders(<ChatColumn />, {
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
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn />, {
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
      renderWithOnboardingProviders(<ChatColumn />, {
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
      renderWithOnboardingProviders(<ChatColumn />, {
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
      renderWithOnboardingProviders(<ChatColumn />, {
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
      renderWithOnboardingProviders(<ChatColumn />, {
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
      renderWithOnboardingProviders(<ChatColumn />, {
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

  // RT-01 (round-trip contract; discipline.md Rule 9 closure gate).
  // The chat handler persists every turn to chat_messages. Before
  // RT-01 the UI never read them back, so a refresh wiped the live
  // thread. These tests assert the on-mount hydration AND lock in
  // the race rule (optimistic state wins over a slow hydrate).
  describe("RT-01 hydrate liveTurns from server on mount", () => {
    it("renders persisted turns on first mount (refresh survival)", async () => {
      vi.mocked(listChatMessages).mockResolvedValueOnce([
        {
          id: "m1",
          chatSessionId: "rt-mount",
          turnIndex: 1,
          role: "user",
          content: "what is the bill total?",
          errorCode: null,
          citations: [],
        },
        {
          id: "m2",
          chatSessionId: "rt-mount",
          turnIndex: 2,
          role: "assistant",
          content: "The bill total is $7,613.20.",
          errorCode: null,
          citations: [],
        },
      ]);

      renderWithOnboardingProviders(<ChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(listChatMessages).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId("onboarding-chat-live-user")).toHaveTextContent(
          "what is the bill total?",
        );
        expect(screen.getByTestId("onboarding-chat-live-assistant")).toHaveTextContent(
          "The bill total is $7,613.20.",
        );
      });
    });

    it("filters out system-role rows (UI only renders user + assistant)", async () => {
      vi.mocked(listChatMessages).mockResolvedValueOnce([
        { id: "s1", chatSessionId: "rt-sys", turnIndex: 0, role: "system", content: "system bootstrap", errorCode: null, citations: [] },
        { id: "u1", chatSessionId: "rt-sys", turnIndex: 1, role: "user", content: "hi there", errorCode: null, citations: [] },
      ]);

      renderWithOnboardingProviders(<ChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(screen.getByTestId("onboarding-chat-live-user")).toHaveTextContent("hi there");
      });
      expect(screen.queryByText(/system bootstrap/i)).not.toBeInTheDocument();
    });

    it("empty persisted thread leaves the UI in its pre-RT-01 state (no live bubbles)", async () => {
      // Default mock is mockResolvedValue([]) already; explicit here
      // so the test reads cleanly.
      vi.mocked(listChatMessages).mockResolvedValueOnce([]);

      renderWithOnboardingProviders(<ChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(listChatMessages).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByTestId("onboarding-chat-live-user")).not.toBeInTheDocument();
      expect(screen.queryByTestId("onboarding-chat-live-assistant")).not.toBeInTheDocument();
    });

    it("hydration failure is non-fatal — the UI still mounts + accepts new sends", async () => {
      vi.mocked(listChatMessages).mockRejectedValueOnce(
        new ChatApiError("/api/chat-sessions/rt-fail/messages failed: 500", 500, null),
      );

      renderWithOnboardingProviders(<ChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      // Component still rendered + input still works.
      expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
      expect(screen.getByTestId("onboarding-chat-input")).toBeInTheDocument();
    });

    it("does NOT clobber optimistic state — if the user types while hydrate is in flight, the optimistic turn wins", async () => {
      // Make hydrate hang so the user-typed message lands first.
      let resolveHydrate: (msgs: never[]) => void = () => {};
      vi.mocked(listChatMessages).mockReturnValueOnce(
        new Promise((resolve) => {
          resolveHydrate = resolve as (msgs: never[]) => void;
        }) as ReturnType<typeof listChatMessages>,
      );
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-new",
        assistantMessageId: "a-new",
        reply: {
          mode: "rag",
          answer: "fresh reply from server",
          citations: [],
          suggestedActions: [],
          tools: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      // Type + send while hydrate is still pending.
      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "live typed message");
      await user.click(screen.getByTestId("onboarding-chat-send"));
      await waitFor(() => {
        expect(screen.getByTestId("onboarding-chat-live-assistant")).toHaveTextContent(
          "fresh reply from server",
        );
      });

      // Now resolve hydrate with an old persisted thread. The component
      // already has optimistic turns; hydrate must not overwrite them.
      await act(async () => {
        resolveHydrate([]);
        await Promise.resolve();
      });

      // Optimistic turn + reply remain.
      expect(screen.getByTestId("onboarding-chat-live-user")).toHaveTextContent(
        "live typed message",
      );
      expect(screen.getByTestId("onboarding-chat-live-assistant")).toHaveTextContent(
        "fresh reply from server",
      );
    });
  });

  // clickable-citations Phase 2 — until this lands, F2 chat replies
  // arrive with citations but render bubble-only (chips invisible).
  // The viewer can never react to a citation click because there's
  // no chip to click. Three failing tests pin the contract:
  describe("citation chips render on assistant bubbles (clickable-citations Phase 2)", () => {
    it("onboarding chat: assistant reply carrying citations renders [1] [2] chips with documentId + page data attrs", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-cite-1",
        assistantMessageId: "a-cite-1",
        reply: {
          mode: "rag",
          answer: "The total is $214.07.",
          citations: [
            { documentId: "doc-A", page: 7, snippet: "the total is $214.07" },
            { documentId: "doc-A", page: 12, snippet: "due date March 15" },
          ],
          suggestedActions: [],
          tools: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "what is the total?");
      await user.click(screen.getByTestId("onboarding-chat-send"));

      await waitFor(() => {
        expect(screen.getByTestId("cite-chip-1")).toBeInTheDocument();
        expect(screen.getByTestId("cite-chip-2")).toBeInTheDocument();
      });
      const c1 = screen.getByTestId("cite-chip-1");
      const c2 = screen.getByTestId("cite-chip-2");
      expect(c1).toHaveAttribute("data-citation-doc", "doc-A");
      expect(c1).toHaveAttribute("data-citation-page", "7");
      expect(c2).toHaveAttribute("data-citation-doc", "doc-A");
      expect(c2).toHaveAttribute("data-citation-page", "12");
    });

    it("steady chat: assistant reply carrying citations renders [1] chip beneath the bubble", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-cite-s",
        assistantMessageId: "a-cite-s",
        reply: {
          mode: "rag",
          answer: "Tax is $42.",
          citations: [{ documentId: "doc-B", page: 3, snippet: "tax 42" }],
          suggestedActions: [],
          tools: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn mode="steady" />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "tax?");
      await user.click(screen.getByTestId("onboarding-chat-send"));

      await waitFor(() => {
        expect(screen.getByTestId("cite-chip-1")).toBeInTheDocument();
      });
      expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-doc", "doc-B");
      expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-page", "3");
    });

    it("RT-01 rehydrate: citations on persisted assistant turns survive a remount", async () => {
      vi.mocked(listChatMessages).mockResolvedValueOnce([
        {
          id: "m1",
          chatSessionId: "rt-cite",
          turnIndex: 1,
          role: "user",
          content: "total?",
          errorCode: null,
          citations: [],
        },
        {
          id: "m2",
          chatSessionId: "rt-cite",
          turnIndex: 2,
          role: "assistant",
          content: "The total is $214.07.",
          errorCode: null,
          citations: [{ documentId: "doc-A", page: 7, snippet: "the total" }],
        },
      ]);

      renderWithOnboardingProviders(<ChatColumn />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      await waitFor(() => {
        expect(screen.getByTestId("cite-chip-1")).toBeInTheDocument();
      });
      expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-doc", "doc-A");
      expect(screen.getByTestId("cite-chip-1")).toHaveAttribute("data-citation-page", "7");
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
        <ChatColumn />
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

  // UI-05 (2026-05-27) — steady-mode rendering. The widget contract
  // says onboarding + steady use the same production widget with a
  // `mode` prop. These tests pin the steady contract:
  //   - No scripted decorations (thinking-stream, sample-switcher,
  //     Pick-a-view pills, scenario header) — they're onboarding-only.
  //   - RT-01 hydration still works (the persistence + render path
  //     is the load-bearing shared surface).
  //   - Send path still posts to /api/chat/messages and renders the reply.
  describe("UI-05 steady mode", () => {
    it("renders the bare steady conversation — no scripted decorations", async () => {
      // Mount with mode="steady" outside the onboarding tree to mimic
      // SteadyShell's parent context. We still wrap with the
      // onboarding providers to keep ChatStore + AuthContext available;
      // the steady branch short-circuits before reading
      // OnboardingSession/ScenarioRegistry.
      renderWithOnboardingProviders(<ChatColumn mode="steady" />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      // Steady-specific anchor.
      expect(screen.getByTestId("steady-chat-conversation")).toBeInTheDocument();

      // No onboarding-only decorations.
      expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
      expect(screen.queryByTestId("onboarding-chat-sample-switch")).not.toBeInTheDocument();
      expect(screen.queryByTestId("onboarding-chat-pick-a-view")).not.toBeInTheDocument();
      expect(screen.queryByText(/Reading/i)).not.toBeInTheDocument();
    });

    it("RT-01 hydration: persisted thread renders on mount", async () => {
      vi.mocked(listChatMessages).mockResolvedValueOnce([
        {
          id: "m1",
          chatSessionId: "steady-mount",
          turnIndex: 1,
          role: "user",
          content: "what is the total?",
          errorCode: null,
          citations: [],
        },
        {
          id: "m2",
          chatSessionId: "steady-mount",
          turnIndex: 2,
          role: "assistant",
          content: "The total is $42.00.",
          errorCode: null,
          citations: [],
        },
      ]);

      renderWithOnboardingProviders(<ChatColumn mode="steady" />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(listChatMessages).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId("steady-chat-live-user")).toHaveTextContent(
          "what is the total?",
        );
        expect(screen.getByTestId("steady-chat-live-assistant")).toHaveTextContent(
          "The total is $42.00.",
        );
      });
    });

    it("send path posts a message and renders the reply", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-steady",
        assistantMessageId: "a-steady",
        reply: {
          mode: "rag",
          answer: "Steady reply.",
          citations: [],
          suggestedActions: [],
          tools: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn mode="steady" />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "hello");
      await user.click(screen.getByTestId("onboarding-chat-send"));

      await waitFor(() => {
        expect(screen.getByTestId("steady-chat-live-user")).toHaveTextContent("hello");
        expect(screen.getByTestId("steady-chat-live-assistant")).toHaveTextContent(
          "Steady reply.",
        );
      });
      // Steady sends should NOT carry isOnboarding=true.
      const sendCall = vi.mocked(sendChatMessage).mock.calls[0][0];
      expect(sendCall.sessionMeta.isOnboarding).toBe(false);
    });

    it("renders the empty-thread placeholder when no persisted turns exist", async () => {
      vi.mocked(listChatMessages).mockResolvedValueOnce([]);
      renderWithOnboardingProviders(<ChatColumn mode="steady" />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      await waitFor(() => {
        expect(screen.getByTestId("steady-chat-empty")).toBeInTheDocument();
      });
      // Empty placeholder gone once a turn lands.
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u",
        assistantMessageId: "a",
        reply: { mode: "rag", answer: "ok", citations: [], suggestedActions: [], tools: [], proposedSchemaField: null },
        compressionRan: false,
      });
      const user = userEvent.setup();
      const input = screen.getByTestId("onboarding-chat-input").querySelector("input")!;
      await user.type(input, "ping");
      await user.click(screen.getByTestId("onboarding-chat-send"));
      await waitFor(() => {
        expect(screen.queryByTestId("steady-chat-empty")).not.toBeInTheDocument();
      });
    });
  });
});
