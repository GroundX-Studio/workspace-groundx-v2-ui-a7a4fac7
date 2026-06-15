import { describe, expect, it, vi } from "vitest";

import type { ContentScope } from "@groundx/shared";

import { MemoryAppRepository } from "../db/memoryRepository.js";
import type { ChatSessionRecord, GroundXClient, LlmClient } from "../types.js";

import { handleChatMessage } from "./chatHandler.js";
import { groundedAnswerOverScope } from "./groundedAnswer.js";

/**
 * Agentic tool-result loop corpus (agentic-tool-loop, T1 — failing-test-first).
 *
 * The grounded chat path runs a bounded loop: when the LLM emits a
 * SERVER-EXECUTED read tool (`lookup_groundx_docs`), the middleware runs it,
 * appends an assistant `tool_calls` message + a `role:"tool"` result message
 * to the transcript, and RE-CALLS the model so it continues its answer from
 * the result. No real LLM calls — the `LlmClient.forward` seam is a `vi.fn`
 * scripted per round (precedent: intentToolCorpus.test.ts).
 *
 * This test is RED until T2–T5 land (loop + `lookup_groundx_docs` tool).
 */

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

function makeSession(): ChatSessionRecord {
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
  };
}

/** A GroundX search hit so the RAG path proceeds to the grounded completion. */
function makeGroundxClient(): GroundXClient {
  return {
    forward: vi.fn(async () =>
      jsonResponse({
        search: { results: [{ documentId: "doc-1", pageNumber: 1, text: "The total amount due is $7,613.20." }] },
      }),
    ),
  };
}

/**
 * An `LlmClient` whose grounded completion returns a DIFFERENT scripted body
 * on each successive `forward` call (round 1, round 2, …). The last body is
 * repeated if the loop over-calls. Returns the spy so the test can inspect
 * the exact request bodies sent on each round.
 */
function makeScriptedLlmClient(bodies: unknown[]): { client: LlmClient; forward: ReturnType<typeof vi.fn> } {
  let call = 0;
  const forward = vi.fn(async () => {
    const body = bodies[Math.min(call, bodies.length - 1)];
    call += 1;
    return jsonResponse(body);
  });
  return { client: { forward } as unknown as LlmClient, forward };
}

const TOOL_CALL_ROUND = {
  choices: [
    {
      message: {
        content: "",
        tool_calls: [
          {
            id: "call_x",
            type: "function",
            function: { name: "lookup_groundx_docs", arguments: JSON.stringify({ query: "how does x-ray chunking work" }) },
          },
        ],
      },
    },
  ],
};

const PROSE_ROUND = {
  choices: [{ message: { content: "X-Ray breaks each document into semantic objects before search." } }],
};

async function run(bodies: unknown[]) {
  const repo = new MemoryAppRepository();
  await repo.upsertChatSession(makeSession());
  const { client, forward } = makeScriptedLlmClient(bodies);
  const result = await handleChatMessage(
    { chatSessionId: "chat-1", newUserMessage: "How does GroundX X-Ray work?" },
    {
      repository: repo,
      llmClient: client,
      groundxClient: makeGroundxClient(),
      groundxApiKey: "k",
      samplesBucketId: 28454,
      llmModelId: "test-model",
    },
  );
  return { reply: result.reply, forward };
}

describe("agentic tool-result loop (no real LLM)", () => {
  it("executes lookup_groundx_docs server-side and continues the answer from the result", async () => {
    const { reply, forward } = await run([TOOL_CALL_ROUND, PROSE_ROUND]);

    // The loop re-called the model after executing the server tool.
    expect(forward.mock.calls.length).toBeGreaterThanOrEqual(2);

    // The second request carried the assistant tool_calls message + the tool result.
    const secondBody = JSON.parse((forward.mock.calls[1][1] as { body: string }).body) as {
      messages: Array<{ role: string; tool_calls?: unknown[]; tool_call_id?: string; content?: string }>;
    };
    const assistantWithToolCalls = secondBody.messages.find(
      (m) => m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0,
    );
    const toolResult = secondBody.messages.find((m) => m.role === "tool");
    expect(assistantWithToolCalls, "round-2 request must carry the assistant tool_calls message").toBeDefined();
    expect(toolResult, "round-2 request must carry a role:'tool' result message").toBeDefined();
    expect(toolResult?.tool_call_id).toBe("call_x");
    // The executor's output actually reaches the model (not an empty stub).
    expect((toolResult?.content ?? "").length).toBeGreaterThan(0);

    // The final prose (round 2) is the answer.
    expect(reply.answer).toContain("semantic objects");

    // The lookup call is NOT routed to intents or chips (server-executed).
    expect(reply.intents.some((i) => i.name === "lookup_groundx_docs")).toBe(false);
    expect(reply.suggestedActions.some((a) => a.key === "tool:lookup_groundx_docs")).toBe(false);

    // The user-facing activity hint records the lookup.
    expect(reply.toolActivity ?? []).toContainEqual({
      name: "lookup_groundx_docs",
      label: "Checked GroundX docs",
    });
  });

  it("stops at the round cap and still produces an answer", async () => {
    // The model keeps calling the tool every round. The loop must stop after
    // maxRounds (4) server rounds → 5 grounded dispatches; the pre-existing
    // tool-only prose-repair then yields a final answer (one more call). The
    // point: it is BOUNDED and terminates — no hang, no unbounded calls.
    const bodies = [
      TOOL_CALL_ROUND,
      TOOL_CALL_ROUND,
      TOOL_CALL_ROUND,
      TOOL_CALL_ROUND,
      TOOL_CALL_ROUND,
      PROSE_ROUND, // consumed by the tool-only prose repair after the cap
    ];
    const { reply, forward } = await run(bodies);
    // ≤ maxRounds+1 loop dispatches (5) + ≤1 prose-repair completion.
    expect(forward.mock.calls.length).toBeLessThanOrEqual(6);
    expect(reply.mode).toBe("rag");
    expect(reply.answer).toContain("semantic objects");
  });

  // design §H-3 — a non-server tool emitted in the SAME round as the server
  // tool still routes to intents[]; the server tool is consumed by the loop.
  it("routes a non-server tool emitted alongside the lookup, exactly once", async () => {
    const mixedRound = {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "c1", type: "function", function: { name: "lookup_groundx_docs", arguments: JSON.stringify({ query: "how does x-ray work" }) } },
              { id: "c2", type: "function", function: { name: "open_document", arguments: JSON.stringify({ documentId: "doc-1" }) } },
            ],
          },
        },
      ],
    };
    const { reply } = await run([mixedRound, PROSE_ROUND]);
    const opens = reply.intents.filter((i) => i.name === "open_document");
    expect(opens, "open_document routes to intents exactly once").toHaveLength(1);
    expect(reply.intents.some((i) => i.name === "lookup_groundx_docs"), "lookup is never an intent").toBe(false);
    expect((reply.toolActivity ?? []).some((a) => a.name === "lookup_groundx_docs")).toBe(true);
  });

  // design §H-4 — a server-tool call with invalid args surfaces on
  // toolFailures[] (NOT toolActivity), feeds the model a terse error, and the
  // turn still succeeds.
  it("surfaces a server-tool validation failure without failing the turn", async () => {
    const badLookupRound = {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "bad", type: "function", function: { name: "lookup_groundx_docs", arguments: JSON.stringify({ query: "x" }) } }, // min(3) → invalid
            ],
          },
        },
      ],
    };
    const { reply } = await run([badLookupRound, PROSE_ROUND]);
    expect(reply.toolFailures.some((f) => f.name === "lookup_groundx_docs")).toBe(true);
    expect((reply.toolActivity ?? []).some((a) => a.name === "lookup_groundx_docs")).toBe(false);
    expect(reply.answer).toContain("semantic objects"); // turn succeeded
  });

  // design §C / review finding — synthesized/duplicate tool-call ids must NOT
  // dedup routed calls across rounds. Two same-id `jump_to_page` calls in
  // different rounds both reach intents[].
  it("does not dedupe routed calls by id across rounds", async () => {
    const round1 = {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "dup", type: "function", function: { name: "jump_to_page", arguments: JSON.stringify({ documentId: "doc-1", page: 2 }) } },
              { id: "s1", type: "function", function: { name: "lookup_groundx_docs", arguments: JSON.stringify({ query: "x-ray internals" }) } },
            ],
          },
        },
      ],
    };
    const round2 = {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              { id: "dup", type: "function", function: { name: "jump_to_page", arguments: JSON.stringify({ documentId: "doc-1", page: 3 }) } },
            ],
          },
        },
      ],
    };
    const { reply } = await run([round1, round2, PROSE_ROUND]);
    const jumps = reply.intents.filter((i) => i.name === "jump_to_page");
    expect(jumps, "both same-id jump_to_page calls route despite the id collision").toHaveLength(2);
  });

  // design §H-6 — a looped turn's final-round prose still flows through the
  // unchanged citation-verification path (quotes verify against the SNIPPET
  // set, never the tool result).
  it("verifies citations from the final round against the snippet set", async () => {
    const citedProse = {
      choices: [
        {
          message: {
            content:
              "The total amount due is $7,613.20.\n\n" +
              '```json\n{"citations":[{"documentId":"doc-1","page":1,"quote":"The total amount due is $7,613.20.","answerSpan":"total"}]}\n```',
          },
        },
      ],
    };
    const { reply } = await run([TOOL_CALL_ROUND, citedProse]);
    expect(reply.citations.some((c) => c.documentId === "doc-1")).toBe(true);
  });
});

// design §H-5 — the loop is OFF unless the caller opts in. Report/hybrid call
// the shared seam with no `toolLoop`, so a server-executed tool call is NOT
// run by the middleware (it routes out as an ordinary tool call) and the LLM
// is hit exactly once. Exercised at the seam directly (the rag path always
// opts in).
describe("loop off (report / hybrid seam) — single LLM call", () => {
  it("makes exactly one grounded completion and does not execute the server tool", async () => {
    // Prose + a server-executable tool call in one reply. With the loop OFF and
    // prose present, neither the loop NOR the pre-existing prose-repair fires →
    // exactly one completion; the call routes out un-executed.
    const proseWithLookup = {
      choices: [
        {
          message: {
            content: "X-Ray breaks each document into semantic objects.",
            tool_calls: [
              { id: "s1", type: "function", function: { name: "lookup_groundx_docs", arguments: JSON.stringify({ query: "x-ray internals" }) } },
            ],
          },
        },
      ],
    };
    const { client, forward } = makeScriptedLlmClient([proseWithLookup]);
    const grounded = await groundedAnswerOverScope(
      "How does GroundX X-Ray work?",
      null,
      { llmClient: client, llmModelId: "test-model" },
      {
        tools: [],
        // fixed plan → no planner, no search, no extraction, no skill retrieval
        turnPlan: { documentSearch: false, productKnowledge: false, extractionContext: false },
        // NO toolLoop → no server-tool loop
      },
    );
    expect(forward.mock.calls.length).toBe(1);
    // The server-executable call routes out un-executed (no toolActivity).
    expect(grounded.toolCalls.some((c) => c.name === "lookup_groundx_docs")).toBe(true);
    expect(grounded.toolActivity).toEqual([]);
  });
});

// loop-tool-refined-research — a SECOND server-executed read tool
// (`search_documents`) re-runs the turn's SCOPED GroundX search with a
// model-supplied refined query inside the grounded loop and feeds the new
// snippets back. RED until the tool + the `ServerExecuteContext.researchDocuments`
// seam land. Exercised at the groundedAnswerOverScope seam so the test controls
// the scope + RBAC filter and can assert the re-search reused them (no widening).
describe("agentic re-search tool (search_documents)", () => {
  it("re-runs the SCOPED search with the refined query, same RBAC filter, and feeds snippets back", async () => {
    const reSearchRound = {
      choices: [
        {
          message: {
            content: "",
            tool_calls: [
              {
                id: "rs1",
                type: "function",
                function: { name: "search_documents", arguments: JSON.stringify({ query: "late payment penalty terms" }) },
              },
            ],
          },
        },
      ],
    };
    const prose = { choices: [{ message: { content: "The late-payment penalty is 1.5% per month." } }] };
    const { client: llm, forward: llmForward } = makeScriptedLlmClient([reSearchRound, prose]);

    // Records every GroundX search request body; returns a hit so the re-search has content.
    const searchBodies: Array<{ query?: string; filter?: unknown; documentIds?: unknown }> = [];
    const groundxForward = vi.fn(async (_path: string, init: { body: string }) => {
      searchBodies.push(JSON.parse(init.body));
      return jsonResponse({
        search: { results: [{ documentId: "doc-1", pageNumber: 3, text: "A 1.5% per-month penalty applies to late payments." }] },
      });
    });

    const scope: ContentScope = { type: "documents", documentIds: ["doc-1"] };
    const rbacFilter = { projectId: { $in: ["proj-x"] } };

    const grounded = await groundedAnswerOverScope(
      "What is the late payment penalty?",
      scope,
      {
        llmClient: llm,
        llmModelId: "test-model",
        groundxClient: { forward: groundxForward } as unknown as GroundXClient,
        groundxApiKey: "k",
        rbacFilter,
      },
      {
        tools: [],
        toolLoop: { maxRounds: 4 },
        turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: false },
      },
    );

    // Two scoped searches ran: the primary (turn question) + the re-search (refined query).
    expect(searchBodies.length, "primary search + re-search").toBeGreaterThanOrEqual(2);
    const primary = searchBodies.find((b) => b.query === "What is the late payment penalty?");
    const reSearch = searchBodies.find((b) => b.query === "late payment penalty terms");
    expect(primary, "primary search ran with the turn question").toBeDefined();
    expect(reSearch, "re-search ran with the model's refined query").toBeDefined();
    // SAME scope + RBAC filter as the primary — scope is NOT widened. Asserted
    // explicitly (non-vacuous, can't pass as undefined===undefined) AND on the
    // documents scope itself (documentIds), not just the composed filter.
    expect(reSearch?.filter).toEqual({ projectId: { $in: ["proj-x"] } });
    expect(reSearch?.filter).toEqual(primary?.filter);
    expect(reSearch?.documentIds).toEqual(["doc-1"]);
    expect(reSearch?.documentIds).toEqual(primary?.documentIds);

    // The loop re-called the model after executing the server tool (round 2 = prose).
    expect(llmForward.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(grounded.body).toContain("1.5%");

    // The re-search SNIPPETS actually reached the model: the round-2 request
    // carries a role:"tool" message whose content is the formatted re-search
    // result (not an empty stub). Without this the "feeds snippets back" claim
    // would be unverified — the scripted prose says "1.5%" regardless.
    const round2Body = JSON.parse((llmForward.mock.calls[1][1] as { body: string }).body) as {
      messages: Array<{ role: string; content?: string }>;
    };
    const toolMsg = round2Body.messages.find((m) => m.role === "tool");
    expect(toolMsg, "round-2 request carries the re-search result as a tool message").toBeDefined();
    expect(toolMsg?.content ?? "").toContain("1.5% per-month penalty applies to late payments");

    // Server-executed: recorded as user-facing activity, never a routed tool call / chip.
    expect(grounded.toolActivity.some((a) => a.name === "search_documents")).toBe(true);
    expect(grounded.toolCalls.some((c) => c.name === "search_documents")).toBe(false);
  });
});

// loop-tool-secondary-extraction — a server-executed read tool
// (`fetch_document_fields`) pulls ANOTHER document's full extraction mid-answer
// (the same payload the prompt's primary EXTRACTED FIELDS block uses), gated to
// documents the turn already surfaced under the caller's authorization (snippets
// + explicit scope). RED until the tool + the `ServerExecuteContext.fetchExtraction`
// seam land.
describe("agentic secondary-extraction tool (fetch_document_fields)", () => {
  // A GroundX client that routes the extraction GET vs the search POST and
  // records every request path. The search surfaces BOTH doc-a (primary) and
  // doc-b (a genuine SECOND document) so a cross-document fetch can be exercised;
  // the extract endpoint returns `extractionPayload` for whichever doc is fetched.
  function makeRoutingGroundxClient(extractionPayload: unknown) {
    const forward = vi.fn(async (path: string) => {
      if (path.includes("/ingest/document/extract/")) return jsonResponse(extractionPayload);
      return jsonResponse({
        search: {
          results: [
            { documentId: "doc-a", pageNumber: 1, text: "Primary document snippet." },
            { documentId: "doc-b", pageNumber: 1, text: "Second document snippet." },
          ],
        },
      });
    });
    return { client: { forward } as unknown as GroundXClient, forward };
  }

  const bucketScope: ContentScope = { type: "bucket", bucketId: 28454 };
  const toolCall = (id: string, documentId: string) => ({
    choices: [
      {
        message: {
          content: "",
          tool_calls: [{ id, type: "function", function: { name: "fetch_document_fields", arguments: JSON.stringify({ documentId }) } }],
        },
      },
    ],
  });
  const prose = (content: string) => ({ choices: [{ message: { content } }] });

  it("fetches a SURFACED SECOND document's extraction and feeds it back to the model", async () => {
    const { client: llm, forward: llmForward } = makeScriptedLlmClient([
      toolCall("fx1", "doc-b"), // doc-b is the SECOND surfaced doc (not the primary doc-a)
      prose("Both documents put the rate at 1.5%."),
    ]);
    const { client: gx, forward: gxForward } = makeRoutingGroundxClient({ penalty_rate: "1.5% monthly" });

    const grounded = await groundedAnswerOverScope(
      "Compare the penalty across both documents.",
      bucketScope,
      { llmClient: llm, llmModelId: "test-model", groundxClient: gx, groundxApiKey: "k" },
      // extractionContext:false → no PRIMARY extraction fetch, so the only extract
      // call is the secondary tool's (clean assertion).
      { tools: [], toolLoop: { maxRounds: 4 }, turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: false } },
    );

    // The extraction endpoint was hit for the AUTHORIZED SECOND document (doc-b).
    const docBExtracts = gxForward.mock.calls.filter((c) => String(c[0]).includes("/ingest/document/extract/doc-b"));
    expect(docBExtracts.length, "fetched doc-b's extraction").toBeGreaterThanOrEqual(1);

    // The fetched fields actually reached the model in the round-2 tool message.
    const round2 = JSON.parse((llmForward.mock.calls[1][1] as { body: string }).body) as {
      messages: Array<{ role: string; content?: string }>;
    };
    const toolMsg = round2.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content ?? "").toContain("penalty_rate");

    // Server-executed: activity recorded, never a routed tool call.
    expect(grounded.toolActivity.some((a) => a.name === "fetch_document_fields")).toBe(true);
    expect(grounded.toolCalls.some((c) => c.name === "fetch_document_fields")).toBe(false);
  });

  it("REFUSES an out-of-scope documentId — no fetch, no leak, recorded as a FAILURE, turn succeeds (IDOR guard)", async () => {
    const { client: llm, forward: llmForward } = makeScriptedLlmClient([
      toolCall("fx2", "doc-evil"), // NOT surfaced this turn
      prose("I can only use the documents in this conversation."),
    ]);
    // If the guard failed and a fetch leaked through, it would return this.
    const { client: gx, forward: gxForward } = makeRoutingGroundxClient({ secret: "OTHER-TENANT-DATA" });

    const grounded = await groundedAnswerOverScope(
      "What's in some other document?",
      bucketScope, // authorized search surfaces doc-a + doc-b; doc-evil is NOT in scope
      { llmClient: llm, llmModelId: "test-model", groundxClient: gx, groundxApiKey: "k" },
      { tools: [], toolLoop: { maxRounds: 4 }, turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: false } },
    );

    // IDOR guard: NO extraction fetch for the out-of-scope document.
    const evilFetches = gxForward.mock.calls.filter((c) => String(c[0]).includes("/ingest/document/extract/doc-evil"));
    expect(evilFetches, "must NOT fetch an out-of-scope document").toHaveLength(0);

    // The refusal (NOT the other tenant's data) reached the model.
    const round2 = JSON.parse((llmForward.mock.calls[1][1] as { body: string }).body) as {
      messages: Array<{ role: string; content?: string }>;
    };
    const toolMsg = round2.messages.find((m) => m.role === "tool");
    expect((toolMsg?.content ?? "").includes("OTHER-TENANT-DATA"), "never leaks the unauthorized doc").toBe(false);
    expect(toolMsg?.content ?? "").toMatch(/not available|isn't available/i);

    // A refused (security-relevant) attempt is a FAILURE, NOT a successful-looking
    // "fetched" activity — so it surfaces in serverToolFailures, not toolActivity.
    expect(grounded.serverToolFailures.some((f) => f.name === "fetch_document_fields"), "refusal recorded as failure").toBe(true);
    expect(grounded.toolActivity.some((a) => a.name === "fetch_document_fields"), "refusal is NOT a success activity").toBe(false);

    // The turn still succeeds.
    expect(grounded.body.length).toBeGreaterThan(0);
  });

  it("memoizes a repeated fetch of the SAME document within the turn (one API call)", async () => {
    const { client: llm } = makeScriptedLlmClient([
      toolCall("fx3", "doc-b"),
      toolCall("fx4", "doc-b"), // same doc again, a later round
      prose("Confirmed across rounds."),
    ]);
    const { client: gx, forward: gxForward } = makeRoutingGroundxClient({ penalty_rate: "1.5% monthly" });

    await groundedAnswerOverScope(
      "Re-check the second document.",
      bucketScope,
      { llmClient: llm, llmModelId: "test-model", groundxClient: gx, groundxApiKey: "k" },
      { tools: [], toolLoop: { maxRounds: 4 }, turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: false } },
    );

    const docBExtracts = gxForward.mock.calls.filter((c) => String(c[0]).includes("/ingest/document/extract/doc-b"));
    expect(docBExtracts.length, "same-doc re-fetch is memoized to ONE API call").toBe(1);
  });
});
