import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import type { ChatMessageRecord, LlmClient } from "../types.js";

import type { CompressionPlan } from "./contextBundler.js";
import {
  buildSummaryPrompt,
  runCompression,
  summarizeChunk,
} from "./conversationCompressor.js";

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeMsg(id: string, sessionId: string, turn: number, role: ChatMessageRecord["role"], content: string): ChatMessageRecord {
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

describe("buildSummaryPrompt", () => {
  it("emits a system + user message pair with the role-stamped chunk", () => {
    const out = buildSummaryPrompt(
      [
        { role: "user", content: "what is RAG?" },
        { role: "assistant", content: "Retrieval-augmented generation." },
      ],
      null,
    );
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0].role).toBe("system");
    expect(out.messages[1].role).toBe("user");
    // The user content should role-stamp each turn.
    expect(out.messages[1].content).toMatch(/USER: what is RAG\?/);
    expect(out.messages[1].content).toMatch(/ASSISTANT: Retrieval-augmented/);
  });

  it("includes the prior summary when given so the chain can absorb it", () => {
    const out = buildSummaryPrompt(
      [{ role: "user", content: "next question" }],
      "Previously: the user asked about RAG basics.",
    );
    expect(out.messages[1].content).toMatch(/Prior summary/);
    expect(out.messages[1].content).toMatch(/Previously: the user asked/);
  });
});

describe("summarizeChunk", () => {
  it("returns the LLM-provided content and usage tokens", async () => {
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "  - user wants RAG\n  - assistant explained it  " } }],
          usage: { prompt_tokens: 123, completion_tokens: 17 },
          model: "test-model-id",
        }),
      ),
    };
    const result = await summarizeChunk(
      [
        { role: "user", content: "what is RAG?" },
        { role: "assistant", content: "Retrieval-augmented generation." },
      ],
      null,
      { llmClient, modelId: "test-model-id" },
    );
    expect(result.content).toBe("- user wants RAG\n  - assistant explained it");
    expect(result.tokensIn).toBe(123);
    expect(result.tokensOut).toBe(17);
    expect(result.model).toBe("test-model-id");
  });

  it("falls back to char-based token estimates when the provider omits usage", async () => {
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "summary text" } }],
          model: "test-model-id",
        }),
      ),
    };
    const result = await summarizeChunk(
      [{ role: "user", content: "hello" }],
      null,
      { llmClient, modelId: "test-model-id" },
    );
    expect(result.tokensIn).toBeGreaterThan(0);
    expect(result.tokensOut).toBeGreaterThan(0);
  });

  it("throws when the LLM returns non-OK", async () => {
    const llmClient: LlmClient = {
      forward: vi.fn(async () => new Response("server is down", { status: 503 })),
    };
    await expect(
      summarizeChunk(
        [{ role: "user", content: "x" }],
        null,
        { llmClient, modelId: "test-model-id" },
      ),
    ).rejects.toThrow(/503/);
  });

  it("throws when the LLM payload has no content", async () => {
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonResponse({ choices: [{ message: {} }] })),
    };
    await expect(
      summarizeChunk(
        [{ role: "user", content: "x" }],
        null,
        { llmClient, modelId: "test-model-id" },
      ),
    ).rejects.toThrow(/no content/i);
  });
});

describe("runCompression — Phase J orchestration", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;

  beforeEach(() => {
    repo = new MemoryAppRepository();
    llmClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "summary body" } }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
          model: "test-model-id",
        }),
      ),
    };
  });

  it("writes the summary record, marks absorbed messages compressed, and returns the count", async () => {
    await repo.appendChatMessage(makeMsg("m1", "chat-1", 1, "user", "hello"));
    await repo.appendChatMessage(makeMsg("m2", "chat-1", 2, "assistant", "hi"));
    await repo.appendChatMessage(makeMsg("m3", "chat-1", 3, "user", "next"));

    const plan: CompressionPlan = {
      fromMessageId: "m1",
      toMessageId: "m2",
      messageIds: ["m1", "m2"],
      absorbedSummaryIds: [],
    };

    const result = await runCompression("chat-1", plan, {
      llmClient,
      modelId: "test-model-id",
      repo,
      idGen: () => "summary-fixed-id",
    });

    expect(result.absorbedMessageCount).toBe(2);
    expect(result.summary.id).toBe("summary-fixed-id");
    expect(result.summary.content).toBe("summary body");
    expect(result.summary.generation).toBe(0);
    expect(result.summary.absorbedSummaryIdsJson).toBe("[]");

    // Summary persisted.
    const summaries = await repo.listConversationSummaries("chat-1");
    expect(summaries.map((s) => s.id)).toEqual(["summary-fixed-id"]);

    // Messages flagged compressed (m1, m2) — m3 stays in live tail.
    const messages = await repo.listChatMessages("chat-1");
    const byId = new Map(messages.map((m) => [m.id, m]));
    expect(byId.get("m1")?.compressedIntoSummaryId).toBe("summary-fixed-id");
    expect(byId.get("m2")?.compressedIntoSummaryId).toBe("summary-fixed-id");
    expect(byId.get("m3")?.compressedIntoSummaryId).toBeNull();
  });

  it("chains generations: a second compression absorbs the prior summary", async () => {
    // First pass: m1, m2 compressed into S0 (generation 0).
    await repo.appendChatMessage(makeMsg("m1", "chat-1", 1, "user", "first"));
    await repo.appendChatMessage(makeMsg("m2", "chat-1", 2, "assistant", "second"));
    await repo.appendChatMessage(makeMsg("m3", "chat-1", 3, "user", "third"));
    await repo.appendChatMessage(makeMsg("m4", "chat-1", 4, "assistant", "fourth"));

    let idCounter = 0;
    const idGen = () => `summary-${idCounter++}`;

    await runCompression(
      "chat-1",
      {
        fromMessageId: "m1",
        toMessageId: "m2",
        messageIds: ["m1", "m2"],
        absorbedSummaryIds: [],
      },
      { llmClient, modelId: "test-model-id", repo, idGen },
    );

    // Second pass: m3, m4 compressed into S1 that ABSORBS S0.
    const result = await runCompression(
      "chat-1",
      {
        fromMessageId: "m3",
        toMessageId: "m4",
        messageIds: ["m3", "m4"],
        absorbedSummaryIds: ["summary-0"],
      },
      { llmClient, modelId: "test-model-id", repo, idGen },
    );

    expect(result.summary.id).toBe("summary-1");
    expect(result.summary.generation).toBe(1);
    expect(JSON.parse(result.summary.absorbedSummaryIdsJson)).toEqual(["summary-0"]);
  });

  it("rejects a plan with fewer than two message ids (nothing to compress)", async () => {
    await expect(
      runCompression(
        "chat-1",
        {
          fromMessageId: "m1",
          toMessageId: "m1",
          messageIds: ["m1"],
          absorbedSummaryIds: [],
        },
        { llmClient, modelId: "test-model-id", repo },
      ),
    ).rejects.toThrow(/at least two/i);
  });

  it("throws if the plan references message ids not present in the repo", async () => {
    await repo.appendChatMessage(makeMsg("m1", "chat-1", 1, "user", "x"));
    await expect(
      runCompression(
        "chat-1",
        {
          fromMessageId: "m1",
          toMessageId: "m999",
          messageIds: ["m1", "m999"],
          absorbedSummaryIds: [],
        },
        { llmClient, modelId: "test-model-id", repo },
      ),
    ).rejects.toThrow(/plan referenced 2 messages but repo had 1/);
  });
});
