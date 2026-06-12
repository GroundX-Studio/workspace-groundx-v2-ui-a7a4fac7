import { describe, expect, it, vi } from "vitest";

import type { GroundXClient, LlmClient } from "../types.js";
import type { ChatRouterRequest } from "./chatRouterTypes.js";

import * as groundedAnswerModule from "./groundedAnswer.js";
import { callGroundedLlm, parseGroundedAnswer, runRagPipeline } from "./ragPipeline.js";

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
