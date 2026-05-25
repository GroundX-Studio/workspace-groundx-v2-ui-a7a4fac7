import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import type {
  ChatMessageRecord,
  ChatSessionRecord,
  GroundXClient,
  LlmClient,
} from "../types.js";

import { ChatHandlerError, handleChatMessage } from "./chatHandler.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeSession(overrides: Partial<ChatSessionRecord> = {}): ChatSessionRecord {
  const now = new Date();
  return {
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
    ...overrides,
  };
}

function makeMessage(
  id: string,
  sessionId: string,
  turn: number,
  role: ChatMessageRecord["role"],
  content: string,
): ChatMessageRecord {
  return {
    id,
    chatSessionId: sessionId,
    turnIndex: turn,
    role,
    content,
    citationsJson: null,
    toolCallsJson: null,
    attachmentsJson: null,
    compressedIntoSummaryId: null,
    llmProvider: null,
    llmModelId: null,
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    errorCode: null,
    createdAt: new Date(),
  };
}

describe("handleChatMessage — validation", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;

  beforeEach(() => {
    repo = new MemoryAppRepository();
    llmClient = { forward: vi.fn(async () => jsonResponse({})) };
    groundxClient = { forward: vi.fn(async () => jsonResponse({})) };
  });

  it("throws ChatHandlerError(400) when chatSessionId is empty", async () => {
    await expect(
      handleChatMessage(
        { chatSessionId: "", newUserMessage: "hi" },
        {
          repository: repo,
          llmClient,
          groundxClient,
          groundxApiKey: null,
          samplesBucketId: null,
          llmModelId: "test-model",
          mockMode: true,
        },
      ),
    ).rejects.toMatchObject({
      name: "ChatHandlerError",
      statusCode: 400,
    });
  });

  it("throws ChatHandlerError(400) when newUserMessage is whitespace only", async () => {
    await expect(
      handleChatMessage(
        { chatSessionId: "chat-1", newUserMessage: "   " },
        {
          repository: repo,
          llmClient,
          groundxClient,
          groundxApiKey: null,
          samplesBucketId: null,
          llmModelId: "test-model",
          mockMode: true,
        },
      ),
    ).rejects.toThrow(/non-empty/);
  });

  it("throws ChatHandlerError(400) when newUserMessage exceeds 8000 chars", async () => {
    await expect(
      handleChatMessage(
        { chatSessionId: "chat-1", newUserMessage: "x".repeat(8001) },
        {
          repository: repo,
          llmClient,
          groundxClient,
          groundxApiKey: null,
          samplesBucketId: null,
          llmModelId: "test-model",
          mockMode: true,
        },
      ),
    ).rejects.toThrow(/8000/);
  });

  it("throws ChatHandlerError(404) when the chat session does not exist", async () => {
    await expect(
      handleChatMessage(
        { chatSessionId: "missing", newUserMessage: "hello" },
        {
          repository: repo,
          llmClient,
          groundxClient,
          groundxApiKey: null,
          samplesBucketId: null,
          llmModelId: "test-model",
          mockMode: true,
        },
      ),
    ).rejects.toMatchObject({
      name: "ChatHandlerError",
      statusCode: 404,
    });
  });
});

describe("handleChatMessage — mock mode happy path", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    await repo.upsertChatSession(makeSession());
    llmClient = { forward: vi.fn(async () => jsonResponse({})) };
    groundxClient = { forward: vi.fn(async () => jsonResponse({})) };
  });

  it("persists the user message, then a mock assistant reply, and returns ids", async () => {
    let counter = 0;
    const idGen = () => `id-${counter++}`;

    const result = await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "What is RAG?" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: null,
        samplesBucketId: null,
        llmModelId: "test-model",
        mockMode: true,
        idGen,
      },
    );

    expect(result.userMessageId).toBe("id-0");
    expect(result.assistantMessageId).toBe("id-1");
    expect(result.compressionRan).toBe(false);
    expect(result.reply.mode).toBe("rag");
    expect(result.reply.answer).toMatch(/Mock RAG/);

    const messages = await repo.listChatMessages("chat-1");
    expect(messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))).toEqual([
      { id: "id-0", role: "user", content: "What is RAG?" },
      { id: "id-1", role: "assistant", content: result.reply.answer },
    ]);

    const assistant = messages[1];
    expect(assistant.llmProvider).toBe("mock");
    expect(assistant.llmModelId).toBe("test-model");
    expect(assistant.latencyMs).toBeGreaterThanOrEqual(0);
    expect(assistant.errorCode).toBeNull();
    // Mock RAG embeds a single citation.
    expect(assistant.citationsJson).not.toBeNull();
  });

  it("does not call the LLM or GroundX client when mockMode is true", async () => {
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "What is RAG?" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: null,
        samplesBucketId: null,
        llmModelId: "test-model",
        mockMode: true,
      },
    );
    expect(llmClient.forward).not.toHaveBeenCalled();
    expect(groundxClient.forward).not.toHaveBeenCalled();
  });
});

describe("handleChatMessage — compression pre-flight", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    await repo.upsertChatSession(makeSession());
    // Pre-seed the live tail with two messages so planCompression has
    // something to fold — handler appends the new user message third.
    await repo.appendChatMessage(makeMessage("m1", "chat-1", 1, "user", "first turn content " + "x".repeat(400)));
    await repo.appendChatMessage(makeMessage("m2", "chat-1", 2, "assistant", "second turn content " + "x".repeat(400)));
    llmClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "compressed summary body" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      ),
    };
    groundxClient = { forward: vi.fn(async () => jsonResponse({})) };
  });

  it("runs compression when the bundle exceeds 70% of contextWindowTokens", async () => {
    let counter = 0;
    const idGen = () => `id-${counter++}`;

    const result = await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "next turn" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: null,
        samplesBucketId: null,
        llmModelId: "test-model",
        compressionModelId: "compress-model",
        mockMode: true,
        // Tiny window so the seeded ~200 tokens easily exceed 70%.
        contextWindowTokens: 100,
        idGen,
      },
    );

    expect(result.compressionRan).toBe(true);

    // A summary was written via the LLM client.
    expect(llmClient.forward).toHaveBeenCalledTimes(1);
    const summaries = await repo.listConversationSummaries("chat-1");
    expect(summaries).toHaveLength(1);
    expect(summaries[0].content).toBe("compressed summary body");

    // The compressed messages got flagged.
    const messages = await repo.listChatMessages("chat-1");
    const byId = new Map(messages.map((m) => [m.id, m]));
    expect(byId.get("m1")?.compressedIntoSummaryId).toBe(summaries[0].id);
  });

  it("skips compression when the bundle is well under the window", async () => {
    const result = await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "tiny" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: null,
        samplesBucketId: null,
        llmModelId: "test-model",
        mockMode: true,
        contextWindowTokens: 1_000_000,
      },
    );
    expect(result.compressionRan).toBe(false);
    expect(llmClient.forward).not.toHaveBeenCalled();
  });
});

describe("handleChatMessage — router failure", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    await repo.upsertChatSession(makeSession());
    // Live mode + RAG path → llm client gets called. Make it fail.
    llmClient = {
      forward: vi.fn(async () => new Response("boom", { status: 503 })),
    };
    // GroundX returns results so we reach the LLM call (which then fails).
    groundxClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          search: { results: [{ documentId: "doc-1", pageNumber: 1, text: "snippet" }] },
        }),
      ),
    };
  });

  it("records an errored assistant message and rethrows ChatHandlerError(502)", async () => {
    await expect(
      handleChatMessage(
        { chatSessionId: "chat-1", newUserMessage: "What is RAG?" },
        {
          repository: repo,
          llmClient,
          groundxClient,
          groundxApiKey: "test-api-key",
          samplesBucketId: 7,
          llmModelId: "test-model",
          mockMode: false,
        },
      ),
    ).rejects.toMatchObject({
      name: "ChatHandlerError",
      statusCode: 502,
    });

    // Both messages persisted (user + errored assistant placeholder).
    const messages = await repo.listChatMessages("chat-1");
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].errorCode).toBeTruthy();
    expect(messages[1].latencyMs).toBeGreaterThanOrEqual(0);
    expect(messages[1].content).toBe("");
  });
});

describe("ChatHandlerError", () => {
  it("preserves statusCode on the thrown instance", () => {
    const err = new ChatHandlerError("nope", 418);
    expect(err.statusCode).toBe(418);
    expect(err.message).toBe("nope");
    expect(err.name).toBe("ChatHandlerError");
  });
});

describe("handleChatMessage — typed error mapping", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    await repo.upsertChatSession(makeSession());
    llmClient = { forward: vi.fn(async () => jsonResponse({})) };
    groundxClient = { forward: vi.fn(async () => jsonResponse({})) };
  });

  it("handles a structured query end-to-end with a frank reply (no 501 once handler is wired)", async () => {
    // P0 #3: structured mode now runs live via the structuredHandler.
    // The "saved schemas" sub-query is one of the kinds whose data
    // reader isn't built yet; the framework returns a frank "needs
    // reader" reply rather than 501-ing the whole request. That's
    // the intentional behavior — the surface stays useful and the
    // shortfall is visible to the user instead of hidden behind an
    // error.
    const result = await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "what are my saved schemas?" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: null,
        llmModelId: "test-model",
        mockMode: false,
      },
    );
    expect(result.reply.mode).toBe("structured");
    expect(result.reply.answer).toMatch(/saved schemas/i);
    // Both messages persisted normally — no 501, no errored placeholder.
    const messages = await repo.listChatMessages("chat-1");
    expect(messages).toHaveLength(2);
    expect(messages[1].errorCode).toBeNull();
  });

  it("maps UpstreamTimeoutError to ChatHandlerError(504)", async () => {
    const { UpstreamTimeoutError } = await import("./http.js");
    // Force the LLM client to throw a timeout. RAG mode runs grounded
    // LLM call → that throws → chatHandler catches → 504.
    const timeoutClient: LlmClient = {
      forward: vi.fn(async () => {
        throw new UpstreamTimeoutError("llm", 30_000);
      }),
    };
    const groundxOk: GroundXClient = {
      forward: vi.fn(async () =>
        jsonResponse({ search: { results: [{ documentId: "d", pageNumber: 1, text: "x" }] } }),
      ),
    };
    await expect(
      handleChatMessage(
        { chatSessionId: "chat-1", newUserMessage: "what is the total?" },
        {
          repository: repo,
          llmClient: timeoutClient,
          groundxClient: groundxOk,
          groundxApiKey: "k",
          samplesBucketId: 7,
          llmModelId: "test-model",
          mockMode: false,
        },
      ),
    ).rejects.toMatchObject({
      name: "ChatHandlerError",
      statusCode: 504,
    });
  });
});
