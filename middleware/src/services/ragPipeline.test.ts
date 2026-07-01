import { describe, expect, it, vi } from "vitest";

import type { GroundXClient, LlmClient } from "../types.js";
import type { ChatRouterRequest } from "./chatRouterTypes.js";

import * as groundedAnswerModule from "./groundedAnswer.js";
import { callGroundedLlm, parseGroundedAnswer, runRagPipeline, synthesizeToolOnlyConfirmation } from "./ragPipeline.js";

/**
 * 2026-06-01-live-report-render §3 — behavior-parity for the `runRagPipeline`
 * migration onto the shared `groundedAnswerOverScope` seam. The chat path's
 * search → grounded-generation → WF-06b-verify per-answer loop now has ONE home
 * (the helper); these assertions pin that (a) `runRagPipeline` ROUTES THROUGH
 * the helper (it is the genuine second caller, not a dormant abstraction) and
 * (b) the citations/tiers it emits are IDENTICAL to what they were inline.
 */

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function makeRequest(overrides: Partial<ChatRouterRequest> = {}): ChatRouterRequest {
  return {
    newUserMessage: "What is the total?",
    currentEntityKey: null,
    conversationTail: { messageCount: 0, lastTurnContent: null },
    recentViewerEvents: [],
    intent: "chat.sources",
    ...overrides,
  };
}

describe("runRagPipeline migrated onto groundedAnswerOverScope", () => {
  it("routes the per-answer body through the shared helper and emits identical verified citations", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: { results: [{ documentId: "d1", text: "the bill total is $214.07" }] },
        }),
      ),
    };
    const llmAnswer = [
      "The total is $214.07.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":1,"quote":"total is $214.07"}]}',
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };

    const spy = vi.spyOn(groundedAnswerModule, "groundedAnswerOverScope");

    const reply = await runRagPipeline(makeRequest(), {
      llmClient,
      groundxClient,
      groundxApiKey: "k",
      samplesBucketId: 42,
      llmModelId: "test-model",
      wordMapFetch: async () => null,
    });

    // The genuine second caller — the helper actually ran (not a dormant abstraction).
    expect(spy).toHaveBeenCalledTimes(1);

    expect(reply.mode).toBe("rag");
    // Body is the JSON-block-stripped prose.
    expect(reply.answer).toBe("The total is $214.07.");
    // Verified citation with a WF-06b tier + confidence — identical to the
    // pre-migration inline loop output.
    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0]).toMatchObject({ documentId: "d1", page: 1, tier: "paraphrase" });
    expect(reply.citations[0].confidence).toBeGreaterThan(0);

    spy.mockRestore();
  });
});

/**
 * harden-citation-emission T1a — parser hardening (RED first).
 *
 * The multi-fence merge landed (scan-all, metadata-key stripping); these pin
 * the RESIDUAL gaps: one-line fences, ```JSON casing, a bare trailing
 * citations object, duplicate entries across merged blocks, numeric-string
 * `page`, and parse-loss counters. The untagged-content-fence case is a PIN
 * (green at birth) protecting the metadata-key strip criterion through the
 * tolerant-pattern change.
 */
describe("parseGroundedAnswer hardening (harden-citation-emission)", () => {
  const entry = '{"documentId":"d1","page":2,"quote":"City Sales Tax $3.27"}';

  it("recovers citations from a ONE-LINE fence", () => {
    const parsed = parseGroundedAnswer(`The tax was $3.27.\n\n\`\`\`json {"citations":[${entry}]} \`\`\``);
    expect(parsed.structuredCitations).toHaveLength(1);
    expect(parsed.cleanedAnswer).toBe("The tax was $3.27.");
  });

  it("keeps inline [N] markers in the cleanedAnswer — only the fence is stripped (Phase D 6.2)", () => {
    const parsed = parseGroundedAnswer(`The total is $7,613.20 [1].\n\n\`\`\`json\n{"citations":[${entry}]}\n\`\`\``);
    expect(parsed.cleanedAnswer).toBe("The total is $7,613.20 [1].");
    expect(parsed.structuredCitations).toHaveLength(1);
  });

  it("recovers citations from an UPPERCASE fence tag (JSON)", () => {
    const parsed = parseGroundedAnswer(`The tax was $3.27.\n\n\`\`\`JSON\n{"citations":[${entry}]}\n\`\`\``);
    expect(parsed.structuredCitations).toHaveLength(1);
  });

  it("recovers a bare trailing un-fenced citations object", () => {
    const parsed = parseGroundedAnswer(`The tax was $3.27.\n\n{"citations":[${entry}]}`);
    expect(parsed.structuredCitations).toHaveLength(1);
    expect(parsed.cleanedAnswer).toBe("The tax was $3.27.");
  });

  it("dedupes identical entries merged from two blocks", () => {
    const block = `\`\`\`json\n{"citations":[${entry}]}\n\`\`\``;
    const parsed = parseGroundedAnswer(`Answer.\n\n${block}\n\n${block}`);
    expect(parsed.structuredCitations).toHaveLength(1);
  });

  it("keeps two same-quote entries with DIFFERENT answerSpans (dedup key includes answerSpan)", () => {
    const a = '{"documentId":"d1","page":2,"quote":"Tax $3.27","answerSpan":"first claim"}';
    const b = '{"documentId":"d1","page":2,"quote":"Tax $3.27","answerSpan":"second claim"}';
    const parsed = parseGroundedAnswer(`Answer.\n\n\`\`\`json\n{"citations":[${a},${b}]}\n\`\`\``);
    expect(parsed.structuredCitations).toHaveLength(2);
  });

  it("coerces a numeric-string page to a number", () => {
    const parsed = parseGroundedAnswer(
      `Answer.\n\n\`\`\`json\n{"citations":[{"documentId":"d1","page":"2","quote":"City Sales Tax $3.27"}]}\n\`\`\``,
    );
    expect(parsed.structuredCitations).toHaveLength(1);
    expect(parsed.structuredCitations?.[0]).toMatchObject({ page: 2 });
  });

  it("counts parse-level losses on the parse result", () => {
    // One malformed json block (unparseable) + one block whose only entry is
    // invalid (no documentId) -> both counted, structuredCitations null.
    const raw = [
      "Answer.",
      "",
      "```json",
      '{"citations":[{"page":2,"quote":"x',
      "```",
      "",
      "```json",
      '{"citations":[{"page":2}]}',
      "```",
    ].join("\n");
    const parsed = parseGroundedAnswer(raw);
    expect(parsed.structuredCitations).toBeNull();
    // Cast: the field lands on ParsedRagAnswer in T3 (RED via undefined here,
    // without failing tsc for the whole suite meanwhile).
    expect((parsed as { parseLosses?: unknown }).parseLosses).toMatchObject({ malformedJson: 1, invalidEntries: 1 });
  });

  it("PIN: an untagged content fence stays in the body while citations are recovered", () => {
    const raw = [
      "Here is the config you asked for:",
      "",
      "```",
      '{"redis": {"host": "localhost"}}',
      "```",
      "",
      "```json",
      `{"citations":[${entry}]}`,
      "```",
    ].join("\n");
    const parsed = parseGroundedAnswer(raw);
    expect(parsed.structuredCitations).toHaveLength(1);
    expect(parsed.cleanedAnswer).toContain('"redis"');
    expect(parsed.cleanedAnswer).not.toContain('"citations"');
  });
});

// harden-citation-emission T3 — completion bounds (RED first). The grounded
// call must carry an explicit output ceiling on EVERY round (the citations
// fence is contractually LAST in the completion — an unbounded length cut
// amputates exactly the citations), and a length-cut final round must be
// visible, never silent.
describe("callGroundedLlm completion bounds (harden-citation-emission)", () => {
  it("sends max_completion_tokens on the request body", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const llmClient: LlmClient = {
      forward: vi.fn(async (_path: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "Answer." }, finish_reason: "stop" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    };
    await callGroundedLlm("q", [], llmClient, "test-model");
    expect(bodies).toHaveLength(1);
    expect(bodies[0].max_completion_tokens).toBe(4096);
    // No temperature pin (adversarial review m4 — unmotivated).
    expect(bodies[0]).not.toHaveProperty("temperature");
  });

  it("flags a length-cut final round as truncated without failing the turn", async () => {
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "Cut off answ" }, finish_reason: "length" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    };
    const res = await callGroundedLlm("q", [], llmClient, "test-model");
    expect(res.answer).toBe("Cut off answ");
    expect((res as { truncated?: boolean }).truncated).toBe(true);
  });
});

describe("callGroundedLlm streaming (chat-response-streaming P1.1)", () => {
  const SSE_HEADERS = { "content-type": "text/event-stream" };
  const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

  it("sends stream:true and re-emits each content delta via onToken; assembles the same answer", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const llmClient: LlmClient = {
      forward: vi.fn(async (_path: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        bodies.push(body);
        const sse =
          frame({ choices: [{ delta: { content: "Hello " }, index: 0 }] }) +
          frame({ choices: [{ delta: { content: "world." }, index: 0 }] }) +
          frame({ choices: [{ delta: {}, finish_reason: "stop", index: 0 }] }) +
          "data: [DONE]\n\n";
        return new Response(sse, { status: 200, headers: SSE_HEADERS });
      }),
    };
    const tokens: string[] = [];
    const res = await callGroundedLlm(
      "q", [], llmClient, "test-model",
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { onToken: (d) => tokens.push(d) },
    );
    expect(bodies[0].stream).toBe(true);
    expect(tokens).toEqual(["Hello ", "world."]);
    expect(res.answer).toBe("Hello world.");
  });

  it("falls back to JSON parsing when a streaming-requested provider returns non-SSE", async () => {
    // Provider ignored stream:true and returned ordinary JSON — the dispatch must
    // still parse it (graceful fallback), and onToken simply never fires.
    const tokens: string[] = [];
    const llmClient: LlmClient = {
      forward: vi.fn(async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "Plain JSON answer." }, finish_reason: "stop" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    };
    const res = await callGroundedLlm(
      "q", [], llmClient, "test-model",
      undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined,
      { onToken: (d) => tokens.push(d) },
    );
    expect(res.answer).toBe("Plain JSON answer.");
    expect(tokens).toEqual([]);
  });

  it("does NOT send stream:true when no streaming option is given (JSON path unchanged)", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    const llmClient: LlmClient = {
      forward: vi.fn(async (_path: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "plain" }, finish_reason: "stop" }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    };
    const res = await callGroundedLlm("q", [], llmClient, "test-model");
    expect(bodies[0]).not.toHaveProperty("stream");
    expect(res.answer).toBe("plain");
  });
});

/**
 * standardized-viewer-control T7 — `offerAs` disposition routing.
 *
 * A navigation tool call carrying the optional `offerAs` disposition is NOT
 * auto-dispatched: the pipeline builds the intent via the tool's intentBuilder
 * (which IGNORES `offerAs`) and surfaces it as an OFFERED `suggestedActions`
 * entry (a clickable chip / inline anchor) the USER triggers. Absence keeps
 * today's behavior (read navigation auto-dispatches on `intents[]`).
 */
describe("offerAs disposition (standardized-viewer-control T7)", () => {
  function groundxWithHit(): GroundXClient {
    return {
      forward: vi.fn(async () =>
        jsonOk({ search: { results: [{ documentId: "d1", pageNumber: 1, text: "the bill total is $214.07" }] } }),
      ),
    };
  }
  function llmEmittingToolCall(name: string, args: Record<string, unknown>): LlmClient {
    return {
      forward: vi.fn(async () =>
        jsonOk({
          choices: [
            {
              message: {
                content: "Here is the answer.",
                tool_calls: [
                  { id: "call_1", type: "function", function: { name, arguments: JSON.stringify(args) } },
                ],
              },
            },
          ],
        }),
      ),
    };
  }
  const deps = (llmClient: LlmClient, groundxClient: GroundXClient) => ({
    llmClient,
    groundxClient,
    groundxApiKey: "k",
    samplesBucketId: 42,
    llmModelId: "test-model",
    wordMapFetch: async () => null,
  });

  it("a navigation tool WITHOUT offerAs auto-dispatches on intents[] (today's behavior)", async () => {
    const reply = await runRagPipeline(
      makeRequest(),
      deps(
        llmEmittingToolCall("show_extraction", { scope: { type: "documents", documentIds: ["d1"] } }),
        groundxWithHit(),
      ),
    );
    const kinds = reply.intents.map((i) => (i.intent as { kind?: string }).kind);
    expect(kinds).toContain("showExtract");
    // No offered chip surfaced.
    expect(reply.suggestedActions.some((a) => a.key === "tool:show_extraction")).toBe(false);
  });

  it("a navigation tool WITH offerAs surfaces an offered suggestedActions entry instead of auto-dispatching", async () => {
    const reply = await runRagPipeline(
      makeRequest(),
      deps(
        llmEmittingToolCall("show_extraction", {
          scope: { type: "documents", documentIds: ["d1"] },
          offerAs: { label: "→ open the extract" },
        }),
        groundxWithHit(),
      ),
    );
    // NOT auto-dispatched.
    const kinds = reply.intents.map((i) => (i.intent as { kind?: string }).kind);
    expect(kinds).not.toContain("showExtract");
    // Offered as a chip with the offer's label + the built intent on detail.
    const chip = reply.suggestedActions.find((a) => a.key === "tool:show_extraction");
    expect(chip).toBeDefined();
    expect(chip!.label).toBe("→ open the extract");
    expect((chip!.detail?.intent as { kind?: string } | undefined)?.kind).toBe("showExtract");
  });

  it("the built intent NEVER carries offerAs (presentation, not a domain arg)", async () => {
    const reply = await runRagPipeline(
      makeRequest(),
      deps(
        llmEmittingToolCall("show_integrate", {
          scope: { type: "documents", documentIds: ["d1"] },
          offerAs: { label: "→ integrate this" },
        }),
        groundxWithHit(),
      ),
    );
    const chip = reply.suggestedActions.find((a) => a.key === "tool:show_integrate");
    expect(chip).toBeDefined();
    expect(chip!.detail?.intent).not.toHaveProperty("offerAs");
  });

  it("offerAs carries an optional inline anchor onto the offered entry", async () => {
    const reply = await runRagPipeline(
      makeRequest(),
      deps(
        llmEmittingToolCall("show_smart_report_render", {
          scope: { type: "documents", documentIds: ["d1"] },
          offerAs: { label: "→ see the report", anchor: "the report" },
        }),
        groundxWithHit(),
      ),
    );
    const chip = reply.suggestedActions.find((a) => a.key === "tool:show_smart_report_render");
    expect(chip).toBeDefined();
    expect(chip!.anchor).toBe("the report");
  });

  it("a UI-only navigation tool (open_document) drops an unexpected offerAs key and still auto-dispatches", async () => {
    // open_document's schema does NOT declare offerAs — Zod strips the unknown
    // key, so there is no offered chip; the read navigation auto-dispatches.
    const reply = await runRagPipeline(
      makeRequest(),
      deps(
        llmEmittingToolCall("open_document", { documentId: "d1", offerAs: { label: "→ nope" } }),
        groundxWithHit(),
      ),
    );
    expect(reply.suggestedActions.some((a) => a.key === "tool:open_document")).toBe(false);
    const kinds = reply.intents.map((i) => (i.intent as { kind?: string }).kind);
    expect(kinds).toContain("highlightCitation");
  });

  it("show_extraction_edit emits an editSchema intent (the schema design surface)", async () => {
    const reply = await runRagPipeline(
      makeRequest(),
      deps(llmEmittingToolCall("show_extraction_edit", { schema_id: "tmpl-1" }), groundxWithHit()),
    );
    const intent = reply.intents.map((i) => i.intent as { kind?: string; schemaId?: string }).find((i) => i.kind === "editSchema");
    expect(intent).toBeDefined();
    expect(intent!.schemaId).toBe("tmpl-1");
  });
});

describe("synthesizeToolOnlyConfirmation — never claims an action that won't dispatch (Finding 4)", () => {
  const call = (name: string, args: unknown) => ({ id: "c0", name, argumentsJson: JSON.stringify(args) });
  const validScope = { scope: { type: "documents", documentIds: ["doc-1"] } };

  it("confirms a navigation whose args VALIDATE", () => {
    expect(synthesizeToolOnlyConfirmation([call("show_extraction", validScope)])).toBe(
      "Opening the extracted fields.",
    );
  });

  it("returns null (NOT a claim) when the nav args are INVALID — signals 'fall back to a real answer'", () => {
    // A malformed scope fails the same inputSchema.safeParse the intent router
    // uses, so the intent is dropped — no confirmation, and null tells the caller
    // this isn't a navigation (so it forces a real answer instead of a canned line).
    const out = synthesizeToolOnlyConfirmation([call("show_extraction", { scope: { type: "bogus" } })]);
    expect(out).toBeNull();
  });

  it("confirms only the VALID call in a mixed batch", () => {
    const out = synthesizeToolOnlyConfirmation([
      call("show_extraction", { scope: { nonsense: true } }), // invalid → dropped
      call("show_integrate", validScope), // valid → confirmed
    ]);
    expect(out).toBe("Opening the integration options.");
  });

  it("returns null for server tools / unknown tools / non-JSON args (no nav to confirm → answer-forcing path)", () => {
    // A server tool (search) has no intentBuilder → null → the caller forces a
    // real answer via a tools-off dispatch (the tool-loop-exhaustion case).
    expect(synthesizeToolOnlyConfirmation([call("search_documents", { query: "x" })])).toBeNull();
    expect(synthesizeToolOnlyConfirmation([{ id: "c1", name: "not_a_tool", argumentsJson: "{}" }])).toBeNull();
    expect(synthesizeToolOnlyConfirmation([{ id: "c2", name: "show_extraction", argumentsJson: "{not json" }])).toBeNull();
  });
});
