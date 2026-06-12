/**
 * 2026-05-30-unified-conversation-flow Phase 2 — the single
 * `<ConversationFlow>` over the durable `useConversation` engine + the
 * optional `ChatExperience`.
 *
 * Two contracts pinned here:
 *   1. With NO experience, `<ConversationFlow>` renders the bare chat —
 *      input + live turns under the single `chat-live-*` testids (no
 *      `onboarding-`/`steady-` prefix). Send round-trips through the engine.
 *   2. With `makeOnboardingExperience(...)`, the scripted intro (ThinkingStream
 *      + pick-view pills) renders ABOVE the thread, and the f3/f5 auto-advance
 *      fires via the experience's `Choreography` (intro-done → f3, first send
 *      → f5). These are the existing ChatColumn auto-advance assertions,
 *      retargeted onto the experience layer.
 */
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// jsdom has no matchMedia → framer-motion's useReducedMotion() returns true
// and short-circuits the ThinkingStream timer. Pin it false so the scripted
// intro actually streams.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return { ...actual, useReducedMotion: () => false };
});

import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import type { ChatExperience } from "./ChatExperience";
import { ConversationFlow } from "./ConversationFlow";
import { makeOnboardingExperience } from "./experiences/onboarding/experience";

/**
 * Mount `ConversationFlow` against the active chat session from ChatStore,
 * so the test exercises the same session-id wiring `ChatColumn` uses.
 */
function ActiveConversationFlow(props: { experience?: ReturnType<typeof makeOnboardingExperience> }) {
  const { state } = useChatStore();
  return <ConversationFlow chatSessionId={state.activeSessionId} experience={props.experience} />;
}

const sendChatMessage = vi.fn();
const listChatMessages = vi.fn();

type RenderOptions = Parameters<typeof renderWithOnboardingProviders>[1];

const renderWithConversationApi = (ui: ReactElement, options: RenderOptions = {}) =>
  renderWithOnboardingProviders(ui, {
    ...options,
    api: {
      ...options.api,
      chat: {
        ...options.api?.chat,
        sendChatMessage,
        listChatMessages,
      },
    },
  });

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  sendChatMessage.mockReset();
  listChatMessages.mockReset();
  listChatMessages.mockResolvedValue([]);
  if (typeof window !== "undefined") window.sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ConversationFlow (no experience → bare chat)", () => {
  it("renders the input and no intro/pills", () => {
    renderWithConversationApi(<ActiveConversationFlow />, {
      initialFrame: "f2",
      initialScenario: "utility",
    });
    expect(screen.getByTestId("chat-live-input")).toBeInTheDocument();
    // Onboarding decorations are absent without an experience.
    expect(screen.queryByTestId("conversation-intro")).not.toBeInTheDocument();
    expect(screen.queryByTestId("onboarding-chat-pick-a-view")).not.toBeInTheDocument();
  });

  it("a send round-trips: optimistic user turn + assistant reply under chat-live-* testids", async () => {
    sendChatMessage.mockResolvedValueOnce({
      userMessageId: "u-1",
      assistantMessageId: "a-1",
      reply: {
        mode: "rag",
        answer: "The bill total is $214.07.",
        citations: [],
        suggestedActions: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    const user = userEvent.setup();
    renderWithConversationApi(<ActiveConversationFlow />, {
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
  });
});

describe("ConversationFlow (experience.seedTurns → one-shot opener injected on mount)", () => {
  it("injects the experience's seed turns once on mount", async () => {
    // An experience that opens with a scripted assistant turn (the shape the
    // follow-on Workspace/Project experiences use). Pins the engine's
    // `seedTurns` path end-to-end.
    const seedExperience: ChatExperience = {
      seedTurns: () => [
        { id: "seed-1", role: "assistant", content: "Here is what is in this workspace." },
      ],
    };
    renderWithConversationApi(<ActiveConversationFlow experience={seedExperience} />, {
      initialFrame: "f2",
      initialScenario: "utility",
    });
    expect(await screen.findByTestId("chat-live-assistant")).toHaveTextContent(
      "Here is what is in this workspace.",
    );
  });

  it("mounts the 📌 pin-to-report affordance under an assistant turn (not just defined)", async () => {
    // Regression guard (step-17 review): PinToReportAction existed + was
    // unit-tested + its tool path was live, but it was NEVER mounted in the
    // production conversation flow — dormant UI plumbing. This asserts the
    // affordance is actually reachable under a rendered assistant turn.
    const seedExperience: ChatExperience = {
      seedTurns: () => [
        { id: "seed-1", role: "assistant", content: "Here is what is in this workspace." },
      ],
    };
    renderWithConversationApi(<ActiveConversationFlow experience={seedExperience} />, {
      initialFrame: "f2",
      initialScenario: "utility",
    });
    await screen.findByTestId("chat-live-assistant");
    expect(screen.getByTestId("pin-to-report-action")).toBeInTheDocument();
  });
});

describe("ConversationFlow (onboarding experience → scripted intro + choreography)", () => {
  function onboardingExperience() {
    // Mirrors what ChatColumn passes at the mount site: scenario file/title →
    // the experience's grounding scopeHint.
    return makeOnboardingExperience({
      scenarioId: "utility",
      thinkingScript: ["Reading the meters…", "Totaling the charges…", "Cross-checking dates…"],
      fileName: "April 2026 Statement.pdf",
      scenarioTitle: "Utility Bill",
    });
  }

  it("renders the scripted intro + pick-view pills above the thread", () => {
    vi.useFakeTimers();
    renderWithConversationApi(
      <ActiveConversationFlow experience={onboardingExperience()} />,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    // Intro decoration present (scripted thinking-stream is mounting).
    expect(screen.getByTestId("conversation-intro")).toBeInTheDocument();
    expect(screen.getAllByTestId(/thinking-note-/).length).toBeGreaterThanOrEqual(1);
  });

  it("auto-advances to f3 when the scripted intro finishes (Choreography intro-done → f3)", () => {
    vi.useFakeTimers();
    let lastFrame = "";
    function FrameProbe() {
      const { state } = useOnboardingSession();
      lastFrame = state.currentFrame;
      return null;
    }
    renderWithConversationApi(
      <>
        <ActiveConversationFlow experience={onboardingExperience()} />
        <FrameProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );
    // Walk the stream forward past the last note + the done-reveal delay.
    for (let i = 0; i < 10; i += 1) {
      act(() => {
        vi.advanceTimersByTime(3000);
      });
    }
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(lastFrame).toBe("f3");
  });

  it("auto-advances to f5 on the first user send (Choreography onFirstUserSend → f5)", async () => {
    sendChatMessage.mockResolvedValueOnce({
      userMessageId: "u-f5",
      assistantMessageId: "a-f5",
      reply: {
        mode: "rag",
        answer: "ok",
        citations: [],
        suggestedActions: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    let lastFrame = "";
    function FrameProbe() {
      const { state } = useOnboardingSession();
      lastFrame = state.currentFrame;
      return null;
    }

    const user = userEvent.setup();
    renderWithConversationApi(
      <>
        <ActiveConversationFlow experience={onboardingExperience()} />
        <FrameProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    const input = screen.getByTestId("chat-live-input").querySelector("input")!;
    await user.type(input, "explain the totals");
    await user.click(screen.getByTestId("chat-live-send"));

    await waitFor(() => {
      expect(lastFrame).toBe("f5");
    });
  });

  it("threads the experience's scopeHint + title into sendChatMessage (grounding the onboarding prompt)", async () => {
    sendChatMessage.mockResolvedValueOnce({
      userMessageId: "u-hint",
      assistantMessageId: "a-hint",
      reply: {
        mode: "rag",
        answer: "ok",
        citations: [],
        suggestedActions: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    const user = userEvent.setup();
    renderWithConversationApi(
      <ActiveConversationFlow experience={onboardingExperience()} />,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    const input = screen.getByTestId("chat-live-input").querySelector("input")!;
    await user.type(input, "what is the due date?");
    await user.click(screen.getByTestId("chat-live-send"));

    await waitFor(() => {
      expect(sendChatMessage).toHaveBeenCalledTimes(1);
    });
    const arg = sendChatMessage.mock.calls[0][0];
    // scopeHint is what lets the model answer/redirect off-topic queries when
    // GroundX returns 0 snippets (chatSessions.ts §scopeHint). Deleting the
    // forks must NOT drop it.
    expect(arg.scopeHint).toEqual({
      fileName: "April 2026 Statement.pdf",
      scenarioTitle: "Utility Bill",
    });
    // The active onboarding session is titled "Onboarding"; session title wins
    // over the experience's static fallback (preserves the deleted onboarding
    // fork's `activeChatSession?.title ?? "Onboarding"` precedence).
    expect(arg.sessionMeta.title).toBe("Onboarding");
  });

  it("does NOT auto-advance to f5 when a persisted USER turn is hydrated (only a genuine send fires it)", async () => {
    // A returning user with a persisted user turn must NOT trip the
    // first-send choreography on mount — `firstUserMessageSent` is set only by
    // a real `send()`, not by RT-01 hydration.
    listChatMessages.mockResolvedValueOnce([
      { id: "m1", chatSessionId: "rt", turnIndex: 1, role: "user", content: "prior question", errorCode: null, citations: [] },
    ]);

    let lastFrame = "";
    function FrameProbe() {
      const { state } = useOnboardingSession();
      lastFrame = state.currentFrame;
      return null;
    }
    renderWithConversationApi(
      <>
        <ActiveConversationFlow experience={onboardingExperience()} />
        <FrameProbe />
      </>,
      { initialFrame: "f2", initialScenario: "utility" },
    );

    await waitFor(() => {
      expect(screen.getByTestId("chat-live-user")).toHaveTextContent("prior question");
    });
    // Hydration alone must not fire the first-send choreography (no jump to f5).
    expect(lastFrame).not.toBe("f5");
  });
});
