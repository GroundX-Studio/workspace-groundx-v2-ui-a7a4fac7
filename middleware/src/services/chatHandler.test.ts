import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import { SAMPLE_PROJECT_ID } from "../db/seedSampleProject.js";
import type {
  ChatMessageRecord,
  ChatSessionEntityRecord,
  ChatSessionRecord,
  GroundXClient,
  LlmClient,
} from "../types.js";

import { ChatHandlerError, deriveRagContentScope, handleChatMessage } from "./chatHandler.js";
import { produceEntityScope } from "./entityScopeProducer.js";

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
        },
      ),
    ).rejects.toMatchObject({
      name: "ChatHandlerError",
      statusCode: 404,
    });
  });
});

describe("handleChatMessage — live RAG happy path (injected fakes at the seam)", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    await repo.upsertChatSession(makeSession());
    // GroundX returns one search hit; the LLM grounds an answer with a
    // verifiable citation block. This is the live RAG path with fakes injected
    // at the dependency seam (2026-06-01-retire-mock-mode — there is no mock
    // path; the former canned `chatMocks` reply is gone).
    groundxClient = {
      forward: vi.fn(async () =>
        jsonResponse({ search: { results: [{ documentId: "doc-1", pageNumber: 1, text: "RAG grounds answers in retrieved snippets." }] } }),
      ),
    };
    const llmAnswer = [
      "RAG grounds answers in retrieved snippets.",
      "",
      "```json",
      '{"citations":[{"documentId":"doc-1","page":1,"quote":"RAG grounds answers"}]}',
      "```",
    ].join("\n");
    llmClient = { forward: vi.fn(async () => jsonResponse({ choices: [{ message: { content: llmAnswer } }] })) };
  });

  it("persists the user message, then the live assistant reply, and returns ids", async () => {
    let counter = 0;
    const idGen = () => `id-${counter++}`;

    const result = await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "What is RAG?" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 28454,
        llmModelId: "test-model",
        idGen,
      },
    );

    expect(result.userMessageId).toBe("id-0");
    expect(result.assistantMessageId).toBe("id-1");
    expect(result.compressionRan).toBe(false);
    expect(result.reply.mode).toBe("rag");
    expect(result.reply.answer).toBe("RAG grounds answers in retrieved snippets.");

    const messages = await repo.listChatMessages("chat-1");
    expect(messages.map((m) => ({ id: m.id, role: m.role, content: m.content }))).toEqual([
      { id: "id-0", role: "user", content: "What is RAG?" },
      { id: "id-1", role: "assistant", content: result.reply.answer },
    ]);

    const assistant = messages[1];
    expect(assistant.llmProvider).toBe("live");
    expect(assistant.llmModelId).toBe("test-model");
    expect(assistant.latencyMs).toBeGreaterThanOrEqual(0);
    expect(assistant.errorCode).toBeNull();
    // The live grounded answer carries its verified citation.
    expect(assistant.citationsJson).not.toBeNull();
  });

  it("calls the live LLM + GroundX clients (no mock short-circuit)", async () => {
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "What is RAG?" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 28454,
        llmModelId: "test-model",
      },
    );
    expect(llmClient.forward).toHaveBeenCalled();
    expect(groundxClient.forward).toHaveBeenCalled();
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
    // The LLM fake serves BOTH the compression summary call AND the live RAG
    // turn (same canned body — the compression assertions key off the persisted
    // summary, not the call count). GroundX returns no search hits so the RAG
    // turn grounds an (un-cited) answer without extra setup.
    llmClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "compressed summary body" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      ),
    };
    groundxClient = { forward: vi.fn(async () => jsonResponse({ search: { results: [] } })) };
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
        groundxApiKey: "k",
        samplesBucketId: 28454,
        llmModelId: "test-model",
        compressionModelId: "compress-model",
        // Tiny window so the seeded ~200 tokens easily exceed 70%.
        contextWindowTokens: 100,
        idGen,
      },
    );

    expect(result.compressionRan).toBe(true);

    // A summary was written via the LLM client (the live RAG turn also calls the
    // LLM — the assertion keys off the persisted summary, not a call count).
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
        groundxApiKey: "k",
        samplesBucketId: 28454,
        llmModelId: "test-model",
        contextWindowTokens: 1_000_000,
      },
    );
    expect(result.compressionRan).toBe(false);
    // No compression summary was written (the live RAG turn still calls the LLM).
    const summaries = await repo.listConversationSummaries("chat-1");
    expect(summaries).toHaveLength(0);
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
        },
      ),
    ).rejects.toMatchObject({
      name: "ChatHandlerError",
      statusCode: 504,
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// EntitySession scope refs propagate into the RAG search call.
// Closure test: post a chat with entity having projectIds:[P1, P2] →
// search call body has filter: {projectId: {$in: [P1, P2]}}. Plus
// parallel cases for groupId, documentIds, and single-projectId.
// ────────────────────────────────────────────────────────────────────
describe("handleChatMessage — CF-15 EntitySession scope refs → RAG search", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;
  let groundxForward: ReturnType<typeof vi.fn>;

  async function seedSessionWithEntity(scopeRefs: {
    bucketId?: number | null;
    projectIdsJson?: string | null;
    groupId?: number | null;
    documentIdsJson?: string | null;
  }): Promise<void> {
    await repo.upsertChatSession(makeSession({ activeEntityKey: "sample:utility" }));
    await repo.upsertChatSessionEntity({
      chatSessionId: "chat-1",
      entityKey: "sample:utility",
      lastFrame: "f2",
      completedFramesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      bucketId: scopeRefs.bucketId ?? null,
      projectIdsJson: scopeRefs.projectIdsJson ?? null,
      groupId: scopeRefs.groupId ?? null,
      documentIdsJson: scopeRefs.documentIdsJson ?? null,
      createdAt: new Date(),
      lastVisitedAt: new Date(),
    });
  }

  beforeEach(() => {
    repo = new MemoryAppRepository();
    // Real chat-completion mock so callGroundedLlm doesn't blow up.
    llmClient = {
      forward: vi.fn(async () =>
        jsonResponse({ choices: [{ message: { content: "grounded answer" } }] }),
      ),
    };
    groundxForward = vi.fn(async () => jsonResponse({ search: { results: [] } }));
    groundxClient = { forward: groundxForward };
  });

  function lastSearchBody(): Record<string, unknown> {
    expect(groundxForward).toHaveBeenCalled();
    const lastCall = groundxForward.mock.calls.at(-1)!;
    const init = lastCall[1] as { body: string };
    return JSON.parse(init.body);
  }

  function lastSearchPath(): string {
    expect(groundxForward).toHaveBeenCalled();
    const lastCall = groundxForward.mock.calls.at(-1)!;
    return lastCall[0] as string;
  }

  it("EntitySession with projectIds:[P1,P2] → search body has filter: {projectId: {$in: [P1,P2]}}", async () => {
    await seedSessionWithEntity({
      bucketId: 42,
      projectIdsJson: JSON.stringify(["P1", "P2"]),
    });
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "What is the total?" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: null,
        llmModelId: "test-model",
      },
    );
    expect(lastSearchPath()).toBe("/search/42");
    expect(lastSearchBody()).toMatchObject({
      filter: { projectId: { $in: ["P1", "P2"] } },
    });
  });

  it("EntitySession with single projectId → search body has filter: {projectId: P1}", async () => {
    await seedSessionWithEntity({
      bucketId: 42,
      projectIdsJson: JSON.stringify(["solo"]),
    });
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "Q" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: null,
        llmModelId: "test-model",
      },
    );
    expect(lastSearchBody()).toMatchObject({ filter: { projectId: "solo" } });
  });

  it("EntitySession with bucketId override (no env bucket) → uses entity bucketId in path", async () => {
    await seedSessionWithEntity({ bucketId: 7 });
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "Q" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: 999, // env default — entity should win
        llmModelId: "test-model",
      },
    );
    expect(lastSearchPath()).toBe("/search/7");
  });

  it("EntitySession with groupId → search path /v1/search/{groupId}, no filter", async () => {
    await seedSessionWithEntity({ groupId: 99 });
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "Q" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: null,
        llmModelId: "test-model",
      },
    );
    expect(lastSearchPath()).toBe("/search/99");
    const body = lastSearchBody();
    expect(body.filter).toBeUndefined();
  });

  it("EntitySession with documentIds → search path /v1/search/documents + documentIds in body", async () => {
    await seedSessionWithEntity({
      documentIdsJson: JSON.stringify(["doc-A", "doc-B"]),
    });
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "Q" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: null,
        llmModelId: "test-model",
      },
    );
    expect(lastSearchPath()).toBe("/search/documents");
    expect(lastSearchBody()).toMatchObject({ documentIds: ["doc-A", "doc-B"] });
  });

  it("No EntitySession scope refs + samplesBucketId fallback → uses env bucket (legacy onboarding path)", async () => {
    // No entity scope refs at all — the env-provided samples bucket
    // should still drive the search. This is the unchanged onboarding
    // behavior; CF-15 must not regress it.
    await seedSessionWithEntity({});
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "Q" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: 100,
        llmModelId: "test-model",
      },
    );
    expect(lastSearchPath()).toBe("/search/100");
  });

  it("Malformed projectIdsJson (not JSON) → falls back to bucket scope without filter", async () => {
    await seedSessionWithEntity({
      bucketId: 5,
      projectIdsJson: "not-json-at-all",
    });
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "Q" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: null,
        llmModelId: "test-model",
      },
    );
    expect(lastSearchPath()).toBe("/search/5");
    const body = lastSearchBody();
    expect(body.filter).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// CF-03: rbacFilter end-to-end through chatHandler → routeChat → search.
// Closure gate:
//   "Post a chat with a session carrying a fake RBAC seam returns
//    search bodies with `$and: [rbacFilter, scopeFilter]`."
// ────────────────────────────────────────────────────────────────────
describe("handleChatMessage — CF-03 rbacFilter end-to-end", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;
  let groundxForward: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    llmClient = {
      forward: vi.fn(async () =>
        jsonResponse({ choices: [{ message: { content: "grounded answer" } }] }),
      ),
    };
    groundxForward = vi.fn(async () => jsonResponse({ search: { results: [] } }));
    groundxClient = { forward: groundxForward };
  });

  it("rbacFilter passed via deps composes with the entity-derived scope filter via $and", async () => {
    await repo.upsertChatSession(makeSession({ activeEntityKey: "sample:utility" }));
    await repo.upsertChatSessionEntity({
      chatSessionId: "chat-1",
      entityKey: "sample:utility",
      lastFrame: "f2",
      completedFramesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      bucketId: 42,
      projectIdsJson: JSON.stringify(["P1", "P2"]),
      groupId: null,
      documentIdsJson: null,
      createdAt: new Date(),
      lastVisitedAt: new Date(),
    });

    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "Q" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: null,
        llmModelId: "test-model",
        // The BFF-derived RBAC filter. Real production callers will
        // build this from session.groundxUsername → org/role; the
        // seam is the same.
        rbacFilter: { orgId: "org-X", clearance: { $in: ["public", "internal"] } },
      },
    );

    expect(groundxForward).toHaveBeenCalled();
    const init = groundxForward.mock.calls.at(-1)![1] as { body: string };
    const body = JSON.parse(init.body);
    // #7 key-aware merge: one clause per key (distinct keys → no intersection,
    // the multi-key rbac object splits into a clause each, each key once).
    expect(body.filter).toEqual({
      $and: [
        { orgId: "org-X" },
        { clearance: { $in: ["public", "internal"] } },
        { projectId: { $in: ["P1", "P2"] } },
      ],
    });
  });

  it("no rbacFilter in deps → search body has only the scope filter (back-compat)", async () => {
    await repo.upsertChatSession(makeSession({ activeEntityKey: "sample:utility" }));
    await repo.upsertChatSessionEntity({
      chatSessionId: "chat-1",
      entityKey: "sample:utility",
      lastFrame: "f2",
      completedFramesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      bucketId: 42,
      projectIdsJson: JSON.stringify(["P1"]),
      groupId: null,
      documentIdsJson: null,
      createdAt: new Date(),
      lastVisitedAt: new Date(),
    });

    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "Q" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: null,
        llmModelId: "test-model",
        // no rbacFilter
      },
    );

    const body = JSON.parse((groundxForward.mock.calls.at(-1)![1] as { body: string }).body);
    expect(body.filter).toEqual({ projectId: "P1" });
  });
});

// ────────────────────────────────────────────────────────────────────
// CF-16: light LLM vs chat LLM split.
//   - Leaf summarization (compression) hits the LIGHT client.
//   - RAG grounded completion hits the CHAT client.
// Back-compat: when `lightLlmClient` is omitted, the chat client is
// used for both (existing single-LLM deployments).
// ────────────────────────────────────────────────────────────────────
describe("handleChatMessage — CF-16 light LLM vs chat LLM split", () => {
  let repo: MemoryAppRepository;
  let chatLlmForward: ReturnType<typeof vi.fn>;
  let lightLlmForward: ReturnType<typeof vi.fn>;
  let chatLlm: LlmClient;
  let lightLlm: LlmClient;
  let groundxClient: GroundXClient;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    await repo.upsertChatSession(makeSession());
    chatLlmForward = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "chat-side completion" } }] }),
    );
    lightLlmForward = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "light-side summary" } }] }),
    );
    chatLlm = { forward: chatLlmForward };
    lightLlm = { forward: lightLlmForward };
    groundxClient = { forward: vi.fn(async () => jsonResponse({ search: { results: [] } })) };
  });

  async function seedLongLiveTail(): Promise<void> {
    // Seed enough live-tail content to clear the 70% trigger ratio.
    // Compression target tokens are 1000 by default; with a 16k context
    // window and trigger 0.7 (≈11.2k tokens budget), we need a tail
    // that bundleChatContext estimates above that. The crude estimator
    // counts ~4 chars per token, so 50k chars ≈ 12.5k tokens.
    const big = "x".repeat(2_500); // ~625 tokens per message
    for (let i = 0; i < 20; i += 1) {
      await repo.appendChatMessage(makeMessage(`m-${i}`, "chat-1", i + 1, "user", big));
    }
  }

  it("when lightLlmClient is provided, compression uses light; RAG uses chat", async () => {
    await seedLongLiveTail();
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "follow-up" },
      {
        repository: repo,
        llmClient: chatLlm,
        lightLlmClient: lightLlm,
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: 42,
        llmModelId: "chat-model",
        lightLlmModelId: "light-model",
      },
    );
    // Compression fired against the LIGHT client.
    expect(lightLlmForward).toHaveBeenCalled();
    const lightCall = lightLlmForward.mock.calls[0];
    const lightBody = JSON.parse((lightCall[1] as { body: string }).body);
    expect(lightBody.model).toBe("light-model");

    // RAG grounded completion fired against the CHAT client.
    expect(chatLlmForward).toHaveBeenCalled();
    const chatCall = chatLlmForward.mock.calls[0];
    const chatBody = JSON.parse((chatCall[1] as { body: string }).body);
    expect(chatBody.model).toBe("chat-model");

    // The light client never saw the chat-side model id, and vice versa.
    for (const call of lightLlmForward.mock.calls) {
      const body = JSON.parse((call[1] as { body: string }).body);
      expect(body.model).not.toBe("chat-model");
    }
    for (const call of chatLlmForward.mock.calls) {
      const body = JSON.parse((call[1] as { body: string }).body);
      expect(body.model).not.toBe("light-model");
    }
  });

  it("back-compat: when lightLlmClient is omitted, compression falls back to chat client", async () => {
    await seedLongLiveTail();
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "follow-up" },
      {
        repository: repo,
        llmClient: chatLlm,
        // no lightLlmClient
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: 42,
        llmModelId: "chat-model",
      },
    );
    // Light client was never created; chat client serves both compression + RAG.
    expect(lightLlmForward).not.toHaveBeenCalled();
    expect(chatLlmForward.mock.calls.length).toBeGreaterThanOrEqual(2);
    // At least one call carries the chat-model id.
    const models = chatLlmForward.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body).model);
    expect(models).toContain("chat-model");
  });

  it("lightLlmModelId defaults to llmModelId when omitted", async () => {
    await seedLongLiveTail();
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "follow-up" },
      {
        repository: repo,
        llmClient: chatLlm,
        lightLlmClient: lightLlm,
        // no lightLlmModelId
        groundxClient,
        groundxApiKey: "test-key",
        samplesBucketId: 42,
        llmModelId: "chat-model",
      },
    );
    expect(lightLlmForward).toHaveBeenCalled();
    const body = JSON.parse((lightLlmForward.mock.calls[0][1] as { body: string }).body);
    expect(body.model).toBe("chat-model");
  });
});

describe("handleChatMessage — CF-17 compression tunables", () => {
  let repo: MemoryAppRepository;
  let llmClient: LlmClient;
  let groundxClient: GroundXClient;

  async function seedSummaries(count: number): Promise<void> {
    // Leaf summaries — all generation 0, absorbedSummaryIdsJson "[]",
    // so they're all active.
    const base = Date.now();
    for (let i = 0; i < count; i++) {
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
        createdAt: new Date(base + i * 1000),
      });
    }
  }

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    await repo.upsertChatSession(makeSession());
    // The LLM fake serves both the compression call and the live RAG turn; the
    // compression assertions key off persisted summaries, not call counts. The
    // live RAG turn requires a GroundX client + key, so both are supplied at the
    // dependency seam (2026-06-01-retire-mock-mode — no mock short-circuit).
    llmClient = {
      forward: vi.fn(async () =>
        jsonResponse({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      ),
    };
    groundxClient = { forward: vi.fn(async () => jsonResponse({ search: { results: [] } })) };
  });

  it("`maxActiveSummariesBeforeMeta` controls when level-2 meta-compaction fires", async () => {
    // Seed 4 active leaf summaries.
    await seedSummaries(4);
    // With default (10) — 4 < 10 → meta should NOT fire on this post.
    const defaultResult = await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "x" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: null,
        llmModelId: "m",
      },
    );
    expect(defaultResult.compressionRan).toBe(false);

    // Reset session message turn counter by adding to a fresh session
    // and seeding the same 4 summaries.
    const repo2 = new MemoryAppRepository();
    await repo2.upsertChatSession(makeSession({ id: "chat-2" }));
    const base = Date.now();
    for (let i = 0; i < 4; i++) {
      await repo2.appendConversationSummary({
        id: `leaf-${i}`,
        chatSessionId: "chat-2",
        fromMessageId: `m${i * 2 + 1}`,
        toMessageId: `m${i * 2 + 2}`,
        generation: 0,
        absorbedSummaryIdsJson: "[]",
        content: `Leaf ${i} content`,
        model: "m",
        tokensIn: 50,
        tokensOut: 30,
        createdAt: new Date(base + i * 1000),
      });
    }
    // With cap=3 — 4 > 3 → meta SHOULD fire.
    const result = await handleChatMessage(
      { chatSessionId: "chat-2", newUserMessage: "x" },
      {
        repository: repo2,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: null,
        llmModelId: "m",
        maxActiveSummariesBeforeMeta: 3,
      },
    );
    expect(result.compressionRan).toBe(true);
    // A super-summary got written.
    const summaries = await repo2.listConversationSummaries("chat-2");
    expect(summaries.length).toBeGreaterThan(4); // 4 leaves + at least one super
  });

  it("`metaCompactionBatchSize` controls how many summaries each meta-fold absorbs", async () => {
    await seedSummaries(8); // 8 > default 10? no, but we'll set cap to 4
    // We override BOTH knobs so the test is hermetic. With cap=4 and
    // batch=3, 8 > 4 fires; the new super absorbs the OLDEST 3.
    const result = await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "x" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: null,
        llmModelId: "m",
        maxActiveSummariesBeforeMeta: 4,
        metaCompactionBatchSize: 3,
      },
    );
    expect(result.compressionRan).toBe(true);
    const summaries = await repo.listConversationSummaries("chat-1");
    const supers = summaries.filter((s) => s.generation > 0);
    expect(supers).toHaveLength(1);
    // The super absorbed exactly 3 leaves.
    expect(JSON.parse(supers[0].absorbedSummaryIdsJson)).toEqual([
      "leaf-0",
      "leaf-1",
      "leaf-2",
    ]);
  });

  it("`compressionTriggerRatio` controls when level-1 leaf compaction fires", async () => {
    // Pre-seed the live tail with ~200 tokens of content.
    await repo.appendChatMessage(makeMessage("m1", "chat-1", 1, "user", "x".repeat(400)));
    await repo.appendChatMessage(makeMessage("m2", "chat-1", 2, "assistant", "y".repeat(400)));
    // With trigger=0.5 + window=1000: 200/1000 = 20% — under 50%, no fire.
    const resultNoFire = await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "z" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: null,
        llmModelId: "m",
        contextWindowTokens: 1000,
        compressionTriggerRatio: 0.5,
      },
    );
    expect(resultNoFire.compressionRan).toBe(false);

    // Fresh session — same input, lower window so 200/300 = 67% > 0.5 → fire.
    const repo2 = new MemoryAppRepository();
    await repo2.upsertChatSession(makeSession({ id: "chat-2" }));
    await repo2.appendChatMessage(makeMessage("m1", "chat-2", 1, "user", "x".repeat(400)));
    await repo2.appendChatMessage(makeMessage("m2", "chat-2", 2, "assistant", "y".repeat(400)));
    const resultFire = await handleChatMessage(
      { chatSessionId: "chat-2", newUserMessage: "z" },
      {
        repository: repo2,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: null,
        llmModelId: "m",
        contextWindowTokens: 300,
        compressionTriggerRatio: 0.5,
      },
    );
    expect(resultFire.compressionRan).toBe(true);
  });

  it("`compressionTargetTokens` controls how many messages each leaf compaction absorbs", async () => {
    // Seed 4 messages of ~100 tokens each (400 chars each → ~100 tokens via /4 estimator).
    for (let i = 1; i <= 4; i++) {
      await repo.appendChatMessage(
        makeMessage(`m${i}`, "chat-1", i, i % 2 ? "user" : "assistant", "x".repeat(400)),
      );
    }
    // Force compression to fire by setting a tiny window.
    // With target=150: collect oldest until acc>=150. After m1 (100), acc=100. After
    // m2 (100), acc=200 ≥ 150 → break. messageIds = [m1, m2].
    const result = await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "z" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: null,
        llmModelId: "m",
        contextWindowTokens: 100,
        compressionTargetTokens: 150,
      },
    );
    expect(result.compressionRan).toBe(true);
    const summaries = await repo.listConversationSummaries("chat-1");
    expect(summaries).toHaveLength(1);
    // Plan absorbed m1 + m2 (the oldest two that hit the 150-token target).
    expect(summaries[0].fromMessageId).toBe("m1");
    expect(summaries[0].toMessageId).toBe("m2");
  });

  describe("CF-17 drift guard — in-code DEFAULT_* constants pinned to env Zod defaults", () => {
    // If someone bumps an env default without updating the in-code
    // fallback (or vice versa), these tests fail. That prevents the
    // "production reads X, test reads Y" silent-divergence class of bug.
    it("pins all 5 chatHandler defaults to the matching env Zod default", async () => {
      const {
        DEFAULT_CONTEXT_WINDOW,
        DEFAULT_COMPRESSION_TARGET_TOKENS,
        DEFAULT_MAX_ACTIVE_SUMMARIES_BEFORE_META,
        DEFAULT_META_COMPACTION_BATCH_SIZE,
        DEFAULT_MAX_SUMMARY_OUTPUT_TOKENS,
      } = await import("./chatHandler.js");
      const { loadEnv } = await import("../config/env.js");
      // Load env with nothing set — Zod fills in every default.
      const env = loadEnv({ NODE_ENV: "development", PORT: "3001" } as never);
      expect(env.LLM_CONTEXT_WINDOW_TOKENS).toBe(DEFAULT_CONTEXT_WINDOW);
      expect(env.COMPRESSION_TARGET_TOKENS).toBe(DEFAULT_COMPRESSION_TARGET_TOKENS);
      expect(env.MAX_ACTIVE_SUMMARIES_BEFORE_META).toBe(DEFAULT_MAX_ACTIVE_SUMMARIES_BEFORE_META);
      expect(env.META_COMPACTION_BATCH_SIZE).toBe(DEFAULT_META_COMPACTION_BATCH_SIZE);
      expect(env.MAX_SUMMARY_OUTPUT_TOKENS).toBe(DEFAULT_MAX_SUMMARY_OUTPUT_TOKENS);
    });

    it("pins shouldCompress's default trigger ratio to the env Zod default", async () => {
      const { DEFAULT_COMPRESSION_TRIGGER_RATIO } = await import("./contextBundler.js");
      const { loadEnv } = await import("../config/env.js");
      const env = loadEnv({ NODE_ENV: "development", PORT: "3001" } as never);
      expect(env.COMPRESSION_TRIGGER_RATIO).toBe(DEFAULT_COMPRESSION_TRIGGER_RATIO);
    });
  });

  it("`maxSummaryOutputTokens` flows into the LLM call body as `max_completion_tokens`", async () => {
    await repo.appendChatMessage(makeMessage("m1", "chat-1", 1, "user", "x".repeat(400)));
    await repo.appendChatMessage(makeMessage("m2", "chat-1", 2, "assistant", "y".repeat(400)));
    await handleChatMessage(
      { chatSessionId: "chat-1", newUserMessage: "z" },
      {
        repository: repo,
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: null,
        llmModelId: "m",
        contextWindowTokens: 100,
        maxSummaryOutputTokens: 250,
      },
    );
    // The leaf-compaction LLM call should have included
    // max_completion_tokens=250 (gpt-5 family deprecated max_tokens). The live
    // RAG turn also posts to /chat/completions, so select the call that carries
    // the summarizer's max_completion_tokens (the RAG grounding call does not).
    const summarizerCall = (llmClient.forward as ReturnType<typeof vi.fn>).mock.calls.find((c) => {
      if (c[0] !== "/chat/completions") return false;
      try {
        return JSON.parse((c[1] as RequestInit).body as string).max_completion_tokens === 250;
      } catch {
        return false;
      }
    });
    expect(summarizerCall).toBeDefined();
    const body = JSON.parse((summarizerCall![1] as RequestInit).body as string);
    expect(body.max_completion_tokens).toBe(250);
  });
});

describe("deriveRagContentScope — characterization: read-but-unwritten scope columns", () => {
  // CHARACTERIZATION (2026-05-30-entity-rag-scope-roundtrip Phase 1).
  //
  // `deriveRagContentScope` READS the four `chat_session_entities` scope
  // columns (documentIdsJson / groupId / bucketId / projectIdsJson), but
  // NO producer writes them today: the only writer (app.ts ~803-810)
  // deliberately preserves them server-only (`existing?.X ?? null`) and
  // the client PUT can never set them, and no steady-mode/BYO producer
  // exists yet. So for the only path that runs today (anon onboarding) a
  // fresh entity has all four columns NULL and resolves to the env
  // samples-bucket fallback — this is **by design**, the documented
  // onboarding default, not a live wrong-bucket bug.
  //
  // This test locks that current behavior. It is the RED starting point
  // the future steady-mode/BYO producer change (sequenced with cf19/CF-15)
  // will flip once a producer writes a customer's real scope into these
  // columns. Do NOT add a producer or drop the columns in this slice.

  function makeFreshEntity(): ChatSessionEntityRecord {
    // A fresh anon onboarding entity: all four scope columns NULL,
    // exactly as the only live writer leaves them.
    return {
      chatSessionId: "chat-fresh",
      entityKey: "sample:utility",
      lastFrame: null,
      completedFramesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      bucketId: null,
      projectIdsJson: null,
      groupId: null,
      documentIdsJson: null,
      createdAt: new Date(),
      lastVisitedAt: new Date(),
    };
  }

  it("a fresh entity with all four scope columns NULL resolves to the samples-bucket fallback", () => {
    const scope = deriveRagContentScope(makeFreshEntity(), 28454);
    // The columns are read-but-unwritten, so none of the entity-scope
    // branches fire; the env samples bucket drives the search.
    expect(scope).toEqual({ type: "bucket", bucketId: 28454 });
  });

  it("with no fallback bucket either, a fresh entity resolves to null (no derivable scope)", () => {
    const scope = deriveRagContentScope(makeFreshEntity(), null);
    expect(scope).toBeNull();
  });
});

describe("entity scope round-trip: producer writes → deriveRagContentScope reads (2026-05-31-steady-scope-producer Phase 2)", () => {
  // This is the round-trip the change `entity-rag-scope-roundtrip` left as
  // its starting RED: the producer (`entityScopeProducer.produceEntityScope`)
  // now WRITES the scope columns for a `sample` entity, and
  // `deriveRagContentScope` READS them back to the demo scope — NOT the bare
  // env-samples-bucket fallback. The characterization block above still locks
  // the reader-in-isolation behavior for NULL columns; this block proves the
  // loop is closed once the producer fills them.

  function entityWithProducedScope(entityKey: string, samplesBucketId: number): ChatSessionEntityRecord {
    // Simulate the entity-write seam: the producer fills the scope columns,
    // we persist them onto the row exactly as the PUT route does.
    const produced = produceEntityScope(entityKey, { samplesBucketId });
    return {
      chatSessionId: "chat-rt",
      entityKey,
      lastFrame: null,
      completedFramesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      bucketId: produced?.bucketId ?? null,
      projectIdsJson: produced?.projectIdsJson ?? null,
      groupId: produced?.groupId ?? null,
      documentIdsJson: produced?.documentIdsJson ?? null,
      createdAt: new Date(),
      lastVisitedAt: new Date(),
    };
  }

  it("a produced sample entity resolves to the demo scope (bucket + project filter), NOT the bare fallback", () => {
    const entity = entityWithProducedScope("sample:utility", 28454);
    // Even with the same env fallback bucket supplied, the produced
    // project-filtered scope wins — proving the columns were read, not the
    // fallback branch.
    const scope = deriveRagContentScope(entity, 28454);
    expect(scope).toEqual({
      type: "bucket",
      bucketId: 28454,
      // The producer resolves the `utility` scenario to its REAL seeded
      // project id (the value stamped on the doc filter), not the slug.
      filter: { projectId: [SAMPLE_PROJECT_ID] },
    });
  });

  it("a different scenario round-trips to its own project filter", () => {
    const entity = entityWithProducedScope("sample:loan", 42);
    expect(deriveRagContentScope(entity, 42)).toEqual({
      type: "bucket",
      bucketId: 42,
      filter: { projectId: ["loan"] },
    });
  });

  it("no-regression: when the producer yields nothing (no samples bucket), the entity falls through to the env fallback", () => {
    // produceEntityScope returns null → columns NULL → fallback drives.
    const entity = entityWithProducedScope("sample:utility", undefined as unknown as number);
    const scope = deriveRagContentScope(entity, 28454);
    expect(scope).toEqual({ type: "bucket", bucketId: 28454 });
  });
});
