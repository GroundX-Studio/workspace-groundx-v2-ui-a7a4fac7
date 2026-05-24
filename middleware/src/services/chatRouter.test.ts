import { describe, expect, it, vi } from "vitest";

import type { LlmClient } from "../types.js";

import { classifyChatMode, routeChat, type ChatRouterRequest } from "./chatRouter.js";

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

  it("live mode throws a stable error until the wiring track lands", async () => {
    await expect(
      routeChat(makeRequest({ newUserMessage: "what is the total amount due?" }), {
        llmClient: fakeLlm,
        mockMode: false,
      }),
    ).rejects.toThrow(/not yet wired/);
  });
});
