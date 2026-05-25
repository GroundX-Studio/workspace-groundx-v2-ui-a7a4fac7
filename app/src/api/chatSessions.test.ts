import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetEnsuredChatSessions,
  createChatSession,
  sendChatMessage,
} from "./chatSessions";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  __resetEnsuredChatSessions();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("createChatSession", () => {
  it("POSTs to /api/chat-sessions and returns the parsed result", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ chatSessionId: "chat-1", ownerUserId: null, ownerAnonId: "anon-abc" }),
    });
    const result = await createChatSession({
      id: "chat-1",
      onboardingSessionId: "onb-1",
      title: "Onboarding",
      isOnboarding: true,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/chat-sessions",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(result).toMatchObject({ chatSessionId: "chat-1", ownerAnonId: "anon-abc" });
  });

  it("throws with status + detail when the BFF returns non-2xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Authentication required" }),
    });
    await expect(
      createChatSession({ id: "chat-x", title: "Untitled", isOnboarding: false }),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe("sendChatMessage", () => {
  it("ensures the chat session exists, then POSTs /api/chat/messages", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ chatSessionId: "chat-1", ownerUserId: null, ownerAnonId: "anon-abc" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u-1",
          assistantMessageId: "m-a-1",
          reply: {
            mode: "rag",
            answer: "Here's the answer.",
            citations: [],
            suggestedActions: [],
            tools: [],
          },
          compressionRan: false,
        }),
      });

    const result = await sendChatMessage({
      chatSessionId: "chat-1",
      newUserMessage: "What is RAG?",
      sessionMeta: { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" },
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chat-sessions");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/chat/messages");
    expect(result.reply.answer).toBe("Here's the answer.");
  });

  it("skips the ensure-create call on the second send for the same session id", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u-1",
          assistantMessageId: "m-a-1",
          reply: { mode: "rag", answer: "one", citations: [], suggestedActions: [], tools: [] },
          compressionRan: false,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u-2",
          assistantMessageId: "m-a-2",
          reply: { mode: "rag", answer: "two", citations: [], suggestedActions: [], tools: [] },
          compressionRan: false,
        }),
      });

    const meta = { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" };
    await sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "first", sessionMeta: meta });
    await sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "second", sessionMeta: meta });

    // ensure-create fires only once
    const ensureCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/chat-sessions");
    expect(ensureCalls).toHaveLength(1);
    const sendCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/chat/messages");
    expect(sendCalls).toHaveLength(2);
  });

  it("invalidates the ensured-session cache when /api/chat/messages returns 404", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      // first send: ensure-create + 404 from message endpoint
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: "chat_session_not_found" }),
      })
      // second send: should re-create then succeed
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u",
          assistantMessageId: "m-a",
          reply: { mode: "rag", answer: "ok", citations: [], suggestedActions: [], tools: [] },
          compressionRan: false,
        }),
      });

    const meta = { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" };

    // First send fails with 404 → cache invalidated.
    await expect(
      sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "first", sessionMeta: meta }),
    ).rejects.toMatchObject({ status: 404 });

    // Second send must re-run the ensure-create step (not skip it).
    await sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "second", sessionMeta: meta });
    const ensureCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/chat-sessions");
    expect(ensureCalls).toHaveLength(2); // once before each send
  });

  it("does NOT invalidate the cache on non-404 errors (5xx is transient)", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "router_failed" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u",
          assistantMessageId: "m-a",
          reply: { mode: "rag", answer: "ok", citations: [], suggestedActions: [], tools: [] },
          compressionRan: false,
        }),
      });

    const meta = { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" };

    await expect(
      sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "first", sessionMeta: meta }),
    ).rejects.toMatchObject({ status: 502 });

    // Retry — ensure-create should NOT fire again (cache intact).
    await sendChatMessage({ chatSessionId: "chat-1", newUserMessage: "second", sessionMeta: meta });
    const ensureCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/chat-sessions");
    expect(ensureCalls).toHaveLength(1);
  });

  it("throws with the server error envelope when /api/chat/messages returns non-2xx", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ error: "router_failed:upstream timeout" }),
      });

    await expect(
      sendChatMessage({
        chatSessionId: "chat-1",
        newUserMessage: "hi",
        sessionMeta: { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" },
      }),
    ).rejects.toMatchObject({ status: 502 });
  });

  it("forwards optional intent hint to the message endpoint", async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "chat-1" }) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          userMessageId: "m-u",
          assistantMessageId: "m-a",
          reply: { mode: "rag", answer: "x", citations: [], suggestedActions: [], tools: [] },
          compressionRan: false,
        }),
      });

    await sendChatMessage({
      chatSessionId: "chat-1",
      newUserMessage: "hi",
      intent: "extract.field-hovered",
      sessionMeta: { title: "Onboarding", isOnboarding: true, onboardingSessionId: "onb-1" },
    });

    const sendCall = fetchMock.mock.calls.find((c) => c[0] === "/api/chat/messages");
    expect(sendCall).toBeDefined();
    const body = JSON.parse((sendCall![1] as RequestInit).body as string);
    expect(body.intent).toBe("extract.field-hovered");
  });
});
