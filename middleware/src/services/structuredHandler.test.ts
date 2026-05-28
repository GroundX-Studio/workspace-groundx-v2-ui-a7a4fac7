import { beforeEach, describe, expect, it, vi } from "vitest";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import { FakePartnerClient } from "../test/fakes.js";
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

  // CF-04 — three real readers replace the previous frank-reply stubs.
  // Each reads from a real source: saved_schemas from the repo's
  // extraction_schemas table, my_projects + api_keys from the Partner
  // API (via partnerClient). Anonymous users (groundxUsername == null)
  // still get a frank "sign in" nudge — the data needs an authed
  // customer.

  it("saved_schemas → reads from the extraction_schemas repo and names the schemas", async () => {
    await repo.upsertExtractionSchema({
      id: "sch-1",
      groundxUsername: "alice@example.com",
      name: "utility-bill-v2",
      schemaJson: JSON.stringify({ fields: [] }),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.upsertExtractionSchema({
      id: "sch-2",
      groundxUsername: "alice@example.com",
      name: "loan-applicant",
      schemaJson: JSON.stringify({ fields: [] }),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = await runStructuredQuery(
      makeRequest({ newUserMessage: "list my saved schemas" }),
      {
        repository: repo,
        partnerClient: new FakePartnerClient(),
        chatSessionId: "chat-1",
        groundxUsername: "alice@example.com",
        byoPagesLimit: 100,
      },
    );
    expect(reply.mode).toBe("structured");
    expect(reply.answer).toMatch(/utility-bill-v2/);
    expect(reply.answer).toMatch(/loan-applicant/);
    expect(reply.answer).toMatch(/2 saved schemas?/i);
  });

  it("saved_schemas (anon) → suggests signing in", async () => {
    const reply = await runStructuredQuery(
      makeRequest({ newUserMessage: "my saved schemas" }),
      {
        repository: repo,
        partnerClient: new FakePartnerClient(),
        chatSessionId: "chat-1",
        groundxUsername: null,
        byoPagesLimit: 100,
      },
    );
    expect(reply.answer).toMatch(/sign in/i);
  });

  it("my_projects → calls Partner /project with the user's customer key", async () => {
    class StubPartnerClient extends FakePartnerClient {
      async forward(path: string, init: RequestInit & { customerKey?: string }): Promise<Response> {
        this.calls.push({ name: "forward", input: { path, init } });
        if (path === "/project" && init.method === "GET") {
          return Response.json({
            projects: [
              { projectId: "p-1", name: "Q3 Contracts" },
              { projectId: "p-2", name: "Vendor Onboarding" },
            ],
          });
        }
        return Response.json({});
      }
    }
    const partner = new StubPartnerClient();
    const reply = await runStructuredQuery(
      makeRequest({ newUserMessage: "list my projects" }),
      {
        repository: repo,
        partnerClient: partner,
        chatSessionId: "chat-1",
        groundxUsername: "alice@example.com",
        byoPagesLimit: 100,
      },
    );
    // The customer key header is set via the partner client's forward.
    const lastForward = partner.calls.find((c) => c.name === "forward")!;
    expect((lastForward.input as { path: string }).path).toBe("/project");
    expect((lastForward.input as { init: { customerKey?: string } }).init.customerKey).toBe(
      "alice@example.com",
    );
    expect(reply.answer).toMatch(/Q3 Contracts/);
    expect(reply.answer).toMatch(/Vendor Onboarding/);
    expect(reply.answer).toMatch(/2 projects?/i);
  });

  it("my_projects (anon) → suggests signing in", async () => {
    const reply = await runStructuredQuery(
      makeRequest({ newUserMessage: "my projects" }),
      {
        repository: repo,
        partnerClient: new FakePartnerClient(),
        chatSessionId: "chat-1",
        groundxUsername: null,
        byoPagesLimit: 100,
      },
    );
    expect(reply.answer).toMatch(/sign in/i);
  });

  it("api_keys → calls Partner /apikey and lists keys WITHOUT leaking the full key value", async () => {
    class StubPartnerClient extends FakePartnerClient {
      async forward(path: string, init: RequestInit & { customerKey?: string }): Promise<Response> {
        this.calls.push({ name: "forward", input: { path, init } });
        if (path === "/apikey" && init.method === "GET") {
          // NOTE: Partner API keys are UUIDs in practice — these fake
          // values use a `pk-` prefix (not `sk-`) so they don't trip
          // `scripts/scan-secrets.mjs`'s OpenAI-style key regex. The
          // last-4 assertions below still verify the safe-display
          // contract.
          return Response.json({
            apiKeys: [
              { id: "k1", name: "prod-key", apiKey: "pk-FULLSECRET-1234567890abcdef" },
              { id: "k2", name: "dev-key", apiKey: "pk-OTHERSECRET-fedcba0987654321" },
            ],
          });
        }
        return Response.json({});
      }
    }
    const partner = new StubPartnerClient();
    const reply = await runStructuredQuery(
      makeRequest({ newUserMessage: "list my api keys" }),
      {
        repository: repo,
        partnerClient: partner,
        chatSessionId: "chat-1",
        groundxUsername: "alice@example.com",
        byoPagesLimit: 100,
      },
    );
    expect(reply.answer).toMatch(/prod-key/);
    expect(reply.answer).toMatch(/dev-key/);
    // The full secret must NEVER appear in the chat answer.
    expect(reply.answer).not.toMatch(/FULLSECRET-1234567890abcdef/);
    expect(reply.answer).not.toMatch(/OTHERSECRET-fedcba0987654321/);
    // But the last-4 chars per key are OK so the user can identify
    // which key is which.
    expect(reply.answer).toMatch(/cdef/);
    expect(reply.answer).toMatch(/4321/);
  });

  it("api_keys (anon) → suggests signing in", async () => {
    const reply = await runStructuredQuery(
      makeRequest({ newUserMessage: "my api keys" }),
      {
        repository: repo,
        partnerClient: new FakePartnerClient(),
        chatSessionId: "chat-1",
        groundxUsername: null,
        byoPagesLimit: 100,
      },
    );
    expect(reply.answer).toMatch(/sign in/i);
  });

  it("Partner API failure on my_projects → frank error reply, no fabrication", async () => {
    class FailingPartnerClient extends FakePartnerClient {
      async forward(): Promise<Response> {
        return new Response("upstream down", { status: 502 });
      }
    }
    const reply = await runStructuredQuery(
      makeRequest({ newUserMessage: "my projects" }),
      {
        repository: repo,
        partnerClient: new FailingPartnerClient(),
        chatSessionId: "chat-1",
        groundxUsername: "alice@example.com",
        byoPagesLimit: 100,
      },
    );
    expect(reply.answer).toMatch(/couldn't reach|temporarily unavailable|try again/i);
    // Crucially, it does NOT make up a project list.
    expect(reply.answer).not.toMatch(/Q3 Contracts/);
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

  // CF-05 — iterated prompt + real readers. When an LLM is wired,
  // hybrid composes a tour-style answer from (a) the active entity,
  // (b) recent viewer trail, (c) signed-in user's saved-schema count,
  // (d) the RAG snippets. When the LLM is missing or fails, falls
  // back to the hand-rolled answer (the previous behavior).
  describe("CF-05 hybrid quality — iterated prompt", () => {
    function makeLlm(content: string): {
      client: { forward: ReturnType<typeof vi.fn> };
      forward: ReturnType<typeof vi.fn>;
    } {
      const forward = vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      return { client: { forward }, forward };
    }

    it("calls the LLM with the active entity + snippets in the prompt", async () => {
      const { client, forward } = makeLlm("Looks like you're partway through F2 on the utility bill.");
      const reply = await runHybridQuery(
        makeRequest({ newUserMessage: "explain this sample" }),
        {
          repository: repo,
          chatSessionId: "chat-1",
          groundxUsername: null,
          byoPagesLimit: 100,
          llmClient: client,
          llmModelId: "tour-model",
          ragSnippets: [
            { documentId: "d-1", pageNumber: 3, text: "the utility bill total is $123.45" },
          ],
        },
      );
      expect(forward).toHaveBeenCalledTimes(1);
      const body = JSON.parse((forward.mock.calls[0][1] as { body: string }).body);
      expect(body.model).toBe("tour-model");
      const promptText = JSON.stringify(body.messages);
      // Active entity surfaced.
      expect(promptText).toContain("sample:utility");
      // Snippet surfaced.
      expect(promptText).toContain("utility bill total is $123.45");
      // Question surfaced.
      expect(promptText).toContain("explain this sample");
      // The answer is the LLM output, not the hand-rolled fallback.
      expect(reply.answer).toBe("Looks like you're partway through F2 on the utility bill.");
      expect(reply.mode).toBe("hybrid");
      expect(reply.citations).toHaveLength(1);
    });

    it("includes saved-schema count for signed-in users", async () => {
      await repo.upsertExtractionSchema({
        id: "sch-1",
        groundxUsername: "alice@example.com",
        name: "utility-bill-v2",
        schemaJson: "{}",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const { client, forward } = makeLlm("OK");
      await runHybridQuery(makeRequest({ newUserMessage: "what can I do" }), {
        repository: repo,
        chatSessionId: "chat-1",
        groundxUsername: "alice@example.com",
        byoPagesLimit: 100,
        llmClient: client,
        llmModelId: "tour-model",
        ragSnippets: [],
      });
      const body = JSON.parse((forward.mock.calls[0][1] as { body: string }).body);
      const promptText = JSON.stringify(body.messages);
      expect(promptText).toMatch(/1 saved schema/i);
    });

    it("does NOT call the LLM (and uses hand-rolled fallback) when llmClient is missing", async () => {
      const reply = await runHybridQuery(makeRequest({ newUserMessage: "explain this sample" }), {
        repository: repo,
        chatSessionId: "chat-1",
        groundxUsername: null,
        byoPagesLimit: 100,
        // no llmClient
        ragSnippets: [
          { documentId: "d-1", pageNumber: 3, text: "the utility bill total is $123.45" },
        ],
      });
      expect(reply.mode).toBe("hybrid");
      // Hand-rolled answer still references the active entity + snippet.
      expect(reply.answer).toMatch(/sample:utility/);
      expect(reply.answer).toMatch(/utility bill total/);
    });

    it("falls back to hand-rolled answer when the LLM call throws", async () => {
      const llmClient = { forward: vi.fn(async () => { throw new Error("upstream blew up"); }) };
      const reply = await runHybridQuery(
        makeRequest({ newUserMessage: "tour me through this" }),
        {
          repository: repo,
          chatSessionId: "chat-1",
          groundxUsername: null,
          byoPagesLimit: 100,
          llmClient,
          llmModelId: "tour-model",
          ragSnippets: [
            { documentId: "d-1", pageNumber: 3, text: "fallback snippet text" },
          ],
        },
      );
      expect(llmClient.forward).toHaveBeenCalled();
      // Answer is the hand-rolled fallback, NOT a fabricated tour.
      expect(reply.mode).toBe("hybrid");
      expect(reply.answer).toMatch(/sample:utility/);
      expect(reply.answer).toMatch(/fallback snippet text/);
    });

    it("falls back when LLM returns non-OK status (503 / 5xx)", async () => {
      const llmClient = {
        forward: vi.fn(async () => new Response("nope", { status: 503 })),
      };
      const reply = await runHybridQuery(
        makeRequest({ newUserMessage: "tour please" }),
        {
          repository: repo,
          chatSessionId: "chat-1",
          groundxUsername: null,
          byoPagesLimit: 100,
          llmClient,
          llmModelId: "tour-model",
          ragSnippets: [],
        },
      );
      expect(llmClient.forward).toHaveBeenCalled();
      // Hand-rolled "no snippets" fallback.
      expect(reply.answer).toMatch(/didn't find/i);
    });

    it("passes RAG snippet citations through to the response untouched", async () => {
      const { client } = makeLlm("Answer.");
      const reply = await runHybridQuery(
        makeRequest({ newUserMessage: "Q" }),
        {
          repository: repo,
          chatSessionId: "chat-1",
          groundxUsername: null,
          byoPagesLimit: 100,
          llmClient: client,
          llmModelId: "tour-model",
          ragSnippets: [
            { documentId: "d-1", pageNumber: 3, text: "alpha" },
            { documentId: "d-2", pageNumber: 7, text: "beta" },
          ],
        },
      );
      expect(reply.citations).toHaveLength(2);
      expect(reply.citations[0]).toMatchObject({ documentId: "d-1", page: 3 });
      expect(reply.citations[1]).toMatchObject({ documentId: "d-2", page: 7 });
    });
  });
});
