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

  it("saved_schemas → reads templates (kind=extract) and names them", async () => {
    await repo.saveTemplate({
      id: "sch-1",
      kind: "extract",
      groundxUsername: "alice@example.com",
      name: "utility-bill-v2",
      bodyJson: JSON.stringify({ categories: [] }),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await repo.saveTemplate({
      id: "sch-2",
      kind: "extract",
      groundxUsername: "alice@example.com",
      name: "loan-applicant",
      bodyJson: JSON.stringify({ categories: [] }),
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


// ── chat-architecture-hardening Task 3 — hybrid merged into the grounded seam ──
//
// Hybrid is the THIRD caller of `groundedAnswerOverScope` (chat, report,
// hybrid). One grounded system prompt (with a WORKSPACE STATE private block),
// the full citation-verification contract, no separate hybrid prompt, no
// router-side hybrid search.
describe("hybrid full-merge (grounded seam)", () => {
  let repo: MemoryAppRepository;
  const now = new Date();

  function fakeGroundx(results: Array<Record<string, unknown>>) {
    const forward = vi.fn(async (path: string) => {
      if (path.includes("/search")) {
        return new Response(JSON.stringify({ search: { results } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });
    return { client: { forward }, forward };
  }

  function fakeLlm(content: string) {
    const forward = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    return { client: { forward }, forward };
  }

  beforeEach(async () => {
    repo = new MemoryAppRepository();
    await repo.upsertChatSession({
      id: "chat-h",
      onboardingSessionId: "onb-h",
      ownerUserId: null,
      ownerAnonId: "anon-1",
      title: "t",
      isOnboarding: true,
      activeEntityKey: "sample:utility",
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    await repo.upsertChatSessionEntity({
      chatSessionId: "chat-h",
      entityKey: "sample:utility",
      lastFrame: "f2",
      completedFramesJson: "[]",
      scanProgressJson: null,
      extractedValuesJson: null,
      createdAt: now,
      lastVisitedAt: now,
    } as Parameters<typeof repo.upsertChatSessionEntity>[0]);
  });

  it("builds ONE grounded system prompt with a WORKSPACE STATE block (no hybrid fork)", async () => {
    const llm = fakeLlm("You're on the utility sample, partway through Understand.");
    const gx = fakeGroundx([{ documentId: "d-1", text: "total is $123.45" }]);
    const reply = await runHybridQuery(makeRequest({ newUserMessage: "where am I?" }), {
      repository: repo,
      chatSessionId: "chat-h",
      groundxUsername: null,
      byoPagesLimit: 100,
      llmClient: llm.client,
      llmModelId: "m",
      groundxClient: gx.client,
      groundxApiKey: "k",
    });
    expect(reply.mode).toBe("hybrid");
    const body = JSON.parse((llm.forward.mock.calls[0][1] as { body: string }).body);
    const system = body.messages[0].content as string;
    // The grounded builder, not a hybrid fork:
    expect(system).toMatch(/^You are the user's analyst/);
    expect(system).toContain("WORKSPACE STATE");
    expect(system).toContain("sample:utility");
    expect(system).not.toContain("tour-style answer");
    // No tool advertising on the hybrid path.
    expect(body.tools).toBeUndefined();
    // Fixed-plan coherence (turn-router-extraction-appstate): the hybrid
    // plan carries extractionContext: true, so the seam still attempts the
    // primary doc's extraction fetch — the planner is never involved.
    expect(
      gx.forward.mock.calls.filter(([p]) => String(p).includes("/ingest/document/extract/")),
    ).toHaveLength(1);
  });

  it("uncited hybrid answer carries ZERO citations and no show-source chip", async () => {
    const llm = fakeLlm("Just a plain answer, no citations block.");
    const gx = fakeGroundx([{ documentId: "d-1", text: "total is $123.45" }]);
    const reply = await runHybridQuery(makeRequest({ newUserMessage: "where am I?" }), {
      repository: repo,
      chatSessionId: "chat-h",
      groundxUsername: null,
      byoPagesLimit: 100,
      llmClient: llm.client,
      llmModelId: "m",
      groundxClient: gx.client,
      groundxApiKey: "k",
    });
    expect(reply.citations).toEqual([]);
    expect(reply.suggestedActions.map((a) => a.key)).toEqual(["show-extract", "try-chat"]);
  });

  it("cited hybrid answer carries VERIFIED citations plus the show-source chip", async () => {
    const llm = fakeLlm(
      'The total is $123.45.\n\n```json\n{"citations":[{"documentId":"d-1","page":1,"quote":"total is $123.45","answerSpan":"total is $123.45"}]}\n```',
    );
    const gx = fakeGroundx([{ documentId: "d-1", text: "total is $123.45" }]);
    const reply = await runHybridQuery(makeRequest({ newUserMessage: "what is the total?" }), {
      repository: repo,
      chatSessionId: "chat-h",
      groundxUsername: null,
      byoPagesLimit: 100,
      llmClient: llm.client,
      llmModelId: "m",
      groundxClient: gx.client,
      groundxApiKey: "k",
    });
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0].tier).toBeDefined();
    expect(reply.suggestedActions.map((a) => a.key)).toEqual([
      "show-source",
      "show-extract",
      "try-chat",
    ]);
  });

  it("missing groundx client still produces LLM prose (grounded seam, empty snippets)", async () => {
    const llm = fakeLlm("You're on the utility sample.");
    const reply = await runHybridQuery(makeRequest({ newUserMessage: "where am I?" }), {
      repository: repo,
      chatSessionId: "chat-h",
      groundxUsername: null,
      byoPagesLimit: 100,
      llmClient: llm.client,
      llmModelId: "m",
      // no groundxClient/key
    });
    expect(llm.forward).toHaveBeenCalledTimes(1);
    expect(reply.answer).toBe("You're on the utility sample.");
    expect(reply.citations).toEqual([]);
  });

  it("search failure degrades to LLM prose over empty snippets (no thrown turn)", async () => {
    const llm = fakeLlm("Still here to help.");
    const gx = { forward: vi.fn(async () => { throw new Error("search down"); }) };
    const reply = await runHybridQuery(makeRequest({ newUserMessage: "where am I?" }), {
      repository: repo,
      chatSessionId: "chat-h",
      groundxUsername: null,
      byoPagesLimit: 100,
      llmClient: llm.client,
      llmModelId: "m",
      groundxClient: gx,
      groundxApiKey: "k",
    });
    expect(reply.answer).toBe("Still here to help.");
    expect(reply.mode).toBe("hybrid");
  });

  it("no LLM client → deterministic SNIPPET-LESS structured fallback", async () => {
    const gx = fakeGroundx([{ documentId: "d-1", text: "total is $123.45" }]);
    const reply = await runHybridQuery(makeRequest({ newUserMessage: "where am I?" }), {
      repository: repo,
      chatSessionId: "chat-h",
      groundxUsername: null,
      byoPagesLimit: 100,
      groundxClient: gx.client,
      groundxApiKey: "k",
    });
    expect(reply.mode).toBe("hybrid");
    expect(reply.answer).toMatch(/sample:utility/);
    expect(reply.answer).not.toMatch(/123\.45/); // snippet-less shape
    expect(reply.citations).toEqual([]);
  });

  it("grounded-seam LLM failure → deterministic snippet-less fallback (turn succeeds)", async () => {
    const llm = { forward: vi.fn(async () => new Response("boom", { status: 503 })) };
    const gx = fakeGroundx([{ documentId: "d-1", text: "total is $123.45" }]);
    const reply = await runHybridQuery(makeRequest({ newUserMessage: "where am I?" }), {
      repository: repo,
      chatSessionId: "chat-h",
      groundxUsername: null,
      byoPagesLimit: 100,
      llmClient: llm,
      llmModelId: "m",
      groundxClient: gx.client,
      groundxApiKey: "k",
    });
    expect(reply.mode).toBe("hybrid");
    expect(reply.answer).toMatch(/sample:utility/);
    expect(reply.citations).toEqual([]);
  });

  it("hybrid never injects skill-pack content (fixed productKnowledge: false)", async () => {
    const llm = fakeLlm("ok");
    const gx = fakeGroundx([{ documentId: "d-1", text: "groundx eyelevel xray" }]);
    await runHybridQuery(makeRequest({ newUserMessage: "what do you know about groundx xray?" }), {
      repository: repo,
      chatSessionId: "chat-h",
      groundxUsername: null,
      byoPagesLimit: 100,
      llmClient: llm.client,
      llmModelId: "m",
      groundxClient: gx.client,
      groundxApiKey: "k",
    });
    const body = JSON.parse((llm.forward.mock.calls[0][1] as { body: string }).body);
    expect(body.messages[0].content).not.toContain("GROUNDX KNOWLEDGE");
  });
});

// Carried over from the retired CF-05 suite: saved-schema count still reaches
// the prompt (now inside the WORKSPACE STATE block).
describe("hybrid workspace-state content", () => {
  it("includes saved-schema count for signed-in users in WORKSPACE STATE", async () => {
    const repo = new MemoryAppRepository();
    const now = new Date();
    await repo.upsertChatSession({
      id: "chat-s",
      onboardingSessionId: "onb-s",
      ownerUserId: null,
      ownerAnonId: "anon-1",
      title: "t",
      isOnboarding: true,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    await repo.saveTemplate({
      id: "sch-1",
      kind: "extract",
      groundxUsername: "alice@example.com",
      name: "utility-bill-v2",
      bodyJson: '{"categories":[]}',
      createdAt: now,
      updatedAt: now,
    });
    const forward = vi.fn(async () =>
      new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    await runHybridQuery(
      { newUserMessage: "what can I do", currentEntityKey: null, conversationTail: { messageCount: 0, lastTurnContent: null }, recentViewerEvents: [], intent: null },
      {
        repository: repo,
        chatSessionId: "chat-s",
        groundxUsername: "alice@example.com",
        byoPagesLimit: 100,
        llmClient: { forward },
        llmModelId: "m",
      },
    );
    const body = JSON.parse((forward.mock.calls[0][1] as { body: string }).body);
    expect(body.messages[0].content).toMatch(/1 saved schema/i);
  });
});
