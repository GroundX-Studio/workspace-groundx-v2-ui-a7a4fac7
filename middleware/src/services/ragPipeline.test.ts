import { describe, expect, it, vi } from "vitest";

import type { GroundXClient, LlmClient } from "../types.js";
import type { ChatRouterRequest } from "./chatRouterTypes.js";

import * as groundedAnswerModule from "./groundedAnswer.js";
import { runRagPipeline } from "./ragPipeline.js";

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
