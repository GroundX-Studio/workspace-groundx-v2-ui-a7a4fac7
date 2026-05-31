import { act, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `useConversation` posts via `sendChatMessage` and hydrates the visible
// thread via `listChatMessages` — both mocked here so the round-trip is
// deterministic and never touches the network.
vi.mock("@/api/chatSessions", async () => {
  const actual = await vi.importActual<typeof import("@/api/chatSessions")>("@/api/chatSessions");
  return {
    ...actual,
    sendChatMessage: vi.fn(),
    listChatMessages: vi.fn(),
  };
});
import { sendChatMessage, listChatMessages } from "@/api/chatSessions";

import { useChatStore } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { useConversation } from "./useConversation";

beforeEach(() => {
  vi.mocked(sendChatMessage).mockReset();
  vi.mocked(listChatMessages).mockReset();
  vi.mocked(listChatMessages).mockResolvedValue([]);
});

afterEach(() => {
  vi.clearAllMocks();
});

/**
 * Probe — mounts `useConversation` against the active ChatStore session
 * and renders its `liveTurns` + a send button so the test can drive the
 * engine without either flow component. It also surfaces the resolved
 * chatSessionId so assertions don't depend on a hardcoded id.
 */
function Probe({ onFirstUserSend }: { onFirstUserSend?: () => void }) {
  const { state } = useChatStore();
  const chatSessionId = state.activeSessionId;
  const conv = useConversation(chatSessionId, { onFirstUserSend });
  return (
    <div>
      <div data-testid="probe-session-id">{chatSessionId ?? "none"}</div>
      <div data-testid="probe-sending">{String(conv.sending)}</div>
      <button data-testid="probe-send" onClick={() => void conv.send("What is the bill total?")}>
        send
      </button>
      <ul>
        {conv.liveTurns.map((t) => (
          <li key={t.id} data-testid={`probe-turn-${t.role}`}>
            {t.content}
            {(t.citations ?? []).map((c, i) => (
              <span key={i} data-testid="probe-citation">
                {c.documentId}
              </span>
            ))}
            {(t.suggestedActions ?? []).map((a) => (
              <span key={a.key} data-testid="probe-action">
                {a.label}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("useConversation (durable engine)", () => {
  it("round-trips a send: optimistic user turn + assistant turn with citations and suggested actions", async () => {
    vi.mocked(sendChatMessage).mockResolvedValueOnce({
      userMessageId: "u-1",
      assistantMessageId: "a-1",
      reply: {
        mode: "rag",
        answer: "The bill total is $214.07.",
        citations: [{ documentId: "doc-1", page: 1 }],
        suggestedActions: [{ key: "show-source", label: "Show source" }],
        tools: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    renderWithOnboardingProviders(<Probe />, {
      initialFrame: "f2",
      initialScenario: "utility",
    });

    // There is a real active session (the onboarding harness seeds one).
    await waitFor(() => {
      expect(screen.getByTestId("probe-session-id")).not.toHaveTextContent("none");
    });

    await act(async () => {
      screen.getByTestId("probe-send").click();
    });

    // Optimistic user turn is visible immediately.
    expect(screen.getByTestId("probe-turn-user")).toHaveTextContent("What is the bill total?");

    // Assistant turn lands with the answer + citation + suggested action.
    await waitFor(() => {
      expect(screen.getByTestId("probe-turn-assistant")).toHaveTextContent(
        "The bill total is $214.07.",
      );
    });
    expect(screen.getByTestId("probe-citation")).toHaveTextContent("doc-1");
    expect(screen.getByTestId("probe-action")).toHaveTextContent("Show source");

    expect(sendChatMessage).toHaveBeenCalledTimes(1);
  });

  it("reads isOnboarding from the active session (not hardcoded) and fires onFirstUserSend", async () => {
    vi.mocked(sendChatMessage).mockResolvedValueOnce({
      userMessageId: "u-1",
      assistantMessageId: "a-1",
      reply: {
        mode: "rag",
        answer: "ok",
        citations: [],
        suggestedActions: [],
        tools: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    const onFirstUserSend = vi.fn();
    renderWithOnboardingProviders(<Probe onFirstUserSend={onFirstUserSend} />, {
      initialFrame: "f2",
      initialScenario: "utility",
    });

    await waitFor(() => {
      expect(screen.getByTestId("probe-session-id")).not.toHaveTextContent("none");
    });

    await act(async () => {
      screen.getByTestId("probe-send").click();
    });

    await waitFor(() => {
      expect(sendChatMessage).toHaveBeenCalledTimes(1);
    });

    // The onboarding session is flagged onboarding → the send carries
    // isOnboarding:true sourced FROM the session, not a literal.
    expect(vi.mocked(sendChatMessage).mock.calls[0][0].sessionMeta.isOnboarding).toBe(true);
    // The lifecycle hook fired exactly once on the first user send.
    expect(onFirstUserSend).toHaveBeenCalledTimes(1);
  });

  it("projects agent-prefixed ChatStore messages into liveTurns", async () => {
    function AgentEmitter() {
      const { appendAgentMessage } = useChatStore();
      useEffect(() => {
        appendAgentMessage("Confidence climbed to 0.91.");
      }, [appendAgentMessage]);
      return <Probe />;
    }

    renderWithOnboardingProviders(<AgentEmitter />, {
      initialFrame: "f3a",
      initialScenario: "utility",
    });

    await waitFor(() => {
      expect(screen.getByTestId("probe-turn-assistant")).toHaveTextContent(
        "Confidence climbed to 0.91.",
      );
    });
  });
});
