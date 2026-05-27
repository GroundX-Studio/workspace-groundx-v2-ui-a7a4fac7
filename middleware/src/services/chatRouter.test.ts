import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroundXClient, LlmClient } from "../types.js";

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
    expect(calls[0].path).toBe("/search/42");
    expect(calls[0].body).toEqual({ query: "hello", n: 6 });
    expect(calls[0].apiKey).toBe("k");
  });

  it("bucket scope with ONE project id → adds filter: { projectId: P }", async () => {
    const { client, calls } = spyClient();
    await searchGroundX("hello", { kind: "bucket", bucketId: 42, projectIds: ["proj-A"] }, client, "k");
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
    expect(calls[0].path).toBe("/search/99");
    expect(calls[0].body).toEqual({ query: "hello", n: 6 });
  });

  it("documents scope → POST /v1/search/documents + documentIds in body", async () => {
    const { client, calls } = spyClient();
    await searchGroundX("hello", { kind: "documents", documentIds: ["d1", "d2"] }, client, "k");
    expect(calls[0].path).toBe("/search/documents");
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
    expect(calls[0].path).toBe("/search/documents");
    expect(calls[0].body).toEqual({ query: "hello", n: 6 });
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/kind=unknown/));
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
        { kind: "bucket", bucketId: 42, projectIds: ["P1", "P2"] },
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
        { kind: "bucket", bucketId: 42, projectIds: ["solo"] },
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
        { kind: "bucket", bucketId: 42 },
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
        { kind: "bucket", bucketId: 42, projectIds: ["P1"] },
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
        { kind: "group", groupId: 99 },
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
        { kind: "documents", documentIds: ["d1"] },
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
        { kind: "bucket", bucketId: 42, projectIds: ["P1"] },
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
});

// ────────────────────────────────────────────────────────────────────
// CF-07: viewer-intent inference. LLM optionally emits a
// `suggestedIntent` JSON block; client surfaces as a chip ONLY at
// confidence >= 0.85. Never auto-navigates.
// ────────────────────────────────────────────────────────────────────

describe("parseSuggestedIntentFromAnswer (CF-07)", () => {
  it("returns no intent + cleaned answer when no JSON block is present", () => {
    const result = parseSuggestedIntentFromAnswer("Just a plain answer about the bill total.");
    expect(result.suggestedIntent).toBeNull();
    expect(result.cleanedAnswer).toBe("Just a plain answer about the bill total.");
  });

  it("extracts a well-formed suggestedIntent block and strips it from the cleaned answer", () => {
    const raw = [
      "The total is $214.07.",
      "",
      "```json",
      '{"suggestedIntent":{"intent":"show-extract","confidence":0.92,"reason":"They asked about a value extracted from the bill."}}',
      "```",
    ].join("\n");
    const result = parseSuggestedIntentFromAnswer(raw);
    expect(result.suggestedIntent).toEqual({
      intent: "show-extract",
      confidence: 0.92,
      reason: "They asked about a value extracted from the bill.",
    });
    // The fenced block is removed; the user-facing answer is clean.
    expect(result.cleanedAnswer).toBe("The total is $214.07.");
    expect(result.cleanedAnswer).not.toContain("suggestedIntent");
    expect(result.cleanedAnswer).not.toContain("```");
  });

  it("returns null intent (and full answer) when the JSON is malformed", () => {
    const raw = "Answer text.\n\n```json\n{ not valid json at all }\n```";
    const result = parseSuggestedIntentFromAnswer(raw);
    expect(result.suggestedIntent).toBeNull();
    // Cleaned answer just gets a trim — malformed block stays in the
    // raw string so the user can at least see something rather than
    // a silently truncated reply.
    expect(result.cleanedAnswer).toContain("Answer text.");
  });

  it("returns null intent when JSON parses but shape is wrong (missing fields)", () => {
    const raw = 'Answer.\n\n```json\n{"suggestedIntent":{"intent":"x"}}\n```';
    const result = parseSuggestedIntentFromAnswer(raw);
    expect(result.suggestedIntent).toBeNull();
  });

  it("returns null intent when confidence is not a number", () => {
    const raw =
      'Answer.\n\n```json\n{"suggestedIntent":{"intent":"x","confidence":"high","reason":"r"}}\n```';
    const result = parseSuggestedIntentFromAnswer(raw);
    expect(result.suggestedIntent).toBeNull();
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

  it("high-confidence suggestedIntent (≥0.85) → suggestedActions contains a 'suggested-intent' chip with detail", async () => {
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
    const chip = reply.suggestedActions.find((a) => a.key === "suggested-intent");
    expect(chip).toBeDefined();
    expect(chip?.label).toMatch(/extract/i);
    expect(chip?.detail).toMatchObject({
      intent: "show-extract",
      confidence: 0.91,
    });
    // The user-facing answer is the cleaned version (no JSON block).
    expect(reply.answer).toBe("The bill total is $214.07.");
  });

  it("low-confidence suggestedIntent (<0.85) → no 'suggested-intent' chip emitted", async () => {
    const answer = [
      "The bill total is $214.07.",
      "",
      "```json",
      '{"suggestedIntent":{"intent":"show-extract","confidence":0.40,"reason":"Maybe relevant."}}',
      "```",
    ].join("\n");
    const { groundxClient, llmClient } = mkClients(answer);
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      mockMode: false,
    });
    const chip = reply.suggestedActions.find((a) => a.key === "suggested-intent");
    expect(chip).toBeUndefined();
    // Answer is still cleaned even though no chip is emitted.
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

  it("extracts citations AND suggestedIntent from the same JSON block", () => {
    const raw = [
      "Answer body.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":1,"quote":"foo"}],"suggestedIntent":{"intent":"show-extract","confidence":0.9,"reason":"r"}}',
      "```",
    ].join("\n");
    const result = parseGroundedAnswer(raw);
    expect(result.structuredCitations).toEqual([{ documentId: "d1", page: 1, quote: "foo" }]);
    expect(result.suggestedIntent).toMatchObject({ intent: "show-extract", confidence: 0.9 });
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
// UI-01 Phase 2a — propose-schema-field tool. The grounded LLM may
// emit a `proposedSchemaField` entry in its fenced JSON block when the
// user asks to add a field to the schema. The chatRouter validates
// the shape and threads it through `ChatRouterResponse` so the
// frontend can render an Accept/Reject card.
// ────────────────────────────────────────────────────────────────────

describe("parseGroundedAnswer — proposedSchemaField (UI-01 Phase 2a)", () => {
  it("extracts a well-formed proposedSchemaField and strips the block", () => {
    const raw = [
      "I can add a 'total tax' field to the statement category.",
      "",
      "```json",
      '{"proposedSchemaField":{"categoryId":"statement","name":"total_tax","type":"NUMBER","description":"Total tax billed this period."}}',
      "```",
    ].join("\n");
    const result = parseGroundedAnswer(raw);
    expect(result.proposedSchemaField).toEqual({
      categoryId: "statement",
      name: "total_tax",
      type: "NUMBER",
      description: "Total tax billed this period.",
      // proposal-envelope-provenance: parser tags successful parses
      // with versioned provenance for the renderer.
      provenance: { version: "v1", verified: true },
    });
    expect(result.cleanedAnswer).toBe(
      "I can add a 'total tax' field to the statement category.",
    );
    expect(result.cleanedAnswer).not.toContain("proposedSchemaField");
  });

  it("returns null when no JSON block is present", () => {
    const result = parseGroundedAnswer("Plain reply without a fenced block.");
    expect(result.proposedSchemaField).toBeNull();
  });

  it("returns null when proposedSchemaField field is missing in the JSON", () => {
    const raw = 'Body.\n\n```json\n{"somethingElse":1}\n```';
    expect(parseGroundedAnswer(raw).proposedSchemaField).toBeNull();
  });

  it("returns null when proposedSchemaField has wrong shape (missing required fields)", () => {
    const raw =
      'Body.\n\n```json\n{"proposedSchemaField":{"name":"x","type":"NUMBER"}}\n```';
    expect(parseGroundedAnswer(raw).proposedSchemaField).toBeNull();
  });

  it("returns null when proposedSchemaField type is not one of STRING/NUMBER/DATE/BOOLEAN", () => {
    const raw = [
      "Body.",
      "",
      "```json",
      '{"proposedSchemaField":{"categoryId":"c","name":"n","type":"OBJECT","description":"d"}}',
      "```",
    ].join("\n");
    expect(parseGroundedAnswer(raw).proposedSchemaField).toBeNull();
  });

  // ── proposal-envelope-provenance ────────────────────────────────────

  it("attaches provenance = {version: 'v1', verified: true} on a well-formed envelope (proposal-envelope-provenance)", () => {
    const raw = [
      "Adding total tax.",
      "",
      "```json",
      '{"proposedSchemaField":{"version":"v1","categoryId":"statement","name":"total_tax","type":"NUMBER","description":"Total tax billed this period."}}',
      "```",
    ].join("\n");
    const result = parseGroundedAnswer(raw);
    expect(result.proposedSchemaField).not.toBeNull();
    expect(result.proposedSchemaField?.provenance).toEqual({ version: "v1", verified: true });
  });

  it("backfills provenance v1 when the envelope omits the version literal (proposal-envelope-provenance)", () => {
    // Pre-envelope fixtures don't carry `version`. The parser MUST
    // still accept them and tag provenance as v1 so the rendered card
    // shows `envelope verified`.
    const raw = [
      "Adding total tax.",
      "",
      "```json",
      '{"proposedSchemaField":{"categoryId":"statement","name":"total_tax","type":"NUMBER","description":"Total tax billed this period."}}',
      "```",
    ].join("\n");
    const result = parseGroundedAnswer(raw);
    expect(result.proposedSchemaField?.provenance).toEqual({ version: "v1", verified: true });
  });

  it("drops the proposal when categoryId is missing (proposal-envelope-provenance)", () => {
    const raw = [
      "Adding total tax.",
      "",
      "```json",
      '{"proposedSchemaField":{"version":"v1","name":"total_tax","type":"NUMBER","description":"…"}}',
      "```",
    ].join("\n");
    expect(parseGroundedAnswer(raw).proposedSchemaField).toBeNull();
  });

  it("drops the proposal when the version literal is unsupported (proposal-envelope-provenance)", () => {
    const raw = [
      "Adding total tax.",
      "",
      "```json",
      '{"proposedSchemaField":{"version":"v2","categoryId":"statement","name":"total_tax","type":"NUMBER","description":"…"}}',
      "```",
    ].join("\n");
    expect(parseGroundedAnswer(raw).proposedSchemaField).toBeNull();
  });

  it("co-exists with citations + suggestedIntent in the same JSON block", () => {
    const raw = [
      "Adding total tax.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":1,"quote":"Tax: $14"}],"suggestedIntent":{"intent":"edit-schema","confidence":0.9,"reason":"user asked to add a field"},"proposedSchemaField":{"categoryId":"statement","name":"total_tax","type":"NUMBER","description":"Total tax billed this period."}}',
      "```",
    ].join("\n");
    const result = parseGroundedAnswer(raw);
    expect(result.proposedSchemaField).toMatchObject({
      categoryId: "statement",
      name: "total_tax",
      type: "NUMBER",
    });
    expect(result.structuredCitations).toEqual([
      { documentId: "d1", page: 1, quote: "Tax: $14" },
    ]);
    expect(result.suggestedIntent).toMatchObject({ intent: "edit-schema", confidence: 0.9 });
    expect(result.cleanedAnswer).toBe("Adding total tax.");
  });
});

describe("UI-01 Phase 2a — proposedSchemaField threading in runRagPipeline", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  function mkClients(llmAnswer: string): { groundxClient: GroundXClient; llmClient: LlmClient } {
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
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    return { groundxClient, llmClient };
  }

  it("propose-card payload threads through `reply.proposedSchemaField`", async () => {
    const answer = [
      "I can add a 'total tax' field to the statement category.",
      "",
      "```json",
      '{"proposedSchemaField":{"categoryId":"statement","name":"total_tax","type":"NUMBER","description":"Total tax billed this period."}}',
      "```",
    ].join("\n");
    const { groundxClient, llmClient } = mkClients(answer);
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
    });
    expect(reply.answer).toBe("I can add a 'total tax' field to the statement category.");
  });

  it("no propose-card → reply.proposedSchemaField is null", async () => {
    const { groundxClient, llmClient } = mkClients("Just a plain answer about tax.");
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
