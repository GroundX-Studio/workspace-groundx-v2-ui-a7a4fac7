import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { GroundXClient, LlmClient } from "../types.js";
import type { WidgetRole } from "@groundx/shared";

import { SERVER_TOOL_CATALOG, toolsForStep, UNKNOWN_VIEWER_STEP } from "./toolCatalog.js";
import { __clearXrayCache } from "./xrayCache.js";
import { __clearWordMapCache } from "./wordMapCache.js";
import wordMapFixture from "./wordMap.fixture.json" with { type: "json" };
import type { WordMap } from "./citationGeometry.js";
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
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  /**
   * Build injected fake clients for the live RAG path (2026-06-01-retire-mock-mode
   * re-grounded these off the deleted `chatMocks` canned responses onto the live
   * `runRagPipeline` with fakes at the dependency seam). `searchDoc` controls the
   * document the canned search hit cites; `llmAnswer` is the grounded body the
   * fake LLM emits (with a `citations` JSON block so the RAG parser produces a
   * real citation tier).
   */
  function liveRagClients(searchDoc: string, llmBody: string): {
    groundxClient: GroundXClient;
    llmClient: LlmClient;
  } {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({ search: { results: [{ documentId: searchDoc, pageNumber: 1, text: llmBody }] } }),
      ),
    };
    const llmAnswer = [
      llmBody,
      "",
      "```json",
      `{"citations":[{"documentId":"${searchDoc}","page":1,"quote":${JSON.stringify(llmBody.slice(0, 40))}}]}`,
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    return { groundxClient, llmClient };
  }

  function liveRagDeps(searchDoc: string, llmBody: string) {
    const { groundxClient, llmClient } = liveRagClients(searchDoc, llmBody);
    return {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 28454,
      llmModelId: "test-model",
    };
  }

  it("live RAG returns a grounded rag envelope with a citation", async () => {
    const res = await routeChat(
      makeRequest({ newUserMessage: "what is the total amount due?", currentEntityKey: "sample:utility" }),
      liveRagDeps("utility-bill-2026-04", "The total amount due is $214.07."),
    );
    expect(res.mode).toBe("rag");
    expect(res.answer).toBeTruthy();
    expect(res.citations).toHaveLength(1);
    expect(res.suggestedActions.length).toBeGreaterThan(0);
  });

  it("live RAG mode requires GroundX client + api key (live wiring)", async () => {
    // The failure mode is a typed configuration error when deps are missing —
    // there is no mock path to fall back to.
    await expect(
      routeChat(makeRequest({ newUserMessage: "what is the total amount due?" }), {
        llmClient: fakeLlm,
      }),
    ).rejects.toThrow(/groundxClient/);
  });

  // The live RAG path serves whatever the injected LLM grounds against the
  // injected search hit. Re-grounded off the deleted CF-09 per-scenario
  // chatMocks fixtures: instead of asserting canned scenario copy, we inject a
  // scenario-appropriate grounded answer + a matching-doc search hit and assert
  // the live routing produces the right mode + a citation into that doc.
  describe("live RAG per-scenario grounding (re-grounded CF-09)", () => {
    it("Utility 'bill total' → a $-bearing answer + utility-bill citation", async () => {
      const res = await routeChat(
        makeRequest({ newUserMessage: "What is the bill total?", currentEntityKey: "sample:utility" }),
        liveRagDeps("utility-bill-2026-04", "The bill total is $214.07."),
      );
      expect(res.mode).toBe("rag");
      expect(res.answer).toMatch(/\$\d+\.?\d*/);
      expect(res.citations[0].documentId).toMatch(/utility/i);
    });

    it("Loan 'DTI' → a percentage-bearing answer + loan citation", async () => {
      const res = await routeChat(
        makeRequest({ newUserMessage: "What is the applicant's DTI?", currentEntityKey: "sample:loan" }),
        liveRagDeps("loan-application-2026", "The applicant's DTI is 32%."),
      );
      expect(res.answer).toMatch(/\d+\s?%/);
      expect(res.citations[0].documentId).toMatch(/loan/i);
    });

    it("Solar 'IRR' → a percentage-bearing answer + solar citation", async () => {
      const res = await routeChat(
        makeRequest({ newUserMessage: "What is the IRR for the top project?", currentEntityKey: "sample:solar" }),
        liveRagDeps("solar-portfolio-2026", "The IRR for the top project is 14.2%."),
      );
      expect(res.answer.toLowerCase()).toContain("irr");
      expect(res.answer).toMatch(/\d+(\.\d+)?\s?%/);
      expect(res.citations[0].documentId).toMatch(/solar/i);
    });

    it("a grounded answer with no verifiable citation block degrades to no citations (frank, not fabricated)", async () => {
      // The fake LLM returns prose with NO citations block; the RAG parser
      // produces no verified citation rather than inventing one.
      const groundxClient: GroundXClient = {
        forward: vi.fn(async () => jsonOk({ search: { results: [] } })),
      };
      const llmClient: LlmClient = {
        forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: "I could not find that in the documents." } }] })),
      };
      const res = await routeChat(
        makeRequest({ newUserMessage: "What's the meaning of life?", currentEntityKey: "sample:utility" }),
        { llmClient, groundxClient, groundxApiKey: "k", samplesBucketId: 28454, llmModelId: "test-model" },
      );
      expect(res.mode).toBe("rag");
      expect(res.citations).toHaveLength(0);
    });
  });

  it("non-MOCK structured mode throws when repository/chatSessionId aren't supplied (chatHandler is the right wiring point)", async () => {
    const { ChatRouteNotImplementedError } = await import("./chatRouter.js");
    await expect(
      routeChat(makeRequest({ newUserMessage: "what are my saved schemas?" }), {
        llmClient: fakeLlm,
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
    // chat-architecture-hardening Task 3 — hybrid rides the grounded seam:
    // one search (the seam's), the grounded system prompt with WORKSPACE
    // STATE, and the full citation-verification contract.
    const llmForward = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  'The snippet says hybrid snippet.\n\n```json\n{"citations":[{"documentId":"d-1","page":3,"quote":"hybrid snippet","answerSpan":"hybrid snippet"}]}\n```',
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const reply = await routeChat(makeRequest({ newUserMessage: "explain this sample" }), {
      llmClient: { forward: llmForward },
      llmModelId: "m",
      repository: repo,
      chatSessionId: "chat-1",
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 28454,
      byoPagesLimit: 100,
    });
    expect(reply.mode).toBe("hybrid");
    // The grounded builder's prompt, carrying the workspace state.
    const body = JSON.parse((llmForward.mock.calls[0][1] as { body: string }).body);
    expect(body.messages[0].content).toMatch(/^You are the user's analyst/);
    expect(body.messages[0].content).toContain("WORKSPACE STATE");
    expect(body.messages[0].content).toContain("sample:utility");
    // Verified citation (quote matches the snippet verbatim) + chat-parity chip.
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0].documentId).toBe("d-1");
    expect(reply.citations[0].tier).toBeDefined();
    expect(reply.suggestedActions[0]?.key).toBe("show-source");
    // The seam owns the ONLY search (no router-side double search).
    const searchCalls = (groundxClient.forward as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => (c[0] as string).includes("/search"),
    );
    expect(searchCalls.length).toBeLessThanOrEqual(2); // initial + low-floor retry only
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
      // #7 key-aware merge: both sides flatten to one clause PER KEY. Distinct
      // keys here (region/tier/projectId) → no intersection, nested $and
      // flattened, each key appears exactly once.
      expect(calls[0].body).toEqual({
        query: "hello",
        n: 6,
        filter: {
          $and: [{ region: "us-east-1" }, { tier: { $in: ["pro", "enterprise"] } }, { projectId: "P1" }],
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
    // The answer must genuinely CITE for the show-source chip to appear
    // (no-invented-citations, 2026-06-11) — give it a citations block.
    const citedAnswer = [
      "The bill total is $214.07.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":3,"quote":"the bill total is $214.07","answerSpan":"$214.07"}]}',
      "```",
    ].join("\n");
    const { groundxClient, llmClient } = mkClients(citedAnswer);
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
    });
    expect(reply.suggestedActions.find((a) => a.key === "suggested-intent")).toBeUndefined();
    expect(reply.suggestedActions.find((a) => a.key === "show-source")).toBeDefined();
  });

  // GroundX skill knowledge (2026-06-11). "what do you know about groundx?"
  // used to dead-end ("the snippets don't say anything about GroundX") because
  // the prompt was snippets-only. The grounded call now retrieves the
  // RELEVANT sections of the vendored groundx-agent-harness skill pack
  // (middleware/assets/groundx-skills/) and injects them into the system
  // prompt — no hard-coded product blurb. Document content claims stay
  // snippets-only. The retriever is a dep so these tests pin the WIRING
  // deterministically; the retrieval itself is pinned in groundxSkills.test.
  describe("grounded prompt carries retrieved GroundX skill knowledge", () => {
    it("injects retrieved skill sections for a GroundX question", async () => {
      const { groundxClient, llmClient } = mkClients("GroundX is EyeLevel's document platform.");
      const skillsRetrieve = vi.fn((q: string) =>
        /groundx/i.test(q) ? "### [groundx-architecture] Pipeline\nX-Ray parses layout into semantic objects." : null,
      );
      await routeChat(makeRequest({ newUserMessage: "what do you know about groundx?" }), {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
        skillsRetrieve,
      });
      expect(skillsRetrieve).toHaveBeenCalledWith("what do you know about groundx?");
      const body = JSON.parse((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
      const system = body.messages.find((m: { role: string }) => m.role === "system").content as string;
      expect(system).toContain("GROUNDX KNOWLEDGE");
      expect(system).toContain("X-Ray parses layout into semantic objects.");
      expect(system).toMatch(/questions about GroundX itself/i);
      // Natural voice (2026-06-11): the model must speak AS the assistant that
      // knows the product — never narrate its inputs ("from the docs I have
      // here", "the guidance says", "the skill pack").
      expect(system).toMatch(/as if you simply know/i);
      expect(system).toMatch(/never mention or cite this material/i);
      // The retired hard-coded capsule is GONE.
      expect(system).not.toContain("ABOUT GROUNDX (product knowledge");
    });

    it("no relevant skill sections → no knowledge block (snippets-only prompt)", async () => {
      const { groundxClient, llmClient } = mkClients("The total is $214.07.");
      const skillsRetrieve = vi.fn(() => null);
      await routeChat(makeRequest({ newUserMessage: "what is the total?" }), {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
        skillsRetrieve,
      });
      const body = JSON.parse((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
      const system = body.messages.find((m: { role: string }) => m.role === "system").content as string;
      expect(system).not.toContain("GROUNDX KNOWLEDGE");
      expect(system).not.toContain("ABOUT GROUNDX (product knowledge");
      // The internal-vocabulary ban is GLOBAL (every turn): users must never
      // see "snippets" / "extracted fields" / "docs I have" in answers.
      expect(system).toMatch(/never expose your internal materials/i);
      expect(system).toMatch(/this document/i);
    });
  });

  // RAG + raw extraction (2026-06-11). Search retrieves only the TOP-K
  // matching chunks, so structured questions ("what is the meter number?",
  // "how many meters?") miss when the matching chunk isn't retrieved. The
  // grounded call now ALSO reads the document's full workflow-extraction
  // output and hands it to the LLM alongside the snippets.
  describe("grounded prompt includes the document's raw extraction", () => {
    function mkClientsWithExtract(extractBody: unknown, extractStatus = 200) {
      const groundxClient: GroundXClient = {
        forward: vi.fn(async (path: string) => {
          if (path.startsWith("/ingest/document/extract/")) {
            return new Response(JSON.stringify(extractBody), {
              status: extractStatus,
              headers: { "content-type": "application/json" },
            });
          }
          return jsonOk({
            search: { results: [{ documentId: "d1", pageNumber: 3, text: "the bill total is $214.07" }] },
          });
        }),
      };
      const llmClient: LlmClient = {
        forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: "There are 2 meters." } }] })),
      };
      return { groundxClient, llmClient };
    }

    it("fetches the top snippet document's extraction and includes it in the LLM prompt", async () => {
      const { groundxClient, llmClient } = mkClientsWithExtract({
        invoice_number: "10295809",
        meters: [{ meter_number: "91496726" }, { meter_number: "91496724" }],
      });
      const reply = await routeChat(makeRequest({ newUserMessage: "how many meters are there?" }), {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
      });
      expect(reply.answer).toBe("There are 2 meters.");
      // The extraction endpoint was called for the snippet's document.
      const extractCall = (groundxClient.forward as ReturnType<typeof vi.fn>).mock.calls.find(
        (c: unknown[]) => String(c[0]).startsWith("/ingest/document/extract/d1"),
      );
      expect(extractCall).toBeDefined();
      // The LLM request body carries the full extraction values.
      const llmBody = String((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(llmBody).toContain("91496724");
      expect(llmBody).toContain("91496726");
      expect(llmBody).toContain("EXTRACTED FIELDS");
    });

    it("caps a pathological extraction structurally at the prompt budget (_truncated marker)", async () => {
      // harden-citation-emission U3 — the old char-slice (`…(truncated)`)
      // emitted invalid JSON; the structural fit keeps valid JSON and a
      // machine-readable marker, truncating the lone oversized scalar in place.
      const huge = { blob: "y".repeat(20_000) };
      const { groundxClient, llmClient } = mkClientsWithExtract(huge);
      await routeChat(makeRequest({ newUserMessage: "Q" }), {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
      });
      const llmBody = String((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(llmBody).toContain("_truncated");
      // The embedded extraction stays bounded (12k budget + marker), not 20k.
      const extractionPortion = llmBody.split("EXTRACTED FIELDS")[1] ?? "";
      expect(extractionPortion.length).toBeLessThan(14_000);
    });

    it("extraction fetch failure degrades gracefully (snippets-only prompt, no throw)", async () => {
      const { groundxClient, llmClient } = mkClientsWithExtract({ error: "boom" }, 500);
      const reply = await routeChat(makeRequest({ newUserMessage: "what is the total?" }), {
        llmClient,
        groundxClient,
        groundxApiKey: "k",
        samplesBucketId: 42,
        llmModelId: "test-model",
      });
      expect(reply.answer).toBe("There are 2 meters.");
      const llmBody = String((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
      expect(llmBody).not.toContain("EXTRACTED FIELDS");
    });
  });

  it("no citations on the reply → NO 'show all sources' chip (nothing to show)", async () => {
    // Zero search hits → zero citations (no ambient fallback either). A
    // "Show all sources" chip with no sources is a dead button — e.g. the
    // small-talk path ("tell me a joke") used to render one.
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [] } })),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: "Why did the bill meditate?" } }] })),
    };
    const reply = await routeChat(makeRequest({ newUserMessage: "tell me a joke" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
    });
    expect(reply.citations).toHaveLength(0);
    expect(reply.suggestedActions.find((a) => a.key === "show-source")).toBeUndefined();
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
      forward: vi.fn(async (path: string) => {
        // RAG + raw extraction (2026-06-11): the grounded path also fetches
        // /ingest/document/extract — 404 it here so this test measures the
        // SNIPPET cap in isolation (the extraction block has its own
        // EXTRACTION_PROMPT_CHARS cap, asserted in the extraction tests).
        if (path.startsWith("/ingest/document/extract/")) {
          return new Response("not found", { status: 404 });
        }
        return jsonOk({ search: { results } });
      }),
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
    });

    const body = JSON.parse((llmForward.mock.calls[0][1] as { body: string }).body);
    const userContent = body.messages.find((m: { role: string }) => m.role === "user").content;
    // The first snippet (`doc-0`) is preserved; the last (`doc-7`)
    // gets dropped — assert the kept-then-dropped contract.
    expect(userContent).toContain("doc=doc-0");
    expect(userContent).not.toContain("doc=doc-7");
  });
});

// ── 2026-05-31-word-level-citation-geometry: live -118-map → exact tier ──
//
// A RAG reply with a structured citation whose verbatim `quote` appears in the
// document's word-map resolves to `tier: "exact"` with the TIGHT word-level
// bbox (not the coarse X-Ray chunk box). The fallback chain degrades to
// `paraphrase`/none when the word-map is unfetchable or the span isn't verbatim,
// and the turn never fails. The word-map fetch is injected via the
// `wordMapFetch` dep seam (the live default is `fetchDocumentWordMap`).
describe("2026-05-31-word-level-citation-geometry — exact tier from live word-map", () => {
  beforeEach(() => {
    __clearXrayCache();
    __clearWordMapCache();
  });

  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const wordMap = wordMapFixture as unknown as WordMap;
  // The fixture's "$7,613.20" atom box: (450,250)-(760,320) on a 1700×2200 page.
  const tight = {
    x: 450 / 1700,
    y: 250 / 2200,
    w: (760 - 450) / 1700,
    h: (320 - 250) / 2200,
  };

  // A search result for doc-1 carrying NO search-side geometry (so the snippet
  // bbox is undefined) but whose text contains the verbatim "$7,613.20".
  const searchResults = [
    { documentId: "doc-1", pageNumber: 1, text: "Account Summary. Amount Due $7,613.20 by 06/15." },
  ];
  // The LLM answer with a structured citation block quoting the amount verbatim.
  const llmAnswer =
    'The amount due is $7,613.20.\n\n```json\n{"citations":[{"documentId":"doc-1","page":1,"quote":"$7,613.20"}]}\n```';

  function clients() {
    // forward serves the search payload for /search and an empty (no-bbox)
    // X-Ray for the xray endpoint so the X-Ray fallback yields no chunk box.
    const groundxClient: GroundXClient = {
      forward: vi.fn(async (path: string) => {
        if (path.includes("/xray/")) return jsonOk({ chunks: [], documentPages: [] });
        return jsonOk({ search: { results: searchResults } });
      }),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    return { groundxClient, llmClient };
  }

  it("lights the exact tier with the tight word-level bbox for a verified verbatim citation", async () => {
    const { groundxClient, llmClient } = clients();
    const wordMapFetch = vi.fn(async (_c, _k, documentId: string) =>
      documentId === "doc-1" ? wordMap : null,
    );
    const reply = await routeChat(makeRequest({ newUserMessage: "amount due?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      wordMapFetch,
    });
    expect(reply.citations).toHaveLength(1);
    const c = reply.citations[0];
    expect(c.tier).toBe("exact");
    expect(c.bbox).toBeDefined();
    expect(c.bbox!.x).toBeCloseTo(tight.x, 4);
    expect(c.bbox!.y).toBeCloseTo(tight.y, 4);
    expect(c.bbox!.w).toBeCloseTo(tight.w, 4);
    expect(c.bbox!.h).toBeCloseTo(tight.h, 4);
    // The fetch fired for the verified citation's documentId.
    expect(wordMapFetch).toHaveBeenCalledWith(groundxClient, "k", "doc-1");
  });

  it("falls back to paraphrase when the word-map is unfetchable (turn never fails)", async () => {
    const { groundxClient, llmClient } = clients();
    const wordMapFetch = vi.fn(async () => null);
    const reply = await routeChat(makeRequest({ newUserMessage: "amount due?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      wordMapFetch,
    });
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0].tier).toBe("paraphrase");
  });

  it("falls back to paraphrase when the verified quote is not present verbatim in the word-map", async () => {
    // The snippet text carries a sentence the word-map atoms do NOT spell out
    // (the map only has the "Account Summary" + "Amount Due …" lines). The quote
    // verifies against the snippet (exact substring) but has no consecutive atom
    // run in the word-map → no tight box → paraphrase.
    const snippetWithExtra = [
      {
        documentId: "doc-1",
        pageNumber: 1,
        text: "Account Summary. Amount Due $7,613.20 by 06/15. Late fees may apply after the grace period.",
      },
    ];
    const llmAnswerNoMap =
      'See the policy.\n\n```json\n{"citations":[{"documentId":"doc-1","page":1,"quote":"Late fees may apply after the grace period"}]}\n```';
    const groundxClient: GroundXClient = {
      forward: vi.fn(async (path: string) => {
        if (path.includes("/xray/")) return jsonOk({ chunks: [], documentPages: [] });
        return jsonOk({ search: { results: snippetWithExtra } });
      }),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswerNoMap } }] })),
    };
    const wordMapFetch = vi.fn(async () => wordMap);
    const reply = await routeChat(makeRequest({ newUserMessage: "summary?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      wordMapFetch,
    });
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0].tier).toBe("paraphrase");
  });

  it("does NOT fetch the word-map for an unverified (too-short / non-verbatim) citation", async () => {
    // The quote is shorter than the verification minimum → unverified → ambient,
    // and the word-map fetch must be skipped entirely.
    const llmAnswerUnverified =
      'Short.\n\n```json\n{"citations":[{"documentId":"doc-1","page":1,"quote":"abc"}]}\n```';
    const groundxClient: GroundXClient = {
      forward: vi.fn(async (path: string) => {
        if (path.includes("/xray/")) return jsonOk({ chunks: [], documentPages: [] });
        return jsonOk({ search: { results: searchResults } });
      }),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswerUnverified } }] })),
    };
    const wordMapFetch = vi.fn(async () => wordMap);
    const reply = await routeChat(makeRequest({ newUserMessage: "q?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      wordMapFetch,
    });
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0].tier).toBe("ambient");
    expect(wordMapFetch).not.toHaveBeenCalled();
  });
});

// ── 2026-05-31-tool-system-completion: server-side role gating ──
//
// The chat router exposes a tool to the LLM IFF the caller's role permits it.
// The caller's role rides on `ChatRouterRequest.callerRole`, derived SERVER-
// side in chatHandler (never trusted from the client). This block proves the
// filter is applied at the router boundary (the surface the LLM actually
// sees), using a member-only tool spliced into the live catalog.
describe("2026-05-31-tool-system-completion — server-side role filter on the LLM catalog", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const memberOnlyTool = {
    name: "edit_member_only_probe",
    description:
      "Member-only probe tool. Use when the role-filter end-to-end test splices it into the catalog.",
    category: "mutate" as const,
    inputSchema: z.object({ id: z.string().describe("id") }),
    availableIn: ["member"] as WidgetRole[],
    intentBuilder: () => ({ kind: "noop" }),
  };

  beforeEach(() => {
    SERVER_TOOL_CATALOG.push(memberOnlyTool);
  });
  afterEach(() => {
    const i = SERVER_TOOL_CATALOG.indexOf(memberOnlyTool);
    if (i >= 0) SERVER_TOOL_CATALOG.splice(i, 1);
  });

  async function toolsSentFor(callerRole: WidgetRole | undefined): Promise<string[]> {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [] } })),
    };
    const llmForward = vi.fn(async () => jsonOk({ choices: [{ message: { content: "ok" } }] }));
    const llmClient: LlmClient = { forward: llmForward };
    await routeChat(makeRequest({ newUserMessage: "Q", callerRole }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
    });
    const body = JSON.parse((llmForward.mock.calls[0][1] as { body: string }).body) as {
      tools?: { function?: { name?: string } }[];
    };
    return (body.tools ?? []).map((t) => t.function?.name ?? "").filter(Boolean);
  }

  it("hides a member-only tool from an anonymous caller", async () => {
    const names = await toolsSentFor("anonymous");
    expect(names).not.toContain("edit_member_only_probe");
    // sanity: an all-roles tool is still present for anonymous.
    expect(names).toContain("propose_schema_field");
  });

  it("exposes a member-only tool to a member caller", async () => {
    const names = await toolsSentFor("member");
    expect(names).toContain("edit_member_only_probe");
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
    });
    // Only the doc that actually exists in the snippet set.
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0].documentId).toBe("d1");
  });

  it("when LLM emits NO citations block, the reply carries NO citations (no invented fallback)", async () => {
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
    });
    // No invented citations (2026-06-11): omitting the block is the model's
    // signal the answer didn't draw on the documents.
    expect(reply.citations).toHaveLength(0);
    expect(reply.suggestedActions.find((a) => a.key === "show-source")).toBeUndefined();
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

  function mkToolOnlyThenProseClients(
    llmAnswer: string,
    toolCalls: { id?: string; name: string; arguments: Record<string, unknown> }[],
    firstContent = "",
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
    let callCount = 0;
    const llmForward = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return jsonOk({
          choices: [
            {
              message: {
                content: firstContent,
                tool_calls: toolCalls.map((tc, idx) => ({
                  id: tc.id ?? `call_${idx}`,
                  type: "function",
                  function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
                })),
              },
            },
          ],
        });
      }
      return jsonOk({
        choices: [
          {
            message: {
              content: llmAnswer,
            },
          },
        ],
      });
    });
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
    });
    expect(reply.intents).toHaveLength(1);
    expect(reply.intents[0]).toMatchObject({
      name: "open_document",
      arguments: { documentId: "doc-abc", page: 5 },
      intent: { kind: "highlightCitation", documentId: "doc-abc", page: 5 },
    });
    expect(reply.toolFailures).toEqual([]);
  });

  it("tool-only read replies ask the LLM for user-facing prose instead of using canned copy", async () => {
    const prose = "The source says the relevant document section is available on page 5.";
    const { groundxClient, llmClient, llmForward } = mkToolOnlyThenProseClients(prose, [
      { name: "open_document", arguments: { documentId: "doc-abc", page: 5 } },
    ]);
    const reply = await routeChat(makeRequest({ newUserMessage: "show me doc-abc page 5" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
    });
    expect(reply.intents).toHaveLength(1);
    expect(reply.answer).toBe(prose);
    expect(llmForward).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse((llmForward.mock.calls[0][1] as { body: string }).body) as Record<string, unknown>;
    const repairBody = JSON.parse((llmForward.mock.calls[1][1] as { body: string }).body) as {
      tools?: unknown;
      messages?: Array<{ content?: string }>;
    };
    expect(Array.isArray(firstBody.tools)).toBe(true);
    expect(repairBody.tools).toBeUndefined();
    expect(repairBody.messages?.[repairBody.messages.length - 1]?.content).toMatch(/Do not call tools now/);
  });

  it("tool-only invalid replies still use LLM prose and surface toolFailures", async () => {
    const prose = "I can still answer from the source text, but I couldn't open that citation automatically.";
    const { groundxClient, llmClient, llmForward } = mkToolOnlyThenProseClients(prose, [
      { name: "open_document", arguments: { documentId: 42 } },
    ]);
    const reply = await routeChat(makeRequest({ newUserMessage: "show me that source" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
    });
    expect(reply.intents).toEqual([]);
    expect(reply.toolFailures).toHaveLength(1);
    expect(reply.answer).toBe(prose);
    expect(llmForward).toHaveBeenCalledTimes(2);
    const repairBody = JSON.parse((llmForward.mock.calls[1][1] as { body: string }).body) as {
      tools?: unknown;
    };
    expect(repairBody.tools).toBeUndefined();
  });

  it("tool replies with only citation metadata are repaired after parsing without dropping citations", async () => {
    const prose = "The cited source text is the relevant evidence for this page.";
    const metadataOnly = [
      "```json",
      JSON.stringify({
        citations: [{ documentId: "doc-1", page: 1, quote: "snippet text" }],
      }),
      "```",
    ].join("\n");
    const { groundxClient, llmClient, llmForward } = mkToolOnlyThenProseClients(
      prose,
      [{ name: "open_document", arguments: { documentId: "doc-abc", page: 5 } }],
      metadataOnly,
    );
    const reply = await routeChat(makeRequest({ newUserMessage: "show me the source" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
    });
    expect(reply.answer).toBe(prose);
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0]).toMatchObject({ documentId: "doc-1", page: 1 });
    expect(reply.intents).toHaveLength(1);
    expect(llmForward).toHaveBeenCalledTimes(2);
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
      // 2026-05-31-tool-system-completion — universal wf04 tools (no step filter).
      "close_dialog",
      "commit_gate",
      "delete_report_section",
      "dismiss_gate",
      "dismiss_wizard",
      "edit_report_section",
      // agentic-tool-loop — server-executed product-docs lookup is universal.
      "lookup_groundx_docs",
      "pin_to_report",
      "propose_report_section",
      "reject_report_section",
      // onboarding-shell-shared-view Phase 3a — show_extraction lists `report`.
      "show_extraction",
      // onboarding-shell-shared-view Phase 3b — show_integrate lists `report`.
      "show_integrate",
      "show_smart_report_edit",
      "show_smart_report_render",
      "submit_signup",
      "suggest_intent",
      "wizard_back",
      "wizard_finish",
      "wizard_next",
    ]);
  });

  // ── 2026-06-01-data-model-tail item 2: validate activeStepKind, don't widen ──
  //
  // SECURITY: `request.activeStepKind` is an untrusted wire string. A
  // present-but-INVALID kind must route to the SAFE MINIMUM (universal tools
  // only) — NOT the full catalog (the old `as ViewerStepKind` cast let bogus
  // input fall through and a naive `safeParse → undefined` fix would widen to
  // FULL). See toolCatalog `UNKNOWN_VIEWER_STEP`.
  async function toolNamesFor(activeStepKind: string | null | undefined): Promise<string[]> {
    const { groundxClient, llmClient, llmForward } = mkClients("Answer.", []);
    await routeChat(makeRequest({ newUserMessage: "Q", activeStepKind }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
    });
    const body = JSON.parse((llmForward.mock.calls[0][1] as RequestInit).body as string);
    return (body.tools as Array<{ function: { name: string } }>).map((t) => t.function.name).sort();
  }

  it("a present-but-INVALID activeStepKind routes to the safe-minimum set, NOT the full catalog", async () => {
    const safe = await toolNamesFor("totally-bogus-step");
    // safe minimum == universal tools (no availableSteps) — the same set
    // toolsForStep(UNKNOWN_VIEWER_STEP) yields.
    const expectedSafe = toolsForStep(UNKNOWN_VIEWER_STEP).map((t) => t.name).sort();
    expect(safe).toEqual(expectedSafe);
    // Must be strictly narrower than the full catalog (anti-widening).
    expect(safe.length).toBeLessThan(SERVER_TOOL_CATALOG.length);
    // Must not be wider than any valid step's set.
    const reportSet = new Set(toolsForStep("report").map((t) => t.name));
    for (const name of safe) expect(reportSet.has(name)).toBe(true);
  });

  it("undefined activeStepKind still yields the FULL catalog (legacy caller)", async () => {
    const full = await toolNamesFor(undefined);
    expect(full.length).toBe(SERVER_TOOL_CATALOG.length);
  });

  it("a VALID activeStepKind yields its correctly-filtered set", async () => {
    const docViewer = await toolNamesFor("doc-viewer");
    expect(docViewer).toEqual(toolsForStep("doc-viewer").map((t) => t.name).sort());
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
      });
      const chip = reply.suggestedActions.find((a) => a.key === "tool:accept_probe");
      expect(chip?.label).toMatch(/Mutate-category probe/);
    });
  });
});

// chat-architecture-hardening Task 4 — the LLM turn router gates BOTH
// retrievals. Probe-derived regression: "what is the meter number?" was
// paying 3-4.5KB of irrelevant skill-authoring content per turn.
describe("turn plan gates search + skill retrieval", () => {
  function jsonOk2(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  function mkClients2(llmAnswer: string) {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk2({ search: { results: [{ documentId: "d1", pageNumber: 3, text: "meter 91496724" }] } }),
      ),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk2({ choices: [{ message: { content: llmAnswer } }] })),
    };
    return { groundxClient, llmClient };
  }

  it("document plan {true,false}: NO skill content reaches the LLM (probe regression)", async () => {
    const { groundxClient, llmClient } = mkClients2("The meter number is 91496724.");
    const skillsRetrieve = vi.fn(() => "### [extraction-workflows] Authoring\nYAML schema guidance");
    await routeChat(makeRequest({ newUserMessage: "what is the meter number?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      skillsRetrieve,
      planTurn: async () => ({ documentSearch: true, productKnowledge: false }),
    });
    expect(skillsRetrieve).not.toHaveBeenCalled();
    const body = JSON.parse((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    const system = body.messages.find((m: { role: string }) => m.role === "system").content as string;
    expect(system).not.toContain("GROUNDX KNOWLEDGE");
  });

  it("product plan {false,true}: no GroundX search call, skill block present, zero citations", async () => {
    const { groundxClient, llmClient } = mkClients2("GroundX is EyeLevel's document platform.");
    const skillsRetrieve = vi.fn(() => "### [groundx-architecture] Pipeline\nX-Ray facts");
    const reply = await routeChat(makeRequest({ newUserMessage: "what do you know about groundx?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      skillsRetrieve,
      planTurn: async () => ({ documentSearch: false, productKnowledge: true }),
    });
    const searchCalls = (groundxClient.forward as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      (c[0] as string).includes("/search"),
    );
    expect(searchCalls).toHaveLength(0);
    const body = JSON.parse((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    const system = body.messages.find((m: { role: string }) => m.role === "system").content as string;
    expect(system).toContain("GROUNDX KNOWLEDGE");
    expect(system).toContain("X-Ray facts");
    expect(reply.citations).toEqual([]);
    expect(reply.suggestedActions.find((a) => a.key === "show-source")).toBeUndefined();
  });

  it("planner-true bypasses the retriever entry bar (skillsRetrieve called with bypass)", async () => {
    const { groundxClient, llmClient } = mkClients2("answer");
    const skillsRetrieve = vi.fn(() => "### content");
    await routeChat(makeRequest({ newUserMessage: "how does ingestion work here?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      skillsRetrieve,
      planTurn: async () => ({ documentSearch: true, productKnowledge: true }),
    });
    expect(skillsRetrieve).toHaveBeenCalledWith("how does ingestion work here?", { bypassEntryBar: true });
  });

  it("no planTurn injected and no light client → fallback (retriever decides, search runs)", async () => {
    const { groundxClient, llmClient } = mkClients2("answer");
    const skillsRetrieve = vi.fn(() => null);
    await routeChat(makeRequest({ newUserMessage: "what is the total?" }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      skillsRetrieve,
    });
    // Fallback path: search ran AND the retriever was consulted with its
    // internal gate intact (no bypass argument).
    const searchCalls = (groundxClient.forward as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      (c[0] as string).includes("/search"),
    );
    expect(searchCalls.length).toBeGreaterThan(0);
    expect(skillsRetrieve).toHaveBeenCalledWith("what is the total?");
  });
});

// chat-architecture-hardening Task 6 — TOOL NOTES tracks the step-FILTERED
// catalog: guidance appears only for tools actually offered this turn.
describe("generated TOOL NOTES section", () => {
  function jsonOk3(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  function mk3() {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk3({ search: { results: [{ documentId: "d1", text: "t" }] } })),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk3({ choices: [{ message: { content: "a" } }] })),
    };
    return { groundxClient, llmClient };
  }
  async function systemFor(activeStepKind?: string) {
    const { groundxClient, llmClient } = mk3();
    await routeChat(makeRequest({ newUserMessage: "Q", ...(activeStepKind ? { activeStepKind } : {}) }), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "m",
      skillsRetrieve: () => null,
      planTurn: async () => ({ documentSearch: true, productKnowledge: false }),
    });
    const body = JSON.parse((llmClient.forward as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string);
    return body.messages.find((m: { role: string }) => m.role === "system").content as string;
  }

  it("guidance present for an offered tool; hand-written paragraphs gone", async () => {
    const system = await systemFor("extract-workbench"); // propose_schema_field offered here
    expect(system).toContain("TOOL NOTES");
    expect(system).toContain("`propose_schema_field`:");
    expect(system).not.toContain("ship via tools");
  });

  it("a tool absent from the step contributes NO notes", async () => {
    const system = await systemFor("integrate"); // propose_schema_field not offered
    expect(system).not.toContain("`propose_schema_field`:");
  });
});

// ─────────────────────────────────────────────────────────────────────
// turn-router-extraction-appstate Task 2 — planner-derived mode routing.
// routeChat derives the mode from the RoutePlan's appState×documentSearch;
// the keyword classifier survives ONLY as the intent-hint fast path and the
// deterministic fallback (CLASSIFIER_DECIDES / planner failure).
// ─────────────────────────────────────────────────────────────────────
describe("routeChat — planner-derived mode (appState)", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  function ragClients() {
    const groundxForward = vi.fn(async (path: string) => {
      if (String(path).includes("/search")) {
        return jsonOk({ search: { results: [{ documentId: "d1", pageNumber: 1, text: "total is $214.07" }] } });
      }
      return new Response("not found", { status: 404 });
    });
    const llmForward = vi.fn(async () => jsonOk({ choices: [{ message: { content: "An answer." } }] }));
    return {
      groundxForward,
      llmForward,
      deps: {
        llmClient: { forward: llmForward },
        groundxClient: { forward: groundxForward },
        groundxApiKey: "k",
        samplesBucketId: 28454,
        llmModelId: "test-model",
      },
    };
  }

  async function repoFixture() {
    const { MemoryAppRepository } = await import("../db/memoryRepository.js");
    const repo = new MemoryAppRepository();
    const now = new Date();
    await repo.upsertChatSession({
      id: "chat-r",
      onboardingSessionId: "onb-r",
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
    return repo;
  }

  it("appState:true + documentSearch:false → structured", async () => {
    const { deps } = ragClients();
    const planTurn = vi.fn(async () => ({
      documentSearch: false, productKnowledge: false, extractionContext: false, appState: true,
    }));
    const res = await routeChat(
      makeRequest({ newUserMessage: "how many pages do I have left on my plan?" }),
      { ...deps, repository: await repoFixture(), chatSessionId: "chat-r", planTurn },
    );
    expect(res.mode).toBe("structured");
    expect(planTurn).toHaveBeenCalledTimes(1);
  });

  it("appState:true + documentSearch:true → hybrid", async () => {
    const { deps } = ragClients();
    const planTurn = vi.fn(async () => ({
      documentSearch: true, productKnowledge: false, extractionContext: true, appState: true,
    }));
    const res = await routeChat(
      makeRequest({ newUserMessage: "what can I still do with this bill?" }),
      { ...deps, repository: await repoFixture(), chatSessionId: "chat-r", planTurn },
    );
    expect(res.mode).toBe("hybrid");
    expect(planTurn).toHaveBeenCalledTimes(1);
  });

  it("appState:false → rag, planner called EXACTLY once end-to-end (plan threaded to the seam)", async () => {
    const { deps, groundxForward } = ragClients();
    const planTurn = vi.fn(async () => ({
      documentSearch: true, productKnowledge: false, extractionContext: false, appState: false,
    }));
    const res = await routeChat(
      makeRequest({ newUserMessage: "what is the total amount due?" }),
      { ...deps, planTurn },
    );
    expect(res.mode).toBe("rag");
    expect(planTurn).toHaveBeenCalledTimes(1);
    // The threaded plan governs the seam: extractionContext:false → no extract fetch.
    // (Asserted below.)
    const extractCalls = groundxForward.mock.calls.filter(([p]) => String(p).includes("/ingest/document/extract/"));
    expect(extractCalls).toHaveLength(0);
  });

  it("a planner answer makes the keyword heuristics UNREACHABLE (no double-classification)", async () => {
    const { deps } = ragClients();
    // "what saved schemas do I have?" is a keyword-structured fixture; the
    // planner says appState:false → rag. If the keywords still ran, this
    // would route structured and throw (no repository deps here).
    const planTurn = vi.fn(async () => ({
      documentSearch: true, productKnowledge: false, extractionContext: true, appState: false as const,
    }));
    const res = await routeChat(
      makeRequest({ newUserMessage: "what saved schemas do I have?" }),
      { ...deps, planTurn },
    );
    expect(res.mode).toBe("rag");
  });

  it("CLASSIFIER_DECIDES sentinel → keyword classifier routes (byte-for-byte parity)", async () => {
    const { deps } = ragClients();
    const { FALLBACK_ROUTE_PLAN } = await import("./turnRouter.js");
    const planTurn = vi.fn(async () => FALLBACK_ROUTE_PLAN);
    // Keyword-structured fixture without repo deps → today's throwing behavior.
    await expect(
      routeChat(makeRequest({ newUserMessage: "what saved schemas do I have?" }), { ...deps, planTurn }),
    ).rejects.toThrow(/structured/);
    // Keyword-rag fixture routes rag.
    const res = await routeChat(
      makeRequest({ newUserMessage: "what is the total amount due?" }),
      { ...deps, planTurn },
    );
    expect(res.mode).toBe("rag");
  });

  it("an explicit intent hint decides the mode WITHOUT a planner call for routing", async () => {
    const { deps } = ragClients();
    // A plan that would route structured if the planner were consulted for
    // routing — the chat.sources hint must win regardless. The seam may
    // still call the planner ONCE for its retrieval flags (hinted turns
    // plan inside the seam, exactly as before this change).
    const planTurn = vi.fn(async () => ({
      documentSearch: false, productKnowledge: false, extractionContext: false, appState: true as const,
    }));
    const res = await routeChat(
      makeRequest({ newUserMessage: "how many pages do I have left on my plan?", intent: "chat.sources" }),
      { ...deps, planTurn },
    );
    expect(res.mode).toBe("rag");
    expect(planTurn.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it("planner-routed structured DEGRADES to rag with the fallback seam plan when session deps are missing", async () => {
    const { deps, groundxForward } = ragClients();
    const planTurn = vi.fn(async () => ({
      documentSearch: false, productKnowledge: false, extractionContext: false, appState: true,
    }));
    const res = await routeChat(
      makeRequest({ newUserMessage: "how many pages do I have left on my plan?" }),
      { ...deps, planTurn }, // no repository / chatSessionId
    );
    expect(res.mode).toBe("rag");
    // The degrade runs the FALLBACK seam plan (search ON), not the planner's documentSearch:false.
    const searchCalls = groundxForward.mock.calls.filter(([p]) => String(p).includes("/search"));
    expect(searchCalls.length).toBeGreaterThan(0);
  });
});
