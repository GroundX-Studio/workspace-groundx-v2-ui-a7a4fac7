import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GroundXClient, LlmClient } from "../types.js";

import { __clearXrayCache } from "./xrayCache.js";
import {
  classifyChatMode,
  GROUNDED_REFUSAL_PHRASE,
  MAX_SNIPPET_BLOCK_CHARS,
  parseGroundedAnswer,
  routeChat,
  searchGroundX,
  type ChatRouterRequest,
} from "./chatRouter.js";

// Back-compat alias: CF-06 renamed the parser. Keep the old name in
// the test file to make the CF-07 test block read continuously.
const parseSuggestedIntentFromAnswer = parseGroundedAnswer;

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
    // Post-CF-09: the answer is now scenario-specific for known
    // entities. The generic "Mock RAG answer about X" copy only
    // surfaces when the entity has no fixture bundle.
    expect(res.answer).toBeTruthy();
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

  // CF-09 — per-scenario MOCK_MODE fixtures. Each scenario should
  // answer its canonical questions distinctly so MOCK_MODE produces
  // useful dev/QA output instead of "Mock RAG answer about X".
  describe("MOCK_MODE per-scenario fixtures (CF-09)", () => {
    it("Utility scenario → 'what is the bill total' returns a $-bearing answer + utility-bill citation", async () => {
      const res = await routeChat(
        makeRequest({
          newUserMessage: "What is the bill total?",
          currentEntityKey: "sample:utility",
        }),
        { llmClient: fakeLlm, mockMode: true },
      );
      expect(res.mode).toBe("rag");
      expect(res.answer).toMatch(/\$\d+\.?\d*/);
      expect(res.citations[0].documentId).toMatch(/utility/i);
    });

    it("Utility scenario → 'due date' returns a date-shaped answer", async () => {
      const res = await routeChat(
        makeRequest({
          newUserMessage: "When is the due date?",
          currentEntityKey: "sample:utility",
        }),
        { llmClient: fakeLlm, mockMode: true },
      );
      expect(res.answer).toMatch(/due/i);
      // Date format is whatever's in the fixture — assert the answer
      // is scenario-aware (not the generic mock copy).
      expect(res.answer).not.toMatch(/Mock RAG answer/);
    });

    it("Loan scenario → 'DTI' returns a percentage-bearing answer + loan citation", async () => {
      const res = await routeChat(
        makeRequest({
          newUserMessage: "What is the applicant's DTI?",
          currentEntityKey: "sample:loan",
        }),
        { llmClient: fakeLlm, mockMode: true },
      );
      expect(res.answer).toMatch(/\d+\s?%/);
      expect(res.citations[0].documentId).toMatch(/loan/i);
    });

    it("Loan scenario → 'credit score' returns a number in the FICO range", async () => {
      const res = await routeChat(
        makeRequest({
          newUserMessage: "What's the credit score?",
          currentEntityKey: "sample:loan",
        }),
        { llmClient: fakeLlm, mockMode: true },
      );
      // FICO range 300-850; just assert the answer contains a 3-digit
      // score so the fixture stays scenario-flavored.
      expect(res.answer).toMatch(/\b[3-8]\d{2}\b/);
    });

    it("Solar scenario → 'IRR' returns a percentage-bearing answer + solar citation", async () => {
      const res = await routeChat(
        makeRequest({
          newUserMessage: "What is the IRR for the top project?",
          currentEntityKey: "sample:solar",
        }),
        { llmClient: fakeLlm, mockMode: true },
      );
      expect(res.answer.toLowerCase()).toContain("irr");
      expect(res.answer).toMatch(/\d+(\.\d+)?\s?%/);
      expect(res.citations[0].documentId).toMatch(/solar/i);
    });

    it("Solar scenario → 'highest risk' returns a project-named answer", async () => {
      const res = await routeChat(
        makeRequest({
          newUserMessage: "Which project has the highest risk?",
          currentEntityKey: "sample:solar",
        }),
        { llmClient: fakeLlm, mockMode: true },
      );
      expect(res.answer.toLowerCase()).toMatch(/risk/);
      expect(res.answer).not.toMatch(/Mock RAG answer/);
    });

    it("unknown question on a known scenario → still scenario-flavored fallback (mentions the sample)", async () => {
      const res = await routeChat(
        makeRequest({
          newUserMessage: "What's the meaning of life?",
          currentEntityKey: "sample:utility",
        }),
        { llmClient: fakeLlm, mockMode: true },
      );
      // Fallback is OK to be generic but must still mention the sample
      // so dev/QA can tell the routing worked.
      expect(res.answer.toLowerCase()).toMatch(/utility|bill|sample/);
    });

    it("no active entity → generic mock answer (back-compat with pre-CF-09 callers)", async () => {
      const res = await routeChat(
        makeRequest({ newUserMessage: "What's the bill total?" }),
        { llmClient: fakeLlm, mockMode: true },
      );
      // No entity to anchor the fixture lookup → falls back to the
      // generic mock envelope. Pre-CF-09 tests asserted this.
      expect(res.mode).toBe("rag");
      expect(res.answer.toLowerCase()).toContain("mock");
    });

    it("Loan canonical question on a non-Loan scenario does NOT return the Loan answer", async () => {
      // Cross-contamination guard: if the user asks the loan-specific
      // canonical question while viewing the Solar sample, we must
      // NOT serve the loan fixture. Better to serve a scenario-
      // appropriate fallback than to leak the wrong answer.
      const res = await routeChat(
        makeRequest({
          newUserMessage: "What is the applicant's DTI?",
          currentEntityKey: "sample:solar",
        }),
        { llmClient: fakeLlm, mockMode: true },
      );
      // The answer must not contain the loan-specific DTI numeric.
      // Our solar fixture has no DTI question → fallback path.
      // Assertion: the citation is NOT a loan doc.
      expect(res.citations[0]?.documentId ?? "").not.toMatch(/^loan-/i);
    });
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
      samplesBucketId: 28454,
      byoPagesLimit: 100,
    });
    expect(reply.mode).toBe("hybrid");
    expect(reply.answer).toMatch(/sample:utility/);
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0].documentId).toBe("d-1");
    // (WF-06 tiering is RAG-path scoped; hybrid tour-mode citations come from
    // runHybridQuery and stay tier-less → the app defaults them to ambient.)
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
    __clearXrayCache();
    // Quiet the warn-on-unknown-scope log so test output stays clean.
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("bucket scope (no projectIds) → POST /v1/search/{bucketId} with no filter", async () => {
    const { client, calls } = spyClient();
    await searchGroundX("hello", { type: "bucket", bucketId: 42 }, client, "k");
    // First call is the default-relevance search (no `relevance` field).
    expect(calls[0].path).toBe("/search/42");
    expect(calls[0].body).toEqual({ query: "hello", n: 6 });
    expect(calls[0].apiKey).toBe("k");
  });

  it("zero results → retries once with a low relevance floor (extract-indexed-doc rescue)", async () => {
    // spyClient returns empty results, so the default search yields nothing
    // → the retry fires with the fallback floor so JSON-indexed sample docs
    // still ground an answer instead of "no snippets".
    const { client, calls } = spyClient();
    await searchGroundX("what is the total amount", { type: "bucket", bucketId: 42 }, client, "k");
    expect(calls).toHaveLength(2);
    expect(calls[0].body).toEqual({ query: "what is the total amount", n: 6 });
    expect(calls[1].body).toEqual({ query: "what is the total amount", n: 6, relevance: -100 });
  });

  it("non-empty first result → no retry (normal prose docs pay one round-trip)", async () => {
    const calls: Array<{ path: string }> = [];
    const client: GroundXClient = {
      forward: vi.fn(async (path: string) => {
        calls.push({ path });
        return new Response(
          JSON.stringify({ search: { results: [{ documentId: "d-1", text: "Total amount due is $7,613.20." }] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    };
    await searchGroundX("total", { type: "bucket", bucketId: 42 }, client, "k");
    // Only ONE search call (the first pass found results, so no retry). Any
    // extra forward calls are the per-result X-Ray geometry fetch, not a retry.
    expect(calls.filter((c) => c.path.startsWith("/search/"))).toHaveLength(1);
  });

  it("bucket scope with ONE project id → adds filter: { projectId: P }", async () => {
    const { client, calls } = spyClient();
    await searchGroundX("hello", { type: "bucket", bucketId: 42, filter: { projectId: ["proj-A"] } }, client, "k");
    expect(calls[0].path).toBe("/search/42");
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
      { type: "bucket", bucketId: 42, filter: { projectId: ["A", "B", "C"] } },
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
    await searchGroundX("hello", { type: "group", groupId: 99 }, client, "k");
    expect(calls[0].path).toBe("/search/99");
    expect(calls[0].body).toEqual({ query: "hello", n: 6 });
  });

  it("documents scope → POST /v1/search/documents + documentIds in body", async () => {
    const { client, calls } = spyClient();
    await searchGroundX("hello", { type: "documents", documentIds: ["d1", "d2"] }, client, "k");
    expect(calls[0].path).toBe("/search/documents");
    expect(calls[0].body).toEqual({
      query: "hello",
      n: 6,
      documentIds: ["d1", "d2"],
    });
  });

  it("WF-03: reads page + normalized bbox off a result's boundingBoxes/pages", async () => {
    const client: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [
              {
                documentId: "c3bfff49",
                text: "Demand 2,218.75",
                score: 99,
                fileName: "utility-bill-april-2026.pdf",
                boundingBoxes: [
                  { pageNumber: 2, topLeftX: 362, topLeftY: 593, bottomRightX: 1601, bottomRightY: 2031, corrected: false },
                ],
                pages: [{ number: 2, width: 1700, height: 2200 }],
              },
            ],
          },
        }),
      ),
    };
    const results = await searchGroundX("demand charge", { type: "bucket", bucketId: 28454 }, client, "k");
    expect(results).toHaveLength(1);
    expect(results[0].pageNumber).toBe(2);
    expect(results[0].bbox).toBeDefined();
    expect(results[0].bbox!.x).toBeCloseTo(0.213, 2);
    expect(results[0].bbox!.y).toBeCloseTo(0.27, 2);
    expect(results[0].bbox!.w).toBeCloseTo(0.729, 2);
    expect(results[0].bbox!.h).toBeCloseTo(0.654, 2);
  });

  it("WF-03: a result without boundingBoxes ships geometry-less (page 1, no bbox)", async () => {
    const client: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [{ documentId: "flat", text: "t" }] } })),
    };
    const results = await searchGroundX("q", { type: "bucket", bucketId: 1 }, client, "k");
    expect(results[0].pageNumber).toBe(1);
    expect(results[0].bbox).toBeUndefined();
  });

  it("WF-03 fallback: a geometry-less result resolves bbox from the doc's X-Ray", async () => {
    const client: GroundXClient = {
      forward: vi.fn(async (path: string, init: RequestInit & { apiKey: string }) => {
        if (init.method === "GET" && path.includes("/ingest/document/xray/")) {
          return jsonOk({
            documentPages: [{ pageNumber: 2, width: 1700, height: 2200 }],
            chunks: [
              {
                text: "Industrial Electric Demand 125 kW 2,218.75",
                pageNumbers: [2],
                boundingBoxes: [{ pageNumber: 2, topLeftX: 362, topLeftY: 593, bottomRightX: 1601, bottomRightY: 2031 }],
              },
            ],
          });
        }
        return jsonOk({ search: { results: [{ documentId: "c3bfff49", text: "Demand 2,218.75" }] } });
      }),
    };
    const results = await searchGroundX("demand", { type: "bucket", bucketId: 28454 }, client, "k");
    expect(results[0].pageNumber).toBe(2);
    expect(results[0].bbox).toBeDefined();
    expect(results[0].bbox!.x).toBeCloseTo(0.213, 2);
  });

  it("documents scope with empty documentIds throws (programming bug guard)", async () => {
    const { client } = spyClient();
    await expect(
      searchGroundX("hello", { type: "documents", documentIds: [] }, client, "k"),
    ).rejects.toThrow(/at least one documentId/i);
  });

  it("null scope (no derivable scope) → legacy fallback to /v1/search/documents + console.warn", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { client, calls } = spyClient();
    await searchGroundX("hello", null, client, "k");
    expect(calls[0].path).toBe("/search/documents");
    expect(calls[0].body).toEqual({ query: "hello", n: 6 });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no scope/));
  });

  // CF-03 — RBAC + arbitrary metadata filter composition. The
  // BFF derives an RBAC filter from the session (groundxUsername →
  // org → allowed visibility) and passes it alongside the scope. The
  // two compose via `$and` so the GroundX search sees both
  // constraints. Critically, the RBAC filter is ALWAYS server-side
  // — never trusted from the client.
  describe("CF-03 rbacFilter composition", () => {
    it("rbacFilter + bucket+projectIds → filter: $and:[rbacFilter, scopeFilter]", async () => {
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "bucket", bucketId: 42, filter: { projectId: ["P1", "P2"] } },
        client,
        "k",
        { rbacFilter: { orgId: "org-X" } },
      );
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        filter: {
          $and: [
            { orgId: "org-X" },
            { projectId: { $in: ["P1", "P2"] } },
          ],
        },
      });
    });

    it("rbacFilter + bucket+single-projectId → composes via $and", async () => {
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "bucket", bucketId: 42, filter: { projectId: ["solo"] } },
        client,
        "k",
        { rbacFilter: { orgId: "org-X" } },
      );
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        filter: {
          $and: [{ orgId: "org-X" }, { projectId: "solo" }],
        },
      });
    });

    it("rbacFilter alone (no projectIds) → filter = rbacFilter (no $and wrapper)", async () => {
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "bucket", bucketId: 42 },
        client,
        "k",
        { rbacFilter: { orgId: "org-X" } },
      );
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        filter: { orgId: "org-X" },
      });
    });

    it("no rbacFilter → existing scope filter behavior preserved", async () => {
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "bucket", bucketId: 42, filter: { projectId: ["P1"] } },
        client,
        "k",
        { rbacFilter: undefined },
      );
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        filter: { projectId: "P1" },
      });
    });

    it("rbacFilter applied to group scope (additive across all scope kinds)", async () => {
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "group", groupId: 99 },
        client,
        "k",
        { rbacFilter: { tenant: "t-7" } },
      );
      expect(calls[0].path).toBe("/search/99");
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        filter: { tenant: "t-7" },
      });
    });

    it("rbacFilter applied to documents scope", async () => {
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "documents", documentIds: ["d1"] },
        client,
        "k",
        { rbacFilter: { tenant: "t-7" } },
      );
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        documentIds: ["d1"],
        filter: { tenant: "t-7" },
      });
    });

    it("arbitrary metadata filter (not RBAC-specific) composes the same way", async () => {
      // The CF-03 contract is "generic Mongo-style filter field" —
      // RBAC is the headline use case but the same path serves any
      // server-derived metadata constraint (tenant, region, tier, etc.).
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "bucket", bucketId: 42, filter: { projectId: ["P1"] } },
        client,
        "k",
        {
          rbacFilter: {
            $and: [{ region: "us-east-1" }, { tier: { $in: ["pro", "enterprise"] } }],
          },
        },
      );
      // The two $and-wrapped filters compose into a flat outer $and.
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        filter: {
          $and: [
            {
              $and: [{ region: "us-east-1" }, { tier: { $in: ["pro", "enterprise"] } }],
            },
            { projectId: "P1" },
          ],
        },
      });
    });
  });

  // ── B1 inc. 3 — composable `filter` on EVERY scope shape ──────────────
  // The unified ContentScope carries an optional `filter` (project /
  // portfolio / fund / folder filter-fields) on bucket, group, AND
  // documents. searchGroundX compiles it uniformly via the shared
  // compileScopeFilter (was bucket-only / projectIds-only) and composes it
  // with the server-derived rbacFilter via $and. These lock the headline
  // capability for the two shapes the legacy code never filtered.
  describe("scope.filter composable on every shape (B1 inc. 3)", () => {
    it("group scope + filter → body.filter (filter is NOT bucket-only)", async () => {
      const { client, calls } = spyClient();
      await searchGroundX("hello", { type: "group", groupId: 99, filter: { fund: "f3" } }, client, "k");
      expect(calls[0].path).toBe("/search/99");
      expect(calls[0].body).toEqual({ query: "hello", n: 6, filter: { fund: "f3" } });
    });

    it("documents scope + filter → body.filter alongside documentIds", async () => {
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "documents", documentIds: ["d1"], filter: { folder: ["a", "b"] } },
        client,
        "k",
      );
      expect(calls[0].path).toBe("/search/documents");
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        documentIds: ["d1"],
        filter: { folder: { $in: ["a", "b"] } },
      });
    });

    it("bucket scope + multi-field filter → $and of each clause", async () => {
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "bucket", bucketId: 42, filter: { projectId: ["A", "B"], fund: "f3" } },
        client,
        "k",
      );
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        filter: { $and: [{ projectId: { $in: ["A", "B"] } }, { fund: "f3" }] },
      });
    });

    it("scope.filter (non-projectId field) composes with rbacFilter via $and", async () => {
      const { client, calls } = spyClient();
      await searchGroundX(
        "hello",
        { type: "group", groupId: 99, filter: { fund: "f3" } },
        client,
        "k",
        { rbacFilter: { orgId: "org-X" } },
      );
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        filter: { $and: [{ orgId: "org-X" }, { fund: "f3" }] },
      });
    });

    it("null scope still composes rbacFilter alone (doc-wide fallback, no scopeFilter)", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { client, calls } = spyClient();
      await searchGroundX("hello", null, client, "k", { rbacFilter: { orgId: "org-X" } });
      expect(calls[0].path).toBe("/search/documents");
      expect(calls[0].body).toEqual({ query: "hello", n: 6, filter: { orgId: "org-X" } });
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/no scope/));
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// CF-07: viewer-intent inference. LLM optionally emits a
// `suggestedIntent` JSON block; client surfaces as a chip ONLY at
// confidence >= 0.85. Never auto-navigates.
// ────────────────────────────────────────────────────────────────────

describe("parseGroundedAnswer (post-A.5: suggestedIntent retired)", () => {
  it("returns no intent + cleaned answer when no JSON block is present", () => {
    const result = parseSuggestedIntentFromAnswer("Just a plain answer about the bill total.");
    expect(result.suggestedIntent).toBeNull();
    expect(result.cleanedAnswer).toBe("Just a plain answer about the bill total.");
  });

  it("ignores fenced suggestedIntent blocks (the path retired in follow-up A.5)", () => {
    const raw = [
      "The total is $214.07.",
      "",
      "```json",
      '{"suggestedIntent":{"intent":"show-extract","confidence":0.92,"reason":"They asked about a value extracted from the bill."}}',
      "```",
    ].join("\n");
    const result = parseSuggestedIntentFromAnswer(raw);
    // Post-A.5: the fenced JSON is still stripped from the cleaned
    // answer (the parser handles citations), but `suggestedIntent`
    // is no longer extracted. LLMs that emit the legacy shape get
    // their suggestion silently dropped — they should call the
    // `suggest_intent` tool instead.
    expect(result.suggestedIntent).toBeNull();
    expect(result.cleanedAnswer).toBe("The total is $214.07.");
    expect(result.cleanedAnswer).not.toContain("```");
  });

  it("returns null intent (and full answer) when the JSON is malformed", () => {
    const raw = "Answer text.\n\n```json\n{ not valid json at all }\n```";
    const result = parseSuggestedIntentFromAnswer(raw);
    expect(result.suggestedIntent).toBeNull();
    expect(result.cleanedAnswer).toContain("Answer text.");
  });
});

describe("CF-07 viewer-intent chip gating in runRagPipeline", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  function mkClients(llmAnswer: string): {
    groundxClient: GroundXClient;
    llmClient: LlmClient;
  } {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [{ documentId: "d1", pageNumber: 3, text: "the bill total is $214.07" }],
          },
        }),
      ),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    return { groundxClient, llmClient };
  }

  it("legacy fenced suggestedIntent block is silently ignored (A.5 retired the path)", async () => {
    const answer = [
      "The bill total is $214.07.",
      "",
      "```json",
      '{"suggestedIntent":{"intent":"show-extract","confidence":0.91,"reason":"Open the extract to compare line items."}}',
      "```",
    ].join("\n");
    const { groundxClient, llmClient } = mkClients(answer);
    const reply = await routeChat(makeRequest({ newUserMessage: "What is the total?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    // Post-A.5: legacy chip key is gone. The LLM should call the
    // `suggest_intent` tool instead, which lands on
    // `suggestedActions[]` with key `tool:suggest_intent`.
    expect(reply.suggestedActions.find((a) => a.key === "suggested-intent")).toBeUndefined();
    // The user-facing answer is still cleaned (citations branch
    // still strips the fenced block).
    expect(reply.answer).toBe("The bill total is $214.07.");
  });

  it("no suggestedIntent block in the LLM answer → no chip; existing 'show-source' chip still present", async () => {
    const { groundxClient, llmClient } = mkClients("Plain grounded answer about the bill.");
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.suggestedActions.find((a) => a.key === "suggested-intent")).toBeUndefined();
    expect(reply.suggestedActions.find((a) => a.key === "show-source")).toBeDefined();
  });

  it("malformed suggestedIntent JSON → no chip, no throw (defensive fallback)", async () => {
    const answer = "Answer.\n\n```json\n{ broken json\n```";
    const { groundxClient, llmClient } = mkClients(answer);
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.suggestedActions.find((a) => a.key === "suggested-intent")).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// CF-06 (code side): token-budget guard + structured citations +
// refusal calibration. Eval set is split off as CF-06a.
// ────────────────────────────────────────────────────────────────────

describe("parseGroundedAnswer — structured citations (CF-06)", () => {
  it("extracts a well-formed citations array and strips the block", () => {
    const raw = [
      "The total is $214.07.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":3,"quote":"total $214.07"},{"documentId":"d1","page":4,"quote":"due 15th"}]}',
      "```",
    ].join("\n");
    const result = parseGroundedAnswer(raw);
    expect(result.structuredCitations).toEqual([
      { documentId: "d1", page: 3, quote: "total $214.07" },
      { documentId: "d1", page: 4, quote: "due 15th" },
    ]);
    expect(result.cleanedAnswer).toBe("The total is $214.07.");
  });

  it("extracts citations and ignores suggestedIntent in the same block (A.5)", () => {
    const raw = [
      "Answer body.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":1,"quote":"foo"}],"suggestedIntent":{"intent":"show-extract","confidence":0.9,"reason":"r"}}',
      "```",
    ].join("\n");
    const result = parseGroundedAnswer(raw);
    expect(result.structuredCitations).toEqual([{ documentId: "d1", page: 1, quote: "foo" }]);
    // Post-A.5: suggestedIntent always returns null; LLMs should
    // call the `suggest_intent` tool instead.
    expect(result.suggestedIntent).toBeNull();
  });

  it("returns null citations when JSON parses but citations field is missing", () => {
    const raw = 'Body.\n\n```json\n{"somethingElse":1}\n```';
    expect(parseGroundedAnswer(raw).structuredCitations).toBeNull();
  });

  it("filters out malformed citation entries (missing fields, wrong types)", () => {
    const raw = [
      "Body.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":1,"quote":"ok"},{"documentId":42,"page":2,"quote":"bad"},{"page":3,"quote":"missing-doc"}]}',
      "```",
    ].join("\n");
    const result = parseGroundedAnswer(raw);
    expect(result.structuredCitations).toEqual([
      { documentId: "d1", page: 1, quote: "ok" },
    ]);
  });

  it("returns null citations when malformed JSON in the block", () => {
    const raw = "Body.\n\n```json\n{ not json\n```";
    expect(parseGroundedAnswer(raw).structuredCitations).toBeNull();
  });
});

describe("CF-06 token-budget guard in callGroundedLlm", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("snippet block fed to the LLM stays under MAX_SNIPPET_BLOCK_CHARS even with many long snippets", async () => {
    // 12 snippets × 600 chars each = ~7200 chars. Cap is 4800.
    const longText = "x".repeat(600);
    const results = Array.from({ length: 12 }, (_, i) => ({
      documentId: `d${i}`,
      pageNumber: i + 1,
      text: longText,
    }));
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results } })),
    };
    const llmForward = vi.fn(async () =>
      jsonOk({ choices: [{ message: { content: "ok" } }] }),
    );
    const llmClient: LlmClient = { forward: llmForward };

    await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });

    const body = JSON.parse((llmForward.mock.calls[0][1] as { body: string }).body);
    const userContent = body.messages.find((m: { role: string }) => m.role === "user").content;
    // The snippet block portion sits inside the user message. The cap
    // applies to the snippet block; the question + scaffolding adds
    // a small amount on top. Assert the user content is comfortably
    // within cap + 500 chars of overhead.
    expect(userContent.length).toBeLessThanOrEqual(MAX_SNIPPET_BLOCK_CHARS + 500);
    expect(MAX_SNIPPET_BLOCK_CHARS).toBeGreaterThan(1000); // sanity
  });

  it("drops trailing snippets when the cap is hit (keeps the highest-priority ones)", async () => {
    const longText = "x".repeat(800);
    const results = Array.from({ length: 8 }, (_, i) => ({
      documentId: `doc-${i}`,
      pageNumber: i + 1,
      text: longText,
    }));
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results } })),
    };
    const llmForward = vi.fn(async () =>
      jsonOk({ choices: [{ message: { content: "ok" } }] }),
    );
    const llmClient: LlmClient = { forward: llmForward };

    await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });

    const body = JSON.parse((llmForward.mock.calls[0][1] as { body: string }).body);
    const userContent = body.messages.find((m: { role: string }) => m.role === "user").content;
    // The first snippet (`doc-0`) is preserved; the last (`doc-7`)
    // gets dropped — assert the kept-then-dropped contract.
    expect(userContent).toContain("doc=doc-0");
    expect(userContent).not.toContain("doc=doc-7");
  });
});

describe("CF-06 refusal calibration in callGroundedLlm", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("system prompt forbids fabrication + handles greetings vs. content separately", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({ search: { results: [] } }),
      ),
    };
    const llmForward = vi.fn(async () =>
      jsonOk({ choices: [{ message: { content: "ok" } }] }),
    );
    const llmClient: LlmClient = { forward: llmForward };
    await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    const body = JSON.parse((llmForward.mock.calls[0][1] as { body: string }).body);
    const systemContent = body.messages.find((m: { role: string }) => m.role === "system").content;
    // No-fabrication invariants — phrased flexibly so the prompt can
    // evolve without rewriting tests on every tone pass.
    expect(systemContent).toMatch(/don't invent|do not invent|don't fabricat/i);
    expect(systemContent).toMatch(/general knowledge/i);
    // Three-mode behavior — greetings/meta turns are NOT refusals.
    expect(systemContent).toMatch(/greeting|hello|hi/i);
  });

  // Snippet-rereading nudge (2026-05-28). The "due date" probe in the
  // Option-A validation showed the LLM saying "no snippets" even when
  // a snippet contained `"due_date": "2025-07-30"` as a JSON field.
  // The prompt must explicitly tell the model to quote JSON-field
  // values directly when they answer the question.
  it("system prompt instructs the model to quote JSON-field values from snippets when present", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [] } })),
    };
    const llmForward = vi.fn(async () =>
      jsonOk({ choices: [{ message: { content: "ok" } }] }),
    );
    const llmClient: LlmClient = { forward: llmForward };
    await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    const body = JSON.parse((llmForward.mock.calls[0][1] as { body: string }).body);
    const systemContent = body.messages.find((m: { role: string }) => m.role === "system").content;
    expect(systemContent).toMatch(/json field|json key/i);
    expect(systemContent).toMatch(/quote/i);
  });

  it("when LLM uses the refusal phrase, it passes through to the user unchanged", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({ search: { results: [{ documentId: "d1", pageNumber: 1, text: "irrelevant" }] } }),
      ),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        jsonOk({ choices: [{ message: { content: GROUNDED_REFUSAL_PHRASE } }] }),
      ),
    };
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.answer).toBe(GROUNDED_REFUSAL_PHRASE);
  });
});

describe("CF-06 structured citations wired into runRagPipeline", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("when LLM emits valid structured citations, reply.citations is the LLM-selected subset", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [
              { documentId: "d1", pageNumber: 3, text: "the bill total is $214.07" },
              { documentId: "d1", pageNumber: 4, text: "the due date is the 15th" },
              { documentId: "d2", pageNumber: 1, text: "unrelated content" },
            ],
          },
        }),
      ),
    };
    const llmAnswer = [
      "The total is $214.07.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":3,"quote":"total is $214.07"}]}',
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    // Only the cite the LLM actually used.
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0]).toMatchObject({ documentId: "d1", page: 3 });
    expect(reply.citations[0].snippet).toMatch(/total is \$214\.07/);
    // The cleaned answer has the JSON block stripped.
    expect(reply.answer).toBe("The total is $214.07.");
  });

  it("drops LLM citations that reference a documentId not in the snippet set (no inventing refs)", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: { results: [{ documentId: "d1", pageNumber: 1, text: "real snippet" }] },
        }),
      ),
    };
    const llmAnswer = [
      "Answer.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":1,"quote":"q1"},{"documentId":"INVENTED","page":99,"quote":"made up"}]}',
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    // Only the doc that actually exists in the snippet set.
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0].documentId).toBe("d1");
  });

  it("when LLM emits NO citations block, falls back to the GroundX-derived citations", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [
              { documentId: "d1", pageNumber: 1, text: "a" },
              { documentId: "d2", pageNumber: 2, text: "b" },
            ],
          },
        }),
      ),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        jsonOk({ choices: [{ message: { content: "Plain answer with no JSON block." } }] }),
      ),
    };
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.citations).toHaveLength(2);
    expect(reply.citations.map((c) => c.documentId).sort()).toEqual(["d1", "d2"]);
  });
});

// ────────────────────────────────────────────────────────────────────
// Post-A.5 (follow-up 2026-05-28) — the fenced-JSON
// `proposedSchemaField` path is RETIRED. The grounded LLM is now
// expected to call the `propose_schema_field` tool instead, which the
// chat router routes onto `reply.suggestedActions[]` (tool:* chip) AND
// mirrors onto `reply.proposedSchemaField` for one-release
// back-compat with consumers that still read the legacy field.
//
// The original UI-01 Phase 2a parser tests below have been pruned to
// pin the new behavior: the parser always returns null for
// `proposedSchemaField` regardless of fenced-JSON content. The
// tool-call path is exercised separately in the Phase 8 +
// follow-up B.1 tests.
// ────────────────────────────────────────────────────────────────────

describe("parseGroundedAnswer — proposedSchemaField is ignored post-A.5", () => {
  it("returns null even when a well-formed proposedSchemaField appears in the fenced block", () => {
    const raw = [
      "I can add a 'total tax' field.",
      "",
      "```json",
      '{"proposedSchemaField":{"categoryId":"statement","name":"total_tax","type":"NUMBER","description":"Total tax."}}',
      "```",
    ].join("\n");
    const result = parseGroundedAnswer(raw);
    expect(result.proposedSchemaField).toBeNull();
    // The fenced block is still stripped from the user-facing answer
    // (the parser still handles citations).
    expect(result.cleanedAnswer).toBe("I can add a 'total tax' field.");
  });

  it("returns null when no JSON block is present", () => {
    expect(parseGroundedAnswer("Plain reply.").proposedSchemaField).toBeNull();
  });
});

describe("proposedSchemaField via propose_schema_field tool call (A.4 back-compat shim)", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  function mkClientsWithTool(
    llmAnswer: string,
    toolCalls: { name: string; arguments: Record<string, unknown> }[],
  ): { groundxClient: GroundXClient; llmClient: LlmClient } {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [{ documentId: "utility-bill-2026-04", pageNumber: 1, text: "Tax: $14" }],
          },
        }),
      ),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        jsonOk({
          choices: [
            {
              message: {
                content: llmAnswer,
                tool_calls: toolCalls.map((tc, idx) => ({
                  id: `call_${idx}`,
                  type: "function",
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                })),
              },
            },
          ],
        }),
      ),
    };
    return { groundxClient, llmClient };
  }

  it("LLM calling `propose_schema_field` populates reply.proposedSchemaField via shim", async () => {
    const { groundxClient, llmClient } = mkClientsWithTool(
      "I can add a 'total tax' field.",
      [
        {
          name: "propose_schema_field",
          arguments: {
            categoryId: "statement",
            name: "total_tax",
            type: "NUMBER",
            description: "Total tax billed this period.",
          },
        },
      ],
    );
    const reply = await routeChat(
      makeRequest({ newUserMessage: "Can you add a field for total tax?" }),
      {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
        mockMode: false,
      },
    );
    expect(reply.proposedSchemaField).toMatchObject({
      categoryId: "statement",
      name: "total_tax",
      type: "NUMBER",
      provenance: { version: "v1", verified: true },
    });
    // Same payload also lands on suggestedActions[] as a chip.
    const chip = reply.suggestedActions.find((a) => a.key === "tool:propose_schema_field");
    expect(chip).toBeDefined();
  });

  it("no propose tool call → reply.proposedSchemaField is null", async () => {
    const { groundxClient, llmClient } = mkClientsWithTool(
      "Just a plain answer about tax.",
      [],
    );
    const reply = await routeChat(
      makeRequest({ newUserMessage: "What is the tax?" }),
      {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
        mockMode: false,
      },
    );
    expect(reply.proposedSchemaField).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────
// _debug payload — dev-only diagnostic plumbing.
//
// Regression class: the "I don't have any snippets" bug was invisible
// to the user because the only place the GroundX request shape and
// the LLM dispatch lived was the middleware terminal logs. The
// `_debug` payload moves that into the chat reply itself so browser
// DevTools sees what was sent + what came back. These tests pin the
// contract so a future refactor can't silently drop the payload (the
// kind of "wired but disconnected" gap Rule 9 closure exists to
// catch).
//
// The payload is gated on `NODE_ENV !== "production"`. In prod the
// `_debug` field must be absent so the bytes don't ship to customers.
// ────────────────────────────────────────────────────────────────────
describe("_debug payload (dev-only visibility into RAG pipeline)", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  function mkClients(): { groundxClient: GroundXClient; llmClient: LlmClient } {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [
              { documentId: "d-1", pageNumber: 3, text: "the bill total is $214.07", fileName: "utility.pdf", score: 0.92 },
              { documentId: "d-2", pageNumber: 7, text: "due date is March 15", fileName: "utility.pdf", score: 0.81 },
            ],
          },
        }),
      ),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        jsonOk({ choices: [{ message: { content: "The total is $214.07." } }] }),
      ),
    };
    return { groundxClient, llmClient };
  }

  // Save/restore NODE_ENV around the "production omits _debug" test
  // so other test files don't see a deleted/changed value (vitest
  // shares process.env across files in the same worker).
  let savedNodeEnv: string | undefined;
  beforeEach(() => {
    savedNodeEnv = process.env.NODE_ENV;
  });
  afterEach(() => {
    if (savedNodeEnv === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      process.env.NODE_ENV = savedNodeEnv;
    }
  });

  it("attaches _debug.groundx (query, path, n, filter, resultCount, topSnippets) on a live RAG reply", async () => {
    const { groundxClient, llmClient } = mkClients();
    const reply = await routeChat(makeRequest({ newUserMessage: "what is the bill total?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply._debug).toBeDefined();
    expect(reply._debug?.mode).toBe("rag");
    expect(reply._debug?.groundx).not.toBeNull();
    expect(reply._debug?.groundx?.path).toBe("/search/42");
    expect(reply._debug?.groundx?.query).toBe("what is the bill total?");
    expect(reply._debug?.groundx?.n).toBe(6);
    expect(reply._debug?.groundx?.resultCount).toBe(2);
    // topSnippets is capped at 3 and truncates text — verify shape.
    expect(reply._debug?.groundx?.topSnippets).toHaveLength(2);
    expect(reply._debug?.groundx?.topSnippets[0]).toMatchObject({
      documentId: "d-1",
      fileName: "utility.pdf",
      score: 0.92,
    });
    expect(reply._debug?.groundx?.topSnippets[0].text).toContain("$214.07");
  });

  it("attaches _debug.llm (model, char counts) on a live RAG reply", async () => {
    const { groundxClient, llmClient } = mkClients();
    const reply = await routeChat(makeRequest({ newUserMessage: "what is the bill total?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "claude-test-model",
      mockMode: false,
    });
    expect(reply._debug?.llm).not.toBeNull();
    expect(reply._debug?.llm?.model).toBe("claude-test-model");
    // snippetBlockChars > 0 → confirms snippets actually reached the
    // LLM. resultCount > 0 with snippetBlockChars === 0 would be a
    // canary for the upstream "lost in transit" bug class.
    expect(reply._debug?.llm?.snippetBlockChars).toBeGreaterThan(0);
    expect(reply._debug?.llm?.userContentChars).toBeGreaterThan(0);
    expect(reply._debug?.llm?.systemChars).toBeGreaterThan(0);
    expect(reply._debug?.llm?.answerChars).toBe("The total is $214.07.".length);
  });

  it("propagates scope.kind + bucketId into _debug.scope (bucket scope)", async () => {
    const { groundxClient, llmClient } = mkClients();
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 28454,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply._debug?.scope).toMatchObject({ type: "bucket", bucketId: 28454 });
  });

  it("_debug.groundx.resultCount === 0 surfaces the 'GroundX returned nothing' failure mode", async () => {
    // This is the exact failure the user hit live: chat says "I
    // don't have any snippets" → `_debug.groundx.resultCount === 0`
    // → user sees in browser DevTools that the GroundX call returned
    // empty, not that the LLM hallucinated a refusal.
    const emptyGroundx: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [] } })),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: "No snippets." } }] })),
    };
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient: emptyGroundx,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply._debug?.groundx?.resultCount).toBe(0);
    expect(reply._debug?.groundx?.topSnippets).toHaveLength(0);
    // snippetBlockChars MUST stay populated (it's the "what reached
    // the LLM" measurement) — an empty block is still a measurable
    // event, not a missing field.
    expect(typeof reply._debug?.llm?.snippetBlockChars).toBe("number");
  });

  it("omits _debug entirely in production (NODE_ENV === 'production')", async () => {
    process.env.NODE_ENV = "production";
    const { groundxClient, llmClient } = mkClients();
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply._debug).toBeUndefined();
  });
});

// ── widget-llm-integration Phase 5 — function-calling round-trip ────────
//
// These tests pin the end-to-end shape:
//   1. The chat router sends a `tools` array (in OpenAI shape) on the
//      LLM request, derived from the server tool catalog
//   2. When the LLM returns `tool_calls[]`, the router validates each
//      against the tool's Zod schema
//   3. Successful calls push onto `reply.intents[]` (each carrying
//      name + arguments + the constructed CanvasIntent payload)
//   4. Failed calls push onto `reply.toolFailures[]` with a reason
//   5. The catalog is filtered by the request's `activeStepKind`
describe("Phase 5 — function-calling tool round-trip", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  function mkClients(
    llmAnswer: string,
    toolCalls: { id?: string; name: string; arguments: Record<string, unknown> }[] = [],
  ): { groundxClient: GroundXClient; llmClient: LlmClient; llmForward: ReturnType<typeof vi.fn> } {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [{ documentId: "doc-1", pageNumber: 1, text: "snippet text" }],
          },
        }),
      ),
    };
    const llmForward = vi.fn(async () =>
      jsonOk({
        choices: [
          {
            message: {
              content: llmAnswer,
              tool_calls: toolCalls.map((tc, idx) => ({
                id: tc.id ?? `call_${idx}`,
                type: "function",
                function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
              })),
            },
          },
        ],
      }),
    );
    const llmClient: LlmClient = { forward: llmForward };
    return { groundxClient, llmClient, llmForward };
  }

  it("LLM returns one valid tool_call → reply.intents[] carries the constructed CanvasIntent", async () => {
    const { groundxClient, llmClient } = mkClients("Sure, opening the doc.", [
      { name: "open_document", arguments: { documentId: "doc-abc", page: 5 } },
    ]);
    const reply = await routeChat(makeRequest({ newUserMessage: "show me doc-abc page 5" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.intents).toHaveLength(1);
    expect(reply.intents[0]).toMatchObject({
      name: "open_document",
      arguments: { documentId: "doc-abc", page: 5 },
      intent: { kind: "highlightCitation", documentId: "doc-abc", page: 5 },
    });
    expect(reply.toolFailures).toEqual([]);
  });

  it("optional arg defaults are filled by the handler (open_document page → 1)", async () => {
    const { groundxClient, llmClient } = mkClients("Opening doc.", [
      { name: "open_document", arguments: { documentId: "doc-abc" } },
    ]);
    const reply = await routeChat(makeRequest({ newUserMessage: "show doc-abc" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.intents[0].intent).toMatchObject({
      kind: "highlightCitation",
      documentId: "doc-abc",
      page: 1,
    });
  });

  it("Bad tool arguments → toolFailures[] (not intents[]); other calls still process", async () => {
    const { groundxClient, llmClient } = mkClients("Mixed reply.", [
      { name: "open_document", arguments: { documentId: 42 } }, // wrong type
      { name: "jump_to_page", arguments: { documentId: "doc-z", page: 3 } },
    ]);
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.intents).toHaveLength(1);
    expect(reply.intents[0].name).toBe("jump_to_page");
    expect(reply.toolFailures).toHaveLength(1);
    expect(reply.toolFailures[0].name).toBe("open_document");
    expect(reply.toolFailures[0].reason).toMatch(/documentId/i);
  });

  it("Unknown tool name → toolFailures[] with a clear reason", async () => {
    const { groundxClient, llmClient } = mkClients("Got an unknown one.", [
      { name: "bogus_tool", arguments: { x: 1 } },
    ]);
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.intents).toEqual([]);
    expect(reply.toolFailures).toEqual([
      expect.objectContaining({ name: "bogus_tool", reason: expect.stringMatching(/unknown/i) }),
    ]);
  });

  it("LLM emits no tool_calls → intents[] + toolFailures[] are both empty arrays", async () => {
    const { groundxClient, llmClient } = mkClients("Just an answer, no tools used.", []);
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.intents).toEqual([]);
    expect(reply.toolFailures).toEqual([]);
  });

  it("Catalog is included on the LLM request as OpenAI `tools` array", async () => {
    const { groundxClient, llmClient, llmForward } = mkClients("Answer.", []);
    await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(llmForward).toHaveBeenCalledTimes(1);
    const body = JSON.parse((llmForward.mock.calls[0][1] as RequestInit).body as string);
    expect(Array.isArray(body.tools)).toBe(true);
    expect(body.tools.length).toBeGreaterThan(0);
    expect(body.tools[0].type).toBe("function");
    expect(body.tools[0].function.name).toMatch(/^[a-z][a-z0-9_]*$/);
  });

  it("activeStepKind filters the catalog sent to the LLM", async () => {
    const { groundxClient, llmClient, llmForward } = mkClients("Answer.", []);
    await routeChat(
      makeRequest({ newUserMessage: "Q", activeStepKind: "report" }),
      {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
        mockMode: false,
      },
    );
    const body = JSON.parse((llmForward.mock.calls[0][1] as RequestInit).body as string);
    // `report` step doesn't expose PdfViewer's scoped tools, but it DOES
    // expose the smart-report tool surface (2026-05-29-smart-report-screen
    // Phase 5 — render/edit/pin + section-mutation tools, all scoped to the
    // `report` step) PLUS the universal/unscoped tools (suggest_intent +
    // commit_gate / dismiss_gate / book_call).
    const toolNames = (body.tools as Array<{ function: { name: string } }>)
      .map((t) => t.function.name)
      .sort();
    expect(toolNames).toEqual([
      "accept_report_section",
      "book_call",
      "commit_gate",
      "delete_report_section",
      "dismiss_gate",
      "edit_report_section",
      "pin_to_report",
      "propose_report_section",
      "reject_report_section",
      "show_smart_report_edit",
      "show_smart_report_render",
      "suggest_intent",
    ]);
  });
});

// ── widget-llm-integration Phase 8 — category-aware routing ────────────
//
// Per design.md §C, mutate-category tool calls require user confirmation
// before they take effect. They MUST land on `reply.suggestedActions[]`
// (rendered as a chip by SuggestedActionChips) rather than
// `reply.intents[]` (which the orchestrator auto-dispatches).
//
// Read-category routing from Phase 5 stays intact — the existing
// `open_document` / `jump_to_page` tests above still pass.
describe("Phase 8 — category-aware mutate-tool routing", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  function mkClients(
    llmAnswer: string,
    toolCalls: { id?: string; name: string; arguments: Record<string, unknown> }[] = [],
  ): { groundxClient: GroundXClient; llmClient: LlmClient } {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [{ documentId: "doc-1", pageNumber: 1, text: "snippet text" }],
          },
        }),
      ),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        jsonOk({
          choices: [
            {
              message: {
                content: llmAnswer,
                tool_calls: toolCalls.map((tc, idx) => ({
                  id: tc.id ?? `call_${idx}`,
                  type: "function",
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                })),
              },
            },
          ],
        }),
      ),
    };
    return { groundxClient, llmClient };
  }

  // Inject a synthetic mutate-category tool via vi.spyOn on the
  // catalog's `getServerTool`. Lets the routing logic run end-to-end
  // without polluting the production catalog with a fixture-only tool.
  async function withMutateTool(
    name: string,
    test: () => Promise<void>,
  ): Promise<void> {
    const toolCatalog = await import("./toolCatalog.js");
    const actualGet = toolCatalog.getServerTool;
    const mutateProbe = {
      name,
      description:
        "Mutate-category probe. Use when verifying Phase 8 category-aware routing.",
      category: "mutate" as const,
      inputSchema: (await import("zod")).z.object({
        fieldId: (await import("zod")).z.string().describe("opaque id"),
      }),
      intentBuilder: (input: { fieldId: string }) => ({
        kind: "highlightCitation",
        documentId: input.fieldId,
        page: 1,
      }),
    };
    const spy = vi.spyOn(toolCatalog, "getServerTool").mockImplementation((n: string) => {
      if (n === name) return mutateProbe;
      return actualGet(n);
    });
    try {
      await test();
    } finally {
      spy.mockRestore();
    }
  }

  it("mutate-category tool call lands on suggestedActions[] (not intents[])", async () => {
    await withMutateTool("accept_probe", async () => {
      const { groundxClient, llmClient } = mkClients("Sure — propose accepted.", [
        { name: "accept_probe", arguments: { fieldId: "field-xyz" } },
      ]);
      const reply = await routeChat(makeRequest({ newUserMessage: "accept it" }), {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
        mockMode: false,
      });
      // Should NOT auto-dispatch via intents[].
      expect(reply.intents).toEqual([]);
      // Should appear as a confirmable chip.
      const chip = reply.suggestedActions.find((a) => a.key === "tool:accept_probe");
      expect(chip).toBeDefined();
      expect(chip?.detail).toMatchObject({
        name: "accept_probe",
        arguments: { fieldId: "field-xyz" },
        intent: { kind: "highlightCitation", documentId: "field-xyz", page: 1 },
      });
    });
  });

  it("read-category routing from Phase 5 still routes to intents[]", async () => {
    const { groundxClient, llmClient } = mkClients("Opening doc.", [
      { name: "open_document", arguments: { documentId: "doc-abc", page: 4 } },
    ]);
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    expect(reply.intents.length).toBe(1);
    expect(reply.intents[0].name).toBe("open_document");
    // No tool:* chip — read-category tools don't surface a confirmable chip.
    expect(reply.suggestedActions.find((a) => a.key.startsWith("tool:"))).toBeUndefined();
  });

  it("mutate + read tool calls in the same reply split correctly", async () => {
    await withMutateTool("accept_probe", async () => {
      const { groundxClient, llmClient } = mkClients("Mixed.", [
        { name: "open_document", arguments: { documentId: "doc-1", page: 2 } },
        { name: "accept_probe", arguments: { fieldId: "field-1" } },
      ]);
      const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
        mockMode: false,
      });
      expect(reply.intents.length).toBe(1);
      expect(reply.intents[0].name).toBe("open_document");
      expect(reply.suggestedActions.some((a) => a.key === "tool:accept_probe")).toBe(true);
    });
  });

  it("mutate-tool chip label is the tool description's first sentence", async () => {
    await withMutateTool("accept_probe", async () => {
      const { groundxClient, llmClient } = mkClients("ok", [
        { name: "accept_probe", arguments: { fieldId: "x" } },
      ]);
      const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
        mockMode: false,
      });
      const chip = reply.suggestedActions.find((a) => a.key === "tool:accept_probe");
      expect(chip?.label).toMatch(/Mutate-category probe/);
    });
  });
});
