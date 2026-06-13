import { act, screen, waitFor } from "@testing-library/react";
import { useEffect, useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useChatStore } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { useConversation } from "./useConversation";

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
  sendChatMessage.mockReset();
  listChatMessages.mockReset();
  listChatMessages.mockResolvedValue([]);
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
          <li key={t.id} data-testid={`probe-turn-${t.role}`} data-pinnable={String(t.pinnable === true)}>
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
    sendChatMessage.mockResolvedValueOnce({
      userMessageId: "u-1",
      assistantMessageId: "a-1",
      reply: {
        mode: "rag",
        answer: "The bill total is $214.07.",
        citations: [{ documentId: "doc-1", page: 1 }],
        suggestedActions: [{ key: "show-source", label: "Show source" }],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    renderWithConversationApi(<Probe />, {
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
    sendChatMessage.mockResolvedValueOnce({
      userMessageId: "u-1",
      assistantMessageId: "a-1",
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

    const onFirstUserSend = vi.fn();
    renderWithConversationApi(<Probe onFirstUserSend={onFirstUserSend} />, {
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
    expect(sendChatMessage.mock.calls[0][0].sessionMeta.isOnboarding).toBe(true);
    // The lifecycle hook fired exactly once on the first user send.
    expect(onFirstUserSend).toHaveBeenCalledTimes(1);
  });

  it("auto-highlights the answer's primary citation on the canvas — no click needed", async () => {
    sendChatMessage.mockResolvedValueOnce({
      userMessageId: "u-1",
      assistantMessageId: "a-1",
      reply: {
        mode: "rag",
        answer: "The total amount due is $7,613.20.",
        citations: [
          { documentId: "c3bfff49", page: 2, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.01 }, tier: "exact" },
        ],
        suggestedActions: [],
        intents: [],
        toolFailures: [],
        proposedSchemaField: null,
      },
      compressionRan: false,
    });

    // Probe that surfaces the active canvas viewer step so we can prove the
    // citation opened the source WITHOUT a user click on the chip.
    function ViewerProbe() {
      const { state } = useChatStore();
      const sid = state.activeSessionId;
      const conv = useConversation(sid);
      const sess = sid ? state.sessions.get(sid) : null;
      const idx = sess?.viewer.currentStep.stepIndex ?? -1;
      const top = idx >= 0 ? sess?.viewer.history[idx] : null;
      return (
        <div>
          <div data-testid="probe-session-id">{sid ?? "none"}</div>
          <button data-testid="probe-send" onClick={() => void conv.send("total?")}>
            send
          </button>
          <div data-testid="viewer-step">
            {top && top.kind === "doc-viewer"
              ? `${top.documentId}|${top.page}|${top.highlight?.bbox ? "bbox" : "no-bbox"}`
              : "none"}
          </div>
        </div>
      );
    }

    renderWithConversationApi(<ViewerProbe />, {
      initialFrame: "f5",
      initialScenario: "utility",
    });
    await waitFor(() => {
      expect(screen.getByTestId("probe-session-id")).not.toHaveTextContent("none");
    });

    await act(async () => {
      screen.getByTestId("probe-send").click();
    });

    // The canvas viewer jumped to the cited page with the bbox highlight — the
    // same end state as clicking [1], but triggered automatically by the answer.
    await waitFor(() => {
      expect(screen.getByTestId("viewer-step")).toHaveTextContent("c3bfff49|2|bbox");
    });
  });

  it("'Show all sources' lights up every citation region on the canvas", async () => {
    function SourcesProbe() {
      const { state } = useChatStore();
      const sid = state.activeSessionId;
      const conv = useConversation(sid);
      const sess = sid ? state.sessions.get(sid) : null;
      const idx = sess?.viewer.currentStep.stepIndex ?? -1;
      const top = idx >= 0 ? sess?.viewer.history[idx] : null;
      const citations = [
        { documentId: "c3", page: 1, bbox: { x: 0.1, y: 0.2, w: 0.3, h: 0.02 } },
        { documentId: "c3", page: 2, bbox: { x: 0.2, y: 0.3, w: 0.4, h: 0.02 } },
      ];
      return (
        <div>
          <div data-testid="probe-session-id">{sid ?? "none"}</div>
          <button
            data-testid="show-all"
            onClick={() =>
              conv.handleSuggestedAction({ key: "show-source", label: "Show all sources" }, citations)
            }
          >
            show
          </button>
          <div data-testid="lit-count">
            {top && top.kind === "doc-viewer" ? String(top.litRegions?.length ?? 0) : "none"}
          </div>
        </div>
      );
    }

    renderWithConversationApi(<SourcesProbe />, { initialFrame: "f5", initialScenario: "utility" });
    await waitFor(() => {
      expect(screen.getByTestId("probe-session-id")).not.toHaveTextContent("none");
    });

    await act(async () => {
      screen.getByTestId("show-all").click();
    });

    // Both citation regions are drawn on the doc-viewer step at once.
    await waitFor(() => expect(screen.getByTestId("lit-count")).toHaveTextContent("2"));
  });

  it("projects agent-prefixed ChatStore messages into liveTurns", async () => {
    function AgentEmitter() {
      const { appendAgentMessage } = useChatStore();
      useEffect(() => {
        appendAgentMessage("Confidence climbed to 0.91.");
      }, [appendAgentMessage]);
      return <Probe />;
    }

    renderWithConversationApi(<AgentEmitter />, {
      initialFrame: "f3a",
      initialScenario: "utility",
    });

    await waitFor(() => {
      expect(screen.getByTestId("probe-turn-assistant")).toHaveTextContent(
        "Confidence climbed to 0.91.",
      );
    });
    // report-pin-affordance — agent narration is NOT pinnable (opt-in: only
    // genuine answers set `pinnable`).
    expect(screen.getByTestId("probe-turn-assistant")).toHaveAttribute("data-pinnable", "false");
  });

  // report-pin-affordance — `pinnable` round-trip: it's set ONLY at the genuine
  // answer mint sites (send-reply + DB-hydration of a non-error assistant turn),
  // never on user / error / narration turns. (The gate reads `pinnable === true`.)
  it("the sent answer turn is pinnable; the optimistic user turn is not", async () => {
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
    renderWithConversationApi(<Probe />, { initialFrame: "f2", initialScenario: "utility" });
    await waitFor(() => expect(screen.getByTestId("probe-session-id")).not.toHaveTextContent("none"));
    await act(async () => {
      screen.getByTestId("probe-send").click();
    });
    await waitFor(() =>
      expect(screen.getByTestId("probe-turn-assistant")).toHaveTextContent("$214.07"),
    );
    expect(screen.getByTestId("probe-turn-assistant")).toHaveAttribute("data-pinnable", "true");
    expect(screen.getByTestId("probe-turn-user")).toHaveAttribute("data-pinnable", "false");
  });

  it("hydration marks a non-error assistant answer pinnable; user + error turns are not", async () => {
    listChatMessages.mockResolvedValue([
      { id: "m-u", role: "user", content: "What's the total?", citations: [] },
      { id: "m-a", role: "assistant", content: "The total is $7,613.20.", citations: [] },
      { id: "m-err", role: "assistant", content: "Something went wrong.", citations: [], errorCode: "rag_failed" },
    ]);
    renderWithConversationApi(<Probe />, { initialFrame: "f2", initialScenario: "utility" });
    await waitFor(() => expect(screen.getByText("The total is $7,613.20.")).toBeInTheDocument());
    const turns = screen.getAllByTestId(/probe-turn-/);
    const answer = turns.find((t) => t.textContent?.includes("$7,613.20"));
    const user = turns.find((t) => t.textContent?.includes("What's the total"));
    const err = turns.find((t) => t.textContent?.includes("Something went wrong"));
    expect(answer).toHaveAttribute("data-pinnable", "true");
    expect(user).toHaveAttribute("data-pinnable", "false");
    expect(err).toHaveAttribute("data-pinnable", "false");
  });

  it("hydrates scoped product sessions with non-onboarding ensure metadata", async () => {
    function ScopedHydrationProbe() {
      const { resolveSessionForScope } = useChatStore();
      const [chatSessionId, setChatSessionId] = useState<string | null>(null);
      useEffect(() => {
        setChatSessionId(resolveSessionForScope({ type: "bucket", bucketId: 28454 }, { title: "Workspace" }));
      }, [resolveSessionForScope]);
      useConversation(chatSessionId, { title: "Workspace" });
      return <div data-testid="probe-session-id">{chatSessionId ?? "none"}</div>;
    }

    renderWithConversationApi(<ScopedHydrationProbe />, {
      initialFrame: "f1",
      initialScenario: null,
      initialAuthState: "signed-in",
    });

    await waitFor(() => {
      expect(screen.getByTestId("probe-session-id")).not.toHaveTextContent("none");
      expect(listChatMessages).toHaveBeenCalled();
    });
    expect(listChatMessages.mock.calls[0][1]).toMatchObject({
      title: "Workspace",
      isOnboarding: false,
      activeEntityKey: null,
    });
    expect(listChatMessages.mock.calls[0][1].onboardingSessionId).toBe(
      screen.getByTestId("probe-session-id").textContent,
    );
  });
});
