import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";

// jsdom has no matchMedia, so framer-motion's useReducedMotion() returns
// true there and short-circuits the streaming timer. Pin it to false so
// the timing tests actually exercise the stream.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => false };
});

// CF-18: chat input wires through the same sendChatMessage path. Mock the
// API module so we can sniff the call + control the assistant reply.
//
// RT-01: `listChatMessages` is also mocked so the on-mount hydration effect
// doesn't hit the network. Default `[]` so existing tests see an empty thread.
vi.mock("@/api/chatSessions", async () => {
  const actual = await vi.importActual<typeof import("@/api/chatSessions")>("@/api/chatSessions");
  return {
    ...actual,
    sendChatMessage: vi.fn(),
    listChatMessages: vi.fn(),
  };
});
import { ChatApiError, listChatMessages, sendChatMessage } from "@/api/chatSessions";

// WF-17: the onboarding pick-view pills read the live workflow schema via
// this hook. Mock it so tests are deterministic. Default null → the
// experience's `derivePickViews` falls back to the manifest.
vi.mock("@/api/useLiveExtractionSchema", () => ({
  useLiveExtractionSchema: vi.fn(() => null),
}));
import { useLiveExtractionSchema } from "@/api/useLiveExtractionSchema";

import type { WidgetRole } from "@groundx/shared";

import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { ChatColumn } from "./ChatColumn";

/**
 * 2026-05-30-unified-conversation-flow Phase 2 — the steady chat is the bare
 * conversation, selected by mounting ChatColumn on a NON-onboarding chat
 * session (`newSession` defaults `isOnboardingSession:false`, like SteadyShell's
 * SessionSwitcher). The onboarding harness seeds an onboarding-flagged session,
 * so steady tests flip to a fresh steady session first. There is NO `surface`
 * prop — ChatColumn reads the active session's `isOnboardingSession` flag (the
 * source of truth) to decide bare-chat vs onboarding experience.
 */
function SteadySessionMount(props: Parameters<typeof ChatColumn>[0]) {
  const { newSession } = useChatStore();
  useEffect(() => {
    newSession({ title: "Untitled" });
  }, [newSession]);
  return <ChatColumn {...props} />;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(sendChatMessage).mockReset();
  vi.mocked(listChatMessages).mockReset();
  // Default: no persisted thread (empty array). Individual tests
  // can override to assert RT-01 hydration behavior.
  vi.mocked(listChatMessages).mockResolvedValue([]);
  // WF-17 — default to manifest fallback; the precedence test overrides.
  vi.mocked(useLiveExtractionSchema).mockReturnValue(null);
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

  // DBG-01 B (2026-05-28). The chat scroll container must reserve a
  // scrollbar gutter so the bar doesn't paint over the message bubbles.
  it("DBG-01 B: onboarding chat scroll container reserves a scrollbar gutter", () => {
    renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    const scroll = screen.getByTestId("chat-live-scroll");
    expect(scroll.style.scrollbarGutter).toBe("stable");
  });

  it("DBG-01 B: steady chat scroll container reserves a scrollbar gutter", async () => {
    renderWithOnboardingProviders(<SteadySessionMount role="member" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    const scroll = await screen.findByTestId("chat-live-scroll");
    expect(scroll.style.scrollbarGutter).toBe("stable");
  });

  // 2026-05-30-widget-role-access Phase 2b — ChatColumn migrates from the
  // binary `mode: "onboarding" | "steady"` to the role+scope contract.
  // Matrix row (docs/agents/widget-access-matrix.md §1 + §1b):
  //   · availability: ✅ anonymous · ✅ member (all roles)
  //   · affordance locks: NONE today
  //   · scope: `{ type: "none" }` — chat is session-scoped, not document-scoped
  describe("role + scope contract (widget-access-matrix)", () => {
    const roles: WidgetRole[] = ["anonymous", "member"];

    for (const role of roles) {
      it(`mounts under role="${role}" with the all-roles onboarding surface`, () => {
        renderWithOnboardingProviders(
          <ChatColumn role={role} scope={{ type: "none" }} />,
          { initialFrame: "f2", initialScenario: "utility" },
        );
        // All-roles: the onboarding conversation chrome renders for both
        // anonymous and member — no affordance is locked by role.
        expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
        expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
      });

      it(`mounts under role="${role}" with the steady (bare) chat`, async () => {
        renderWithOnboardingProviders(
          <SteadySessionMount role={role} scope={{ type: "none" }} />,
          { initialFrame: "f2", initialScenario: "utility" },
        );
        // Steady chat available to both roles; same send affordance, no
        // onboarding chrome.
        expect(await screen.findByTestId("conversation-flow")).toBeInTheDocument();
        expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
        expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
      });
    }

    it("accepts the required scope: { type: 'none' } without changing behavior", () => {
      // Scope is session-scoped sentinel; it does not gate any rendering.
      renderWithOnboardingProviders(
        <ChatColumn role="anonymous" scope={{ type: "none" }} />,
        { initialFrame: "f1", initialScenario: null },
      );
      expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
    });
  });

  it("on F1 (no scenario picked), shows the idle placeholder", () => {
    renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f1", initialScenario: null });
    expect(screen.getByText(/Ask anything about the sample/i)).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
  });

  it("on F2 with a scenario, renders the wireframe conversation chrome", () => {
    renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    // Wireframe markers: a header that shows the FILE NAME, the scenario
    // name as the first user bubble, a sample-switcher subline.
    expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
    const header = screen.getByTestId("onboarding-chat-header");
    expect(header.textContent ?? "").not.toMatch(/^Conversation/i);
    expect(header.textContent ?? "").toMatch(/\.pdf|utility/i);
    expect(screen.getByTestId("onboarding-chat-sample-switch")).toHaveTextContent(/Utility Bill/i);
    expect(screen.getByTestId("onboarding-chat-user-bubble")).toHaveTextContent(/Utility Bill/i);
    expect(screen.getByTestId("onboarding-chat-bot-lead")).toHaveTextContent(/Reading/i);
  });

  it("the chat header is a button that navigates to /onboarding", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    const { useLocation } = await import("react-router-dom");
    let pathname = "";
    const PathProbe = () => {
      pathname = useLocation().pathname;
      return null;
    };
    renderWithOnboardingProviders(
      <>
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
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
    renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });

    // First note is visible immediately.
    expect(screen.getAllByTestId(/thinking-note-/).length).toBe(1);
    // Done + Pick-a-view do NOT show before the stream finishes.
    expect(screen.queryByTestId("onboarding-chat-done")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-a-view")).not.toBeInTheDocument();

    // Walk forward in 3000ms ticks so each setState → effect → next
    // setTimeout chain commits between fires.
    for (let i = 0; i < 10; i += 1) {
      act(() => {
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
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <FrameProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    for (let i = 0; i < 12; i += 1) {
      act(() => {
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
    renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "loan" });
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    // Loan schema categories are `applicant` and `risk` per the fixture.
    expect(screen.getByTestId("onboarding-chat-pick-view-applicant")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-view-meters")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-view-statement")).not.toBeInTheDocument();
    // Per realign-f3a-entry-point: F2's Pick-a-view bubble SHALL NOT
    // contain the Edit-schema pill.
    expect(screen.queryByTestId("onboarding-chat-pick-view-edit-schema")).not.toBeInTheDocument();
  });

  it("WF-17: pick-view pills derive from the LIVE workflow schema, overriding the manifest", () => {
    vi.useFakeTimers();
    vi.mocked(useLiveExtractionSchema).mockReturnValue({
      id: "wf-1",
      name: "Utility Bill",
      categories: [
        { id: "statement", type: "statement", name: "Statement", fields: [] },
        { id: "meters", type: "meters", name: "Meters", fields: [] },
        { id: "charges", type: "charges", name: "Charges", fields: [] },
      ],
    });
    renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    expect(screen.getByTestId("onboarding-chat-pick-view-charges")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-pick-view-statement")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-pick-view-meters")).toBeInTheDocument();
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
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <FrameProbe />
      </>,
      { initialFrame: "f2", initialScenario: "solar" },
    );
    for (let i = 0; i < 4; i += 1) {
      act(() => {
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
    renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });
    const trigger = screen.getByTestId("onboarding-chat-sample-switch-trigger");
    act(() => {
      trigger.click();
    });
    expect(screen.getByTestId("onboarding-chat-sample-switch-item-loan")).toBeInTheDocument();
    expect(screen.getByTestId("onboarding-chat-sample-switch-item-solar")).toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-sample-switch-item-utility")).not.toBeInTheDocument();
  });

  // ────────────────────────────────────────────────────────────────────
  // schema-agent-chat-affordances: F3a-only chrome — Schema-Agent header
  // and earlier-turns summary above the conversation.
  // ────────────────────────────────────────────────────────────────────
  describe("schema-agent-chat-affordances", () => {
    it("renders the Schema Agent header + sample switcher chip on F3a", () => {
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
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
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      expect(screen.queryByTestId("chat-schema-agent-header")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chat-schema-agent-sample-switcher")).not.toBeInTheDocument();
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // CF-18: chat input wire-up. Real form that posts via sendChatMessage
  // and renders the assistant turn in the conversation body.
  // ────────────────────────────────────────────────────────────────────
  describe("chat input (CF-18)", () => {
    it("renders a real input + send button (not the visual stub copy)", () => {
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
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
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "What is the bill total?");
      await user.click(screen.getByTestId("chat-live-send"));

      expect(screen.getByTestId("chat-live-user")).toHaveTextContent("What is the bill total?");

      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(
          "The bill total is $214.07.",
        );
      });

      expect(sendChatMessage).toHaveBeenCalledTimes(1);
      expect(vi.mocked(sendChatMessage).mock.calls[0][0]).toMatchObject({
        newUserMessage: "What is the bill total?",
      });
    });

    it("on a network failure, renders the 'couldn't reach' copy", async () => {
      vi.mocked(sendChatMessage).mockRejectedValueOnce(new Error("Failed to fetch"));

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "anything");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(
          /couldn't reach the chat service/i,
        );
      });
    });

    // CF-08 — per-status copy in the catch site.
    it("504 → renders 'took too long' copy (CF-08)", async () => {
      vi.mocked(sendChatMessage).mockRejectedValueOnce(new ChatApiError("timeout", 504, null));
      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "Q");
      await user.click(screen.getByTestId("chat-live-send"));
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(/took too long/i);
      });
    });

    it("401 → renders 'sign in to continue' copy (CF-08)", async () => {
      vi.mocked(sendChatMessage).mockRejectedValueOnce(new ChatApiError("unauth", 401, null));
      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "Q");
      await user.click(screen.getByTestId("chat-live-send"));
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(/sign in/i);
      });
    });

    it("501 → renders 'can't answer that yet' copy (CF-08)", async () => {
      vi.mocked(sendChatMessage).mockRejectedValueOnce(new ChatApiError("nyi", 501, null));
      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "Q");
      await user.click(screen.getByTestId("chat-live-send"));
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(/can't answer that yet/i);
      });
    });

    it("empty / whitespace input does not post", async () => {
      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "   ");
      await user.click(screen.getByTestId("chat-live-send"));
      expect(sendChatMessage).not.toHaveBeenCalled();
      expect(screen.queryByTestId("chat-live-user")).not.toBeInTheDocument();
    });
  });

  // RT-01 (round-trip contract). The chat handler persists every turn to
  // chat_messages; on-mount hydration replays them so a refresh survives.
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

      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(listChatMessages).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-user")).toHaveTextContent("what is the bill total?");
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(
          "The bill total is $7,613.20.",
        );
      });
    });

    it("P3.c: assistant bubble renders markdown (bold/code), not literal `**`/backticks", async () => {
      vi.mocked(listChatMessages).mockResolvedValueOnce([
        { id: "u1", chatSessionId: "md", turnIndex: 1, role: "user", content: "total?", errorCode: null, citations: [] },
        {
          id: "a1",
          chatSessionId: "md",
          turnIndex: 2,
          role: "assistant",
          content: "The total is **$7,613.20** in field `amount_due`.",
          errorCode: null,
          citations: [],
        },
      ]);

      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, { initialFrame: "f2", initialScenario: "utility" });

      const bubble = await screen.findByTestId("chat-live-assistant");
      expect(bubble.querySelector("strong")?.textContent).toBe("$7,613.20");
      expect(bubble.querySelector("code")?.textContent).toBe("amount_due");
      expect(bubble.textContent ?? "").not.toContain("**");
    });

    it("filters out system-role rows (UI only renders user + assistant)", async () => {
      vi.mocked(listChatMessages).mockResolvedValueOnce([
        { id: "s1", chatSessionId: "rt-sys", turnIndex: 0, role: "system", content: "system bootstrap", errorCode: null, citations: [] },
        { id: "u1", chatSessionId: "rt-sys", turnIndex: 1, role: "user", content: "hi there", errorCode: null, citations: [] },
      ]);

      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(screen.getByTestId("chat-live-user")).toHaveTextContent("hi there");
      });
      expect(screen.queryByText(/system bootstrap/i)).not.toBeInTheDocument();
    });

    it("empty persisted thread leaves the UI in its pre-RT-01 state (no live bubbles)", async () => {
      vi.mocked(listChatMessages).mockResolvedValueOnce([]);

      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      await waitFor(() => {
        expect(listChatMessages).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByTestId("chat-live-user")).not.toBeInTheDocument();
      expect(screen.queryByTestId("chat-live-assistant")).not.toBeInTheDocument();
    });

    it("hydration failure is non-fatal — the UI still mounts + accepts new sends", async () => {
      vi.mocked(listChatMessages).mockRejectedValueOnce(
        new ChatApiError("/api/chat-sessions/rt-fail/messages failed: 500", 500, null),
      );

      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      expect(screen.getByTestId("onboarding-chat-conversation")).toBeInTheDocument();
      expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
    });

    it("does NOT clobber optimistic state — if the user types while hydrate is in flight, the optimistic turn wins", async () => {
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
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "live typed message");
      await user.click(screen.getByTestId("chat-live-send"));
      await waitFor(() => {
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent(
          "fresh reply from server",
        );
      });

      await act(async () => {
        resolveHydrate([]);
        await Promise.resolve();
      });

      expect(screen.getByTestId("chat-live-user")).toHaveTextContent("live typed message");
      expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent("fresh reply from server");
    });
  });

  // clickable-citations Phase 2 — assistant replies render [n] chips.
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
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "what is the total?");
      await user.click(screen.getByTestId("chat-live-send"));

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
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = await screen.findByTestId("chat-live-input");
      await user.type(input.querySelector("input")!, "tax?");
      await user.click(screen.getByTestId("chat-live-send"));

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

      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
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
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
      </>,
      { initialFrame: "f1", initialScenario: null },
    );
    act(() => {
      screen.getByTestId("open-gate-byo").click();
    });
    expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
    const hasGateIndicator =
      screen.queryByTestId("gate-typing-indicator") !== null ||
      screen.queryByTestId("gate-rail-preamble") !== null;
    expect(hasGateIndicator).toBe(true);
  });

  // The steady chat (non-onboarding session) is the bare ConversationFlow:
  // no scripted decorations; RT-01 hydration + send path stay shared.
  describe("steady (bare) chat", () => {
    it("renders the bare conversation — no scripted decorations", async () => {
      renderWithOnboardingProviders(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });

      expect(await screen.findByTestId("conversation-flow")).toBeInTheDocument();

      // No onboarding-only decorations.
      expect(screen.queryByTestId("onboarding-chat-conversation")).not.toBeInTheDocument();
      expect(screen.queryByTestId("onboarding-chat-sample-switch")).not.toBeInTheDocument();
      expect(screen.queryByTestId("onboarding-chat-pick-a-view")).not.toBeInTheDocument();
      expect(screen.queryByText(/Reading/i)).not.toBeInTheDocument();
    });

    it("send path posts a message and renders the reply (isOnboarding=false from the session)", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-steady",
        assistantMessageId: "a-steady",
        reply: {
          mode: "rag",
          answer: "Steady reply.",
          citations: [],
          suggestedActions: [],
          tools: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = await screen.findByTestId("chat-live-input");
      await user.type(input.querySelector("input")!, "hello");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("chat-live-user")).toHaveTextContent("hello");
        expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent("Steady reply.");
      });
      // The active session is a steady (non-onboarding) one → isOnboarding=false.
      const sendCall = vi.mocked(sendChatMessage).mock.calls[0][0];
      expect(sendCall.sessionMeta.isOnboarding).toBe(false);
    });
  });

  // 2026-05-30-unified-conversation-flow Phase 3 — REGRESSION GUARD for the
  // deleted mount-persistence hack.
  //
  // The old ChatColumn forked SteadyConversationFlow / F2ConversationFlow and
  // needed a "keep the flow mounted across F2→F5" routing hack (former
  // ChatColumnInner :172) so an auto-advance wouldn't unmount the flow and wipe
  // its local `liveTurns`. Phase 2 collapsed both forks into the SINGLE
  // always-mounted <ConversationFlow>, so persistence is now STRUCTURAL: across
  // the onboarding journey ChatColumn returns the same <ConversationFlow> at the
  // same position, React reconciles it, and `useConversation`'s `liveTurns`
  // state survives.
  //
  // This test would FAIL against a remount-on-frame-change implementation
  // (e.g. keying ConversationFlow by frame, or branching it onto a different
  // mount site per frame): the optimistic user turn is held in the engine's
  // local `liveTurns` state ONLY — `sendChatMessage` is called once and
  // `listChatMessages` returns [], so a remount would re-mount an empty thread
  // and the seeded turn would vanish. We seed the turn at f2, let the first
  // send auto-advance the journey f2→f5, and assert the SAME turn content is
  // still present after the advance (no remount/wipe).
  it("Phase 3: liveTurns persist across an onboarding frame advance f2→f5 (no remount/wipe)", async () => {
    vi.mocked(sendChatMessage).mockResolvedValueOnce({
      userMessageId: "u-persist",
      assistantMessageId: "a-persist",
      reply: {
        mode: "rag",
        answer: "Totals reconciled.",
        citations: [],
        suggestedActions: [],
        tools: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    // Observe the live frame so the test can confirm the journey actually
    // advanced (the property is meaningless if the frame never changed).
    const framesSeen: string[] = [];
    let lastFrame = "";
    function FrameProbe() {
      const { state } = useOnboardingSession();
      lastFrame = state.currentFrame;
      if (framesSeen[framesSeen.length - 1] !== state.currentFrame) {
        framesSeen.push(state.currentFrame);
      }
      return null;
    }

    const user = userEvent.setup();
    renderWithOnboardingProviders(
      <>
        <ChatColumn role="anonymous" scope={{ type: "none" }} />
        <FrameProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    // The journey starts on f2.
    expect(lastFrame).toBe("f2");

    // Seed a real round-trip turn at f2.
    const input = screen.getByTestId("chat-live-input").querySelector("input")!;
    await user.type(input, "Reconcile the totals.");
    await user.click(screen.getByTestId("chat-live-send"));
    expect(screen.getByTestId("chat-live-user")).toHaveTextContent("Reconcile the totals.");
    await waitFor(() => {
      expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent("Totals reconciled.");
    });
    // The first send also fires the onboarding Choreography's onFirstUserSend →
    // advanceFrame("f5"), so the journey auto-advances f2 → f5: a genuine
    // onboarding frame advance happens as a side-effect of the seeded turn.
    await waitFor(() => {
      expect(lastFrame).toBe("f5");
    });
    // The frame REALLY changed (guards against a vacuous pass if the journey
    // never moved): we observed both f2 and f5.
    expect(framesSeen).toContain("f2");
    expect(framesSeen).toContain("f5");

    // After that frame advance, the conversation must NOT have remounted: the
    // optimistic turn — held ONLY in the engine's local liveTurns — survives,
    // and the server was hit exactly once. Against a remount-on-frame-change
    // implementation (the deleted :172 forked-flow hack existed precisely
    // because the fork could unmount on advance), liveTurns would be wiped and
    // re-hydrated from the empty `listChatMessages` mock → both bubbles gone.
    expect(screen.getByTestId("chat-live-user")).toHaveTextContent("Reconcile the totals.");
    expect(screen.getByTestId("chat-live-assistant")).toHaveTextContent("Totals reconciled.");
    expect(sendChatMessage).toHaveBeenCalledTimes(1);
  });

  // widget-llm-integration Phase 1 — render `suggestedActions[]` as a chip
  // row beneath each assistant bubble, and dispatch chip clicks.
  describe("SuggestedActionChips integration (widget-llm-integration Phase 1)", () => {
    it("onboarding: assistant reply carrying suggestedActions renders one chip per action under the bubble", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-sa-1",
        assistantMessageId: "a-sa-1",
        reply: {
          mode: "rag",
          answer: "Sure — here's what I found.",
          citations: [],
          suggestedActions: [
            { key: "show-source", label: "Show source" },
            { key: "open-samples", label: "Open samples" },
          ],
          tools: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "find anything?");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-show-source")).toBeInTheDocument();
        expect(screen.getByTestId("suggested-action-chip-open-samples")).toBeInTheDocument();
      });
      expect(screen.getByTestId("suggested-action-chip-show-source")).toHaveTextContent(/Show source/i);
    });

    it("steady: assistant reply carrying suggestedActions renders chips under the bubble", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-sa-s",
        assistantMessageId: "a-sa-s",
        reply: {
          mode: "rag",
          answer: "Steady reply with suggestions.",
          citations: [],
          suggestedActions: [{ key: "show-source", label: "Show source" }],
          tools: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = await screen.findByTestId("chat-live-input");
      await user.type(input.querySelector("input")!, "anything?");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-show-source")).toBeInTheDocument();
      });
    });

    it("Phase 8 — clicking a tool:<name> chip dispatches detail.intent via the orchestrator", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-t8",
        assistantMessageId: "a-t8",
        reply: {
          mode: "rag",
          answer: "Mutate-tool chip arrived.",
          citations: [],
          suggestedActions: [
            { key: "show-source", label: "Show source" },
            {
              key: "tool:accept_proposal",
              label: "Accept the proposed field",
              detail: {
                name: "accept_proposal",
                arguments: { fieldId: "f-1" },
                intent: { kind: "switchFrame", frame: "f3" },
              },
            },
          ],
          tools: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const dispatched: Array<Record<string, unknown>> = [];
      const Harness = () => {
        const { registerAdapter } = useCanvasOrchestrator();
        useEffect(() => {
          return registerAdapter({
            kind: "switchFrame",
            apply: (intent) => {
              dispatched.push(intent);
            },
          });
        }, [registerAdapter]);
        return <ChatColumn role="anonymous" scope={{ type: "none" }} />;
      };

      const user = userEvent.setup();
      renderWithOnboardingProviders(<Harness />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "accept that field");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-tool:accept_proposal")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("suggested-action-chip-tool:accept_proposal"));

      await waitFor(() => {
        expect(dispatched.length).toBeGreaterThan(0);
      });
      expect(dispatched[0]).toMatchObject({ kind: "switchFrame", frame: "f3" });
    });

    it("clicking the high-confidence suggested-intent chip dispatches a CanvasIntent via the orchestrator", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-si",
        assistantMessageId: "a-si",
        reply: {
          mode: "rag",
          answer: "Take a look at the extract.",
          citations: [],
          suggestedActions: [
            { key: "show-source", label: "Show source" },
            {
              key: "suggested-intent",
              label: "Open the extract to compare line items",
              detail: { intent: "show-extract", confidence: 0.91 },
            },
          ],
          tools: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const dispatched: Array<Record<string, unknown>> = [];
      const Harness = () => {
        const { registerAdapter } = useCanvasOrchestrator();
        useEffect(() => {
          return registerAdapter({
            kind: "switchFrame",
            apply: (intent) => {
              dispatched.push(intent);
            },
          });
        }, [registerAdapter]);
        return <ChatColumn role="anonymous" scope={{ type: "none" }} />;
      };

      const user = userEvent.setup();
      renderWithOnboardingProviders(<Harness />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "explain the totals");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-suggested-intent")).toBeInTheDocument();
      });

      await user.click(screen.getByTestId("suggested-action-chip-suggested-intent"));

      await waitFor(() => {
        expect(dispatched.length).toBeGreaterThan(0);
      });
      expect(dispatched[0]).toMatchObject({ kind: "switchFrame", frame: "f3" });
    });

    // Empty-bubble guard (2026-05-28). An empty answer with chips must
    // suppress the bot bubble but keep the chip.
    it("onboarding: empty answer with chips suppresses the bot bubble but keeps the chip", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-empty",
        assistantMessageId: "a-empty",
        reply: {
          mode: "rag",
          answer: "",
          citations: [],
          suggestedActions: [
            {
              key: "tool:book_call",
              label: "Open the Calendly booking surface",
              detail: { name: "book_call", arguments: {}, intent: { kind: "openBookCall" } },
            },
          ],
          tools: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<ChatColumn role="anonymous" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = screen.getByTestId("chat-live-input").querySelector("input")!;
      await user.type(input, "book me a call");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-tool:book_call")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("chat-live-assistant")).not.toBeInTheDocument();
    });

    it("steady: empty answer with chips suppresses the bot bubble but keeps the chip", async () => {
      vi.mocked(sendChatMessage).mockResolvedValueOnce({
        userMessageId: "u-empty-s",
        assistantMessageId: "a-empty-s",
        reply: {
          mode: "rag",
          answer: "",
          citations: [],
          suggestedActions: [{ key: "show-source", label: "Show source" }],
          tools: [],
          intents: [],
          toolFailures: [],
          proposedSchemaField: null,
        },
        compressionRan: false,
      });

      const user = userEvent.setup();
      renderWithOnboardingProviders(<SteadySessionMount role="member" scope={{ type: "none" }} />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      const input = await screen.findByTestId("chat-live-input");
      await user.type(input.querySelector("input")!, "look at it");
      await user.click(screen.getByTestId("chat-live-send"));

      await waitFor(() => {
        expect(screen.getByTestId("suggested-action-chip-show-source")).toBeInTheDocument();
      });
      expect(screen.queryByTestId("chat-live-assistant")).not.toBeInTheDocument();
    });
  });
});
