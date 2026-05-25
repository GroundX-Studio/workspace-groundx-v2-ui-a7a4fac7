import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroundXClient, LlmClient } from "../types.js";

import { classifyChatMode, routeChat, searchGroundX, type ChatRouterRequest } from "./chatRouter.js";

function makeRequest(overrides: Partial<ChatRouterRequest> = {}): ChatRouterRequest {
  return {
    newUserMessage: "",
    currentEntityKey: null,
    conversationTail: { messageCount: 0, lastTurnContent: null },
    recentViewerEvents: [],
    intent: null,
    ...overrides,
  };
}

const fakeLlm: LlmClient = {
  forward: vi.fn(),
};

describe("classifyChatMode", () => {
  it("returns rag for extract / chat.sources / understand intents", () => {
    expect(classifyChatMode(makeRequest({ intent: "extract.field-hovered" }))).toBe("rag");
    expect(classifyChatMode(makeRequest({ intent: "chat.sources" }))).toBe("rag");
    expect(classifyChatMode(makeRequest({ intent: "understand" }))).toBe("rag");
  });

  it("returns hybrid for smart.report and explain.sample intents", () => {
    expect(classifyChatMode(makeRequest({ intent: "smart.report" }))).toBe("hybrid");
    expect(classifyChatMode(makeRequest({ intent: "explain.sample" }))).toBe("hybrid");
  });

  it("returns structured for app-state pattern matches", () => {
    expect(classifyChatMode(makeRequest({ newUserMessage: "what saved schemas do I have?" }))).toBe("structured");
    expect(classifyChatMode(makeRequest({ newUserMessage: "how many pages remaining on my plan?" }))).toBe("structured");
    expect(classifyChatMode(makeRequest({ newUserMessage: "Show me my API key" }))).toBe("structured");
  });

  it("returns hybrid for open-ended exploratory patterns", () => {
    expect(classifyChatMode(makeRequest({ newUserMessage: "explain this sample please" }))).toBe("hybrid");
    expect(classifyChatMode(makeRequest({ newUserMessage: "what can I do here?" }))).toBe("hybrid");
  });

  it("defaults to rag for everything else", () => {
    expect(classifyChatMode(makeRequest({ newUserMessage: "what is the total amount due?" }))).toBe("rag");
  });
});

describe("routeChat", () => {
  it("MOCK_MODE returns a canned rag envelope with a citation", async () => {
    const res = await routeChat(
      makeRequest({ newUserMessage: "what is the total amount due?", currentEntityKey: "sample:utility" }),
      { llmClient: fakeLlm, mockMode: true },
    );
    expect(res.mode).toBe("rag");
    expect(res.answer.toLowerCase()).toContain("mock");
    expect(res.citations).toHaveLength(1);
    expect(res.suggestedActions.length).toBeGreaterThan(0);
  });

  it("MOCK_MODE returns a canned structured envelope (no citations)", async () => {
    const res = await routeChat(
      makeRequest({ newUserMessage: "how many pages remaining on my plan?" }),
      { llmClient: fakeLlm, mockMode: true },
    );
    expect(res.mode).toBe("structured");
    expect(res.citations).toHaveLength(0);
  });

  it("MOCK_MODE returns a canned hybrid envelope with two suggested actions", async () => {
    const res = await routeChat(
      makeRequest({ newUserMessage: "explain this sample", currentEntityKey: "sample:utility" }),
      { llmClient: fakeLlm, mockMode: true },
    );
    expect(res.mode).toBe("hybrid");
    expect(res.suggestedActions.length).toBeGreaterThanOrEqual(2);
  });

  it("live RAG mode requires GroundX client + api key (live wiring)", async () => {
    // Now that live RAG is wired, the failure mode shifts from "not yet
    // wired" to a typed configuration error when deps are missing.
    await expect(
      routeChat(makeRequest({ newUserMessage: "what is the total amount due?" }), {
        llmClient: fakeLlm,
        mockMode: false,
      }),
    ).rejects.toThrow(/groundxClient/);
  });

  it("non-MOCK structured mode throws when repository/chatSessionId aren't supplied (chatHandler is the right wiring point)", async () => {
    const { ChatRouteNotImplementedError } = await import("./chatRouter.js");
    await expect(
      routeChat(makeRequest({ newUserMessage: "what are my saved schemas?" }), {
        llmClient: fakeLlm,
        mockMode: false,
        // No repository or chatSessionId → routeChat doesn't have the
        // deps it needs to run the structured handler.
      }),
    ).rejects.toBeInstanceOf(ChatRouteNotImplementedError);
  });

  it("non-MOCK structured mode returns a frank reply when repository + chatSessionId are supplied", async () => {
    const { MemoryAppRepository } = await import("../db/memoryRepository.js");
    const repo = new MemoryAppRepository();
    // Pre-create a session so the onboarding-state sub-handler returns
    // real data rather than the "row not found" frank reply.
    const now = new Date();
    await repo.upsertChatSession({
      id: "chat-1",
      onboardingSessionId: "onb-1",
      ownerUserId: null,
      ownerAnonId: "anon-1",
      title: "Onboarding",
      isOnboarding: true,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    const reply = await routeChat(makeRequest({ newUserMessage: "pages remaining on my plan?" }), {
      llmClient: fakeLlm,
      mockMode: false,
      repository: repo,
      chatSessionId: "chat-1",
      byoPagesLimit: 100,
    });
    expect(reply.mode).toBe("structured");
    expect(reply.answer).toMatch(/100 pages/);
  });

  it("non-MOCK hybrid mode returns a tour-style reply with snippet citations when RAG is configured", async () => {
    const { MemoryAppRepository } = await import("../db/memoryRepository.js");
    const repo = new MemoryAppRepository();
    const now = new Date();
    await repo.upsertChatSession({
      id: "chat-1",
      onboardingSessionId: "onb-1",
      ownerUserId: null,
      ownerAnonId: "anon-1",
      title: "Onboarding",
      isOnboarding: true,
      activeEntityKey: "sample:utility",
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    await repo.upsertChatSessionEntity({
      chatSessionId: "chat-1",
      entityKey: "sample:utility",
      lastFrame: "f2",
      completedFramesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      createdAt: now,
      lastVisitedAt: now,
    });
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        new Response(
          JSON.stringify({
            search: { results: [{ documentId: "d-1", pageNumber: 3, text: "hybrid snippet" }] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    };
    const reply = await routeChat(makeRequest({ newUserMessage: "explain this sample" }), {
      llmClient: fakeLlm,
      mockMode: false,
      repository: repo,
      chatSessionId: "chat-1",
      groundxClient,
      groundxApiKey: "k",
      searchBucketId: 28454,
      byoPagesLimit: 100,
    });
    expect(reply.mode).toBe("hybrid");
    expect(reply.answer).toMatch(/sample:utility/);
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0].documentId).toBe("d-1");
  });
});

describe("searchGroundX (ContentScope dispatch)", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  function spyClient() {
    const calls: Array<{ path: string; body: unknown; apiKey: string }> = [];
    const client: GroundXClient = {
      forward: vi.fn(async (path: string, init: RequestInit & { apiKey: string }) => {
        const parsed = init.body ? JSON.parse(init.body as string) : null;
        calls.push({ path, body: parsed, apiKey: init.apiKey });
        return jsonOk({ search: { results: [] } });
      }),
    };
    return { client, calls };
  }

  afterEach(() => {
    vi.restoreAllMocks();
    // Quiet the warn-on-unknown-scope log so test output stays clean.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("bucket scope (no projectIds) → POST /v1/search/{bucketId} with no filter", async () => {
    const { client, calls } = spyClient();
    await searchGroundX("hello", { kind: "bucket", bucketId: 42 }, client, "k");
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe("/v1/search/42");
    expect(calls[0].body).toEqual({ query: "hello", n: 6 });
    expect(calls[0].apiKey).toBe("k");
  });

  it("bucket scope with ONE project id → adds filter: { projectId: P }", async () => {
    const { client, calls } = spyClient();
    await searchGroundX("hello", { kind: "bucket", bucketId: 42, projectIds: ["proj-A"] }, client, "k");
    expect(calls[0].path).toBe("/v1/search/42");
    expect(calls[0].body).toEqual({
      query: "hello",
      n: 6,
      filter: { projectId: "proj-A" },
    });
  });

  it("bucket scope with N project ids → adds filter: { projectId: { $in: [...] } }", async () => {
    const { client, calls } = spyClient();
    await searchGroundX(
      "hello",
      { kind: "bucket", bucketId: 42, projectIds: ["A", "B", "C"] },
      client,
      "k",
    );
    expect(calls[0].body).toEqual({
      query: "hello",
      n: 6,
      filter: { projectId: { $in: ["A", "B", "C"] } },
    });
  });

  it("group scope → POST /v1/search/{groupId} with no filter", async () => {
    const { client, calls } = spyClient();
    await searchGroundX("hello", { kind: "group", groupId: 99 }, client, "k");
    expect(calls[0].path).toBe("/v1/search/99");
    expect(calls[0].body).toEqual({ query: "hello", n: 6 });
  });

  it("documents scope → POST /v1/search/documents + documentIds in body", async () => {
    const { client, calls } = spyClient();
    await searchGroundX("hello", { kind: "documents", documentIds: ["d1", "d2"] }, client, "k");
    expect(calls[0].path).toBe("/v1/search/documents");
    expect(calls[0].body).toEqual({
      query: "hello",
      n: 6,
      documentIds: ["d1", "d2"],
    });
  });

  it("documents scope with empty documentIds throws (programming bug guard)", async () => {
    const { client } = spyClient();
    await expect(
      searchGroundX("hello", { kind: "documents", documentIds: [] }, client, "k"),
    ).rejects.toThrow(/at least one documentId/i);
  });

  it("unknown scope → legacy fallback to /v1/search/documents + console.warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, calls } = spyClient();
    await searchGroundX("hello", { kind: "unknown" }, client, "k");
    expect(calls[0].path).toBe("/v1/search/documents");
    expect(calls[0].body).toEqual({ query: "hello", n: 6 });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/kind=unknown/));
  });
});
