import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatSession, ChatStoreState, ViewerEvent } from "@/contexts/ChatStoreContext/types";
import type { EntityKey, EntitySession } from "@/contexts/EntityRegistryContext";

import { claimAnonymousChat, serializeChatPayload } from "./claimAnonymousChat";

function makeSession(overrides: Partial<ChatSession> = {}): ChatSession {
  const entities = new Map<EntityKey, EntitySession>();
  return {
    id: "c-1",
    title: "Onboarding",
    createdAt: 1700000000000,
    updatedAt: 1700000001000,
    messages: [],
    summaries: [],
    entities,
    activeEntityKey: null,
    viewerHistory: [],
    currentIntent: null,
    gate: { status: "idle" },
    signupOpen: false,
    isOnboardingSession: true,
    ...overrides,
  } as ChatSession;
}

function makeStoreState(sessions: ChatSession[]): ChatStoreState {
  const map = new Map<string, ChatSession>();
  for (const s of sessions) map.set(s.id, s);
  return { ownerKey: "anon-abc", sessions: map, activeSessionId: sessions[0]?.id ?? null };
}

describe("serializeChatPayload", () => {
  it("turns a single empty session into a single chat-session record with no children", () => {
    const state = makeStoreState([makeSession()]);
    const payload = serializeChatPayload(state, {
      anonymousUserId: "anon-abc",
      onboardingSessionId: "onb-1",
    });
    expect(payload.chatSessions).toHaveLength(1);
    expect(payload.chatSessions[0]).toMatchObject({
      id: "c-1",
      onboardingSessionId: "onb-1",
      ownerUserId: null,
      ownerAnonId: "anon-abc",
      isOnboarding: true,
    });
    expect(payload.chatMessages).toHaveLength(0);
    expect(payload.viewerEvents).toHaveLength(0);
    expect(payload.chatSessionEntities).toHaveLength(0);
    expect(payload.conversationSummaries).toHaveLength(0);
  });

  it("expands messages with turn indices, entities + viewer events with the parent session id", () => {
    const entities = new Map<EntityKey, EntitySession>();
    entities.set("sample:utility" as EntityKey, {
      key: "sample:utility" as EntityKey,
      kind: "sample",
      id: "utility",
      lastFrame: "f2",
      completedFrames: new Set(["f1", "f2"]) as Set<import("@/types/onboarding").FFrame>,
      createdAt: 1700000000000,
      lastVisitedAt: 1700000001000,
    } as EntitySession);

    const viewerHistory: ViewerEvent[] = [
      {
        id: "e1",
        timestamp: 1700000000500,
        entityKey: "sample:utility" as EntityKey,
        action: "opened",
        source: "user",
        detail: { foo: "bar" },
      },
    ];

    const session = makeSession({
      messages: [
        { id: "m1", role: "user", content: "hi", timestamp: 1700000000100 },
        { id: "m2", role: "assistant", content: "hello", timestamp: 1700000000200 },
      ],
      entities,
      activeEntityKey: "sample:utility" as EntityKey,
      viewerHistory,
    });

    const payload = serializeChatPayload(makeStoreState([session]), {
      anonymousUserId: "anon-abc",
      onboardingSessionId: "onb-1",
    });
    expect(payload.chatMessages).toHaveLength(2);
    expect(payload.chatMessages.map((m) => [m.turnIndex, m.role, m.content])).toEqual([
      [1, "user", "hi"],
      [2, "assistant", "hello"],
    ]);
    expect(payload.chatSessionEntities).toHaveLength(1);
    expect(payload.chatSessionEntities[0]).toMatchObject({
      chatSessionId: "c-1",
      entityKey: "sample:utility",
      lastFrame: "f2",
    });
    expect(JSON.parse(payload.chatSessionEntities[0].completedFramesJson)).toEqual(["f1", "f2"]);
    expect(payload.viewerEvents).toHaveLength(1);
    expect(payload.viewerEvents[0]).toMatchObject({
      id: "e1",
      chatSessionId: "c-1",
      action: "opened",
    });
    expect(JSON.parse(payload.viewerEvents[0].detailJson!)).toEqual({ foo: "bar" });
  });
});

describe("claimAnonymousChat", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("POSTs the payload to /api/chat-sessions/claim and returns the parsed result", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        claimedSessions: 1,
        claimedMessages: 2,
        claimedSummaries: 0,
        claimedEntities: 1,
        claimedViewerEvents: 3,
      }),
    });
    const result = await claimAnonymousChat({
      chatSessions: [],
      chatMessages: [],
      conversationSummaries: [],
      chatSessionEntities: [],
      viewerEvents: [],
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/chat-sessions/claim",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      }),
    );
    expect(result).toMatchObject({ claimedSessions: 1, claimedMessages: 2 });
  });

  it("throws with status + detail when the BFF returns non-2xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Sign-in required", code: "ANONYMOUS_SESSION" }),
    });
    try {
      await claimAnonymousChat({
        chatSessions: [],
        chatMessages: [],
        conversationSummaries: [],
        chatSessionEntities: [],
        viewerEvents: [],
      });
      throw new Error("should have thrown");
    } catch (error) {
      const e = error as Error & { status?: number; detail?: { code?: string } };
      expect(e.status).toBe(401);
      expect(e.detail?.code).toBe("ANONYMOUS_SESSION");
    }
  });
});
