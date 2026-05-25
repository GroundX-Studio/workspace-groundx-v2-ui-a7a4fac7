import { beforeEach, describe, expect, it } from "vitest";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import type { ChatRouterRequest } from "./chatRouter.js";

import {
  classifyStructuredQuery,
  runHybridQuery,
  runStructuredQuery,
} from "./structuredHandler.js";

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

describe("classifyStructuredQuery", () => {
  it("matches 'pages remaining' / 'page budget' / 'free tier'", () => {
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "how many pages remaining?" }))).toBe(
      "pages_remaining",
    );
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "what's my page budget?" }))).toBe(
      "pages_remaining",
    );
  });

  it("matches 'saved schemas' family", () => {
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "show me my saved schemas" }))).toBe(
      "saved_schemas",
    );
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "list my schemas" }))).toBe("saved_schemas");
  });

  it("matches 'onboarding state' / 'onboarding progress'", () => {
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "where am I in onboarding state?" }))).toBe(
      "onboarding_state",
    );
  });

  it("matches 'current view' / 'current entity' / 'current doc'", () => {
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "what's the current view?" }))).toBe(
      "current_entity",
    );
  });

  it("matches 'my projects' / 'my workspace'", () => {
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "list my projects please" }))).toBe(
      "my_projects",
    );
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "show me my workspace" }))).toBe(
      "my_projects",
    );
  });

  it("matches 'api key' family", () => {
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "rotate my api key" }))).toBe("api_keys");
  });

  it("returns 'unknown' for things that aren't recognized structured queries", () => {
    expect(classifyStructuredQuery(makeRequest({ newUserMessage: "hello world" }))).toBe("unknown");
  });
});

describe("runStructuredQuery", () => {
  let repo: MemoryAppRepository;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    // Seed a session + an active entity so the onboarding-state and
    // current-entity handlers have data to read.
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
      lastFrame: "f3",
      completedFramesJson: JSON.stringify(["f1", "f2", "f3"]),
      scanProgressJson: null,
      extractedValuesJson: null,
      createdAt: now,
      lastVisitedAt: now,
    });
  });

  it("pages_remaining → returns a frank answer that surfaces the budget but admits usage isn't wired", async () => {
    const reply = await runStructuredQuery(makeRequest({ newUserMessage: "pages remaining?" }), {
      repository: repo,
      chatSessionId: "chat-1",
      groundxUsername: null,
      byoPagesLimit: 150,
    });
    expect(reply.mode).toBe("structured");
    expect(reply.answer).toMatch(/150 pages/);
    // Frank disclosure that usage accounting isn't live yet — better
    // than fabricating a number.
    expect(reply.answer).toMatch(/usage.*wired|wired.*usage|don't have the live usage/i);
    expect(reply.citations).toHaveLength(0);
  });

  it("onboarding_state → returns real data from the session + active entity", async () => {
    const reply = await runStructuredQuery(
      makeRequest({ newUserMessage: "where am I in onboarding progress?" }),
      { repository: repo, chatSessionId: "chat-1", groundxUsername: null, byoPagesLimit: 100 },
    );
    expect(reply.mode).toBe("structured");
    expect(reply.answer).toMatch(/sample:utility/);
    expect(reply.answer).toMatch(/f3/);
    expect(reply.answer).toMatch(/frames completed: 3/i);
  });

  it("current_entity → returns the active entity key and last frame", async () => {
    const reply = await runStructuredQuery(makeRequest({ newUserMessage: "what's the current view?" }), {
      repository: repo,
      chatSessionId: "chat-1",
      groundxUsername: null,
      byoPagesLimit: 100,
    });
    expect(reply.answer).toMatch(/sample:utility/);
    expect(reply.answer).toMatch(/f3/);
  });

  it("current_entity with no active entity → 'pick a sample' nudge", async () => {
    await repo.upsertChatSession({
      id: "chat-2",
      onboardingSessionId: "onb-2",
      ownerUserId: null,
      ownerAnonId: "anon-1",
      title: "Empty",
      isOnboarding: true,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
    });
    const reply = await runStructuredQuery(makeRequest({ newUserMessage: "what's the current entity?" }), {
      repository: repo,
      chatSessionId: "chat-2",
      groundxUsername: null,
      byoPagesLimit: 100,
    });
    expect(reply.answer).toMatch(/haven't picked/i);
    expect(reply.suggestedActions[0].key).toBe("open-samples");
  });

  it("saved_schemas / my_projects / api_keys → frank 'reader not wired' reply, NOT a fabricated answer", async () => {
    for (const q of ["my saved schemas", "list my projects", "rotate my api key"]) {
      const reply = await runStructuredQuery(makeRequest({ newUserMessage: q }), {
        repository: repo,
        chatSessionId: "chat-1",
        groundxUsername: null,
        byoPagesLimit: 100,
      });
      expect(reply.mode).toBe("structured");
      expect(reply.answer).toMatch(/wired|settings page/i);
      // The whole point: we don't fabricate an answer. The reply
      // should NOT contain made-up schema names, project names, or
      // API keys.
      expect(reply.answer).not.toMatch(/[A-Za-z]+-schema-\d+/);
    }
  });

  it("unknown structured query → suggests likely queries by name", async () => {
    const reply = await runStructuredQuery(
      makeRequest({ newUserMessage: "tell me about the universe" }),
      { repository: repo, chatSessionId: "chat-1", groundxUsername: null, byoPagesLimit: 100 },
    );
    expect(reply.answer).toMatch(/pages remaining/);
    expect(reply.answer).toMatch(/current view/);
    expect(reply.answer).toMatch(/saved schemas/);
  });
});

describe("runHybridQuery", () => {
  let repo: MemoryAppRepository;

  beforeEach(async () => {
    repo = new MemoryAppRepository();
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
  });

  it("returns a tour-style reply that references the active entity + snippet preview", async () => {
    const reply = await runHybridQuery(makeRequest({ newUserMessage: "explain this sample" }), {
      repository: repo,
      chatSessionId: "chat-1",
      groundxUsername: null,
      byoPagesLimit: 100,
      ragSnippets: [
        { documentId: "d-1", pageNumber: 3, text: "the utility bill total is $123.45" },
        { documentId: "d-1", pageNumber: 4, text: "due date is the 15th" },
      ],
    });
    expect(reply.mode).toBe("hybrid");
    expect(reply.answer).toMatch(/sample:utility/);
    expect(reply.answer).toMatch(/utility bill total/);
    expect(reply.citations).toHaveLength(2);
    expect(reply.citations[0].documentId).toBe("d-1");
    // Hybrid surfaces a "show me the extract" + "try a question"
    // suggested-actions chip pair — same shape as the mock envelope
    // had for parity.
    expect(reply.suggestedActions.map((a) => a.key)).toEqual(["show-extract", "try-chat"]);
  });

  it("returns a useful reply even when RAG returned no snippets", async () => {
    const reply = await runHybridQuery(makeRequest({ newUserMessage: "what is this?" }), {
      repository: repo,
      chatSessionId: "chat-1",
      groundxUsername: null,
      byoPagesLimit: 100,
      ragSnippets: [],
    });
    expect(reply.mode).toBe("hybrid");
    expect(reply.answer).toMatch(/didn't find/i);
    expect(reply.citations).toHaveLength(0);
  });
});
