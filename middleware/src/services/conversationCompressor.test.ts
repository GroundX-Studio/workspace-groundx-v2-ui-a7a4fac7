import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import type { ChatMessageRecord, ConversationSummaryRecord, LlmClient } from "../types.js";

import type { CompressionPlan } from "./contextBundler.js";
import {
  buildMetaSummaryPrompt,
  buildSummaryPrompt,
  runCompression,
  runMetaCompaction,
  selectActiveSummaries,
  summarizeChunk,
  summarizeSummaries,
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

describe("buildSummaryPrompt (leaf)", () => {
  it("emits a system + user message pair with the role-stamped chunk and NO prior-summary splice", () => {
    const out = buildSummaryPrompt([
      { role: "user", content: "what is RAG?" },
      { role: "assistant", content: "Retrieval-augmented generation." },
    ]);
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0].role).toBe("system");
    expect(out.messages[1].role).toBe("user");
    expect(out.messages[1].content).toMatch(/USER: what is RAG\?/);
    expect(out.messages[1].content).toMatch(/ASSISTANT: Retrieval-augmented/);
    // Critical leaf invariant: nothing about a "prior summary" makes
    // it into the LLM call. That's what keeps leaf summaries
    // independent and avoids telephone-game decay.
    expect(out.messages[1].content).not.toMatch(/[Pp]rior summary/);
  });
});

describe("buildMetaSummaryPrompt (meta-compaction)", () => {
  it("emits a system + user message with the summaries oldest-first", () => {
    const out = buildMetaSummaryPrompt([
      { content: "S1 covers messages 1-10" },
      { content: "S2 covers messages 11-20" },
      { content: "S3 covers messages 21-30" },
    ]);
    expect(out.messages).toHaveLength(2);
    expect(out.messages[0].content).toMatch(/merging older conversation summaries/i);
    expect(out.messages[1].content).toMatch(/Summary 1[\s\S]*S1 covers/);
    expect(out.messages[1].content).toMatch(/Summary 2[\s\S]*S2 covers/);
    expect(out.messages[1].content).toMatch(/Summary 3[\s\S]*S3 covers/);
  });
});

describe("summarizeChunk (leaf LLM call)", () => {
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
        jsonResponse({ choices: [{ message: { content: "summary text" } }], model: "test-model-id" }),
      ),
    };
    const result = await summarizeChunk(
      [{ role: "user", content: "hello" }],
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
      summarizeChunk([{ role: "user", content: "x" }], { llmClient, modelId: "test-model-id" }),
    ).rejects.toThrow(/503/);
  });

  it("throws when the LLM payload has no content", async () => {
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonResponse({ choices: [{ message: {} }] })),
    };
    await expect(
      summarizeChunk([{ role: "user", content: "x" }], { llmClient, modelId: "test-model-id" }),
    ).rejects.toThrow(/no content/i);
  });
});

describe("summarizeSummaries (meta LLM call)", () => {
  it("rejects fewer than 2 summaries to merge", async () => {
    const llmClient: LlmClient = { forward: vi.fn(async () => jsonResponse({})) };
    await expect(
      summarizeSummaries([{ content: "only-one" }], { llmClient, modelId: "m" }),
    ).rejects.toThrow(/at least two/i);
  });

  it("calls the LLM with the meta prompt and returns its content", async () => {
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "merged super-summary" } }],
          usage: { prompt_tokens: 200, completion_tokens: 30 },
          model: "m",
        }),
      ),
    };
    const result = await summarizeSummaries(
      [{ content: "S1" }, { content: "S2" }, { content: "S3" }],
      { llmClient, modelId: "m" },
    );
    expect(result.content).toBe("merged super-summary");
    // The body sent to the LLM should include the meta system prompt
    // ("merging older conversation summaries").
    const body = JSON.parse((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages[0].content).toMatch(/merging older conversation summaries/i);
  });
});

describe("selectActiveSummaries (active-set filter)", () => {
  function makeSummary(
    id: string,
    createdAt: Date,
    generation = 0,
    absorbedIds: string[] = [],
  ): ConversationSummaryRecord {
    return {
      id,
      chatSessionId: "chat-1",
      fromMessageId: "x",
      toMessageId: "y",
      generation,
      absorbedSummaryIdsJson: JSON.stringify(absorbedIds),
      content: `${id} content`,
      model: "m",
      tokensIn: 0,
      tokensOut: 0,
      createdAt,
    };
  }

  it("returns all summaries when none absorb any other (all leaves)", () => {
    const s = [
      makeSummary("a", new Date(1000)),
      makeSummary("b", new Date(2000)),
      makeSummary("c", new Date(3000)),
    ];
    const active = selectActiveSummaries(s);
    expect(active.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("filters out summaries absorbed by another (and orders chronologically)", () => {
    const s = [
      makeSummary("a", new Date(1000)),
      makeSummary("b", new Date(2000)),
      makeSummary("c", new Date(3000)),
      // d is a meta-summary that absorbed a + b. b is excluded.
      // a is also excluded. c stays. d is active.
      makeSummary("d", new Date(4000), 1, ["a", "b"]),
    ];
    const active = selectActiveSummaries(s);
    expect(active.map((x) => x.id)).toEqual(["c", "d"]);
  });

  it("ignores malformed absorbedSummaryIdsJson and keeps the candidate active", () => {
    const broken: ConversationSummaryRecord = {
      id: "bad",
      chatSessionId: "chat-1",
      fromMessageId: "x",
      toMessageId: "y",
      generation: 0,
      absorbedSummaryIdsJson: "{not json[",
      content: "bad",
      model: "m",
      tokensIn: 0,
      tokensOut: 0,
      createdAt: new Date(),
    };
    const active = selectActiveSummaries([broken]);
    expect(active.map((x) => x.id)).toEqual(["bad"]);
  });
});

describe("runCompression (level 1 — leaf compaction)", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;

  beforeEach(() => {
    repo = new MemoryAppRepository();
    llmClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "leaf summary body" } }],
          usage: { prompt_tokens: 50, completion_tokens: 20 },
          model: "m",
        }),
      ),
    };
  });

  it("writes a leaf summary with generation=0 + absorbedSummaryIds=[] regardless of plan input", async () => {
    await repo.appendChatMessage(makeMsg("m1", "chat-1", 1, "user", "hi"));
    await repo.appendChatMessage(makeMsg("m2", "chat-1", 2, "assistant", "yo"));
    await repo.appendChatMessage(makeMsg("m3", "chat-1", 3, "user", "next"));

    const plan: CompressionPlan = {
      fromMessageId: "m1",
      toMessageId: "m2",
      messageIds: ["m1", "m2"],
      // Even if a caller (old planCompression caller) passes this, leaf
      // compaction must IGNORE it. That's the bug fix.
      absorbedSummaryIds: ["should-be-ignored"],
    };

    const result = await runCompression("chat-1", plan, {
      llmClient,
      modelId: "m",
      repo,
      idGen: () => "summary-fixed-id",
    });

    expect(result.absorbedMessageCount).toBe(2);
    expect(result.summary.id).toBe("summary-fixed-id");
    expect(result.summary.generation).toBe(0);
    expect(result.summary.absorbedSummaryIdsJson).toBe("[]");

    // Critical: the LLM call must NOT have included any prior-summary
    // text. Inspect the request body.
    const call = (llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.messages[1].content).not.toMatch(/[Pp]rior summary/);

    // Messages flagged compressed.
    const messages = await repo.listChatMessages("chat-1");
    expect(messages.find((m) => m.id === "m1")?.compressedIntoSummaryId).toBe("summary-fixed-id");
    expect(messages.find((m) => m.id === "m2")?.compressedIntoSummaryId).toBe("summary-fixed-id");
    expect(messages.find((m) => m.id === "m3")?.compressedIntoSummaryId).toBeNull();
  });

  it("multiple leaf runs produce INDEPENDENT summaries (no telephone-game decay)", async () => {
    // The user's pushback was: don't re-summarize the prior summary
    // every run; keep summaries leaf-level so old prose stays at
    // full fidelity. This test pins that invariant.
    for (let i = 1; i <= 6; i++) {
      await repo.appendChatMessage(makeMsg(`m${i}`, "chat-1", i, i % 2 === 0 ? "assistant" : "user", `turn ${i}`));
    }

    let idCounter = 0;
    const idGen = () => `s-${idCounter++}`;

    await runCompression(
      "chat-1",
      { fromMessageId: "m1", toMessageId: "m2", messageIds: ["m1", "m2"], absorbedSummaryIds: [] },
      { llmClient, modelId: "m", repo, idGen },
    );
    await runCompression(
      "chat-1",
      { fromMessageId: "m3", toMessageId: "m4", messageIds: ["m3", "m4"], absorbedSummaryIds: [] },
      { llmClient, modelId: "m", repo, idGen },
    );

    const summaries = await repo.listConversationSummaries("chat-1");
    // Both are level-0 leaves; neither absorbs the other.
    expect(summaries.every((s) => s.generation === 0)).toBe(true);
    expect(summaries.every((s) => s.absorbedSummaryIdsJson === "[]")).toBe(true);

    // Both LLM calls saw ONLY their own message range — no prior
    // summary was spliced in.
    const calls = (llmClient.forward as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      const body = JSON.parse(call[1].body);
      expect(body.messages[1].content).not.toMatch(/[Pp]rior summary/);
    }
  });

  it("rejects a plan with fewer than two message ids", async () => {
    await expect(
      runCompression(
        "chat-1",
        { fromMessageId: "m1", toMessageId: "m1", messageIds: ["m1"], absorbedSummaryIds: [] },
        { llmClient, modelId: "m", repo },
      ),
    ).rejects.toThrow(/at least two/i);
  });

  it("throws if the plan references message ids not present in the repo", async () => {
    await repo.appendChatMessage(makeMsg("m1", "chat-1", 1, "user", "x"));
    await expect(
      runCompression(
        "chat-1",
        { fromMessageId: "m1", toMessageId: "m999", messageIds: ["m1", "m999"], absorbedSummaryIds: [] },
        { llmClient, modelId: "m", repo },
      ),
    ).rejects.toThrow(/plan referenced 2 messages but repo had 1/);
  });
});

describe("runMetaCompaction (level 2 — fold older summaries)", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    llmClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "super-summary body" } }],
          usage: { prompt_tokens: 300, completion_tokens: 40 },
          model: "m",
        }),
      ),
    };

    // Seed 5 leaf summaries spanning messages 1-10.
    const baseDate = new Date(1700_000_000_000);
    for (let i = 0; i < 5; i++) {
      await repo.appendConversationSummary({
        id: `leaf-${i}`,
        chatSessionId: "chat-1",
        fromMessageId: `m${i * 2 + 1}`,
        toMessageId: `m${i * 2 + 2}`,
        generation: 0,
        absorbedSummaryIdsJson: "[]",
        content: `Leaf ${i} content`,
        model: "m",
        tokensIn: 50,
        tokensOut: 30,
        createdAt: new Date(baseDate.getTime() + i * 1000),
      });
    }
  });

  it("rejects fewer than 2 summary ids", async () => {
    await expect(
      runMetaCompaction("chat-1", ["leaf-0"], { llmClient, modelId: "m", repo }),
    ).rejects.toThrow(/at least two/i);
  });

  it("throws when a referenced summary id is missing from the repo", async () => {
    await expect(
      runMetaCompaction("chat-1", ["leaf-0", "nonexistent"], { llmClient, modelId: "m", repo }),
    ).rejects.toThrow(/not found/i);
  });

  it("writes a super-summary with generation = max(absorbed) + 1 and absorbedSummaryIds = batch", async () => {
    const result = await runMetaCompaction("chat-1", ["leaf-0", "leaf-1", "leaf-2"], {
      llmClient,
      modelId: "m",
      repo,
      idGen: () => "super-1",
    });

    expect(result.absorbedSummaryCount).toBe(3);
    expect(result.summary.id).toBe("super-1");
    // The absorbed leaves are all generation 0, so the super lands at 1.
    expect(result.summary.generation).toBe(1);
    expect(JSON.parse(result.summary.absorbedSummaryIdsJson)).toEqual(["leaf-0", "leaf-1", "leaf-2"]);
    // Message-id span = first absorbed's from..last absorbed's to.
    expect(result.summary.fromMessageId).toBe("m1");
    expect(result.summary.toMessageId).toBe("m6");
    // Persisted.
    const all = await repo.listConversationSummaries("chat-1");
    expect(all.map((s) => s.id)).toContain("super-1");
  });

  it("uses the meta prompt (not the leaf prompt) for the LLM call", async () => {
    await runMetaCompaction("chat-1", ["leaf-0", "leaf-1"], {
      llmClient,
      modelId: "m",
      repo,
      idGen: () => "super-1",
    });
    const body = JSON.parse((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.messages[0].content).toMatch(/merging older conversation summaries/i);
  });

  it("does NOT touch chat_messages — only the parent summaries table changes", async () => {
    // Seed a flagged message to prove it stays flagged.
    await repo.appendChatMessage(makeMsg("m1", "chat-1", 1, "user", "hi"));
    await repo.markChatMessagesCompressed(["m1"], "leaf-0");

    await runMetaCompaction("chat-1", ["leaf-0", "leaf-1"], {
      llmClient,
      modelId: "m",
      repo,
      idGen: () => "super-1",
    });

    const m1 = (await repo.listChatMessages("chat-1")).find((m) => m.id === "m1");
    // Still pointing at the LEAF that originally absorbed it. Meta-
    // compaction doesn't re-flag messages — selectActiveSummaries
    // handles the indirection at read time.
    expect(m1?.compressedIntoSummaryId).toBe("leaf-0");
  });
});
