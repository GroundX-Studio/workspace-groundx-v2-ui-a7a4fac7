import { describe, expect, it, vi } from "vitest";

import type { ContentScope } from "@groundx/shared";

import { groundedAnswerOverScope, type GroundedAnswerDeps } from "./groundedAnswer.js";
import type { GroundXClient, LlmClient } from "../types.js";

/**
 * 2026-06-01-live-report-render §3 — the shared `groundedAnswerOverScope` seam.
 * With injected fake clients returning canned snippets + a grounded answer with
 * a verbatim quote, the helper returns a shared `GeneratedResult` (`body` +
 * verified `citations[]` each with a WF-06b `tier` + `confidence`).
 */

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const scope: ContentScope = { type: "bucket", bucketId: 42 };

describe("groundedAnswerOverScope", () => {
  it("searches the question, grounds the LLM, and returns verified cited prose", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            // No boundingBoxes → searchGroundX resolves pageNumber to the
            // page-1 default, so the verified citation must cite page 1 to
            // match the snippet text (this is the live search contract).
            results: [{ documentId: "d1", text: "the bill total is $214.07" }],
          },
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
    const deps: GroundedAnswerDeps = {
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
      wordMapFetch: async () => null, // no word-level upgrade in this test
    };

    const result = await groundedAnswerOverScope("What is the total?", scope, deps);

    // The JSON block is stripped from the prose body.
    expect(result.body).toBe("The total is $214.07.");
    // One verified citation with a WF-06b tier + confidence.
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({ documentId: "d1", page: 1 });
    // "total is $214.07" is a verbatim substring of the snippet → verified
    // → paraphrase tier (no atom box), confidence > 0.
    expect(result.citations[0].tier).toBe("paraphrase");
    expect(result.citations[0].confidence).toBeGreaterThan(0);
  });

  it("falls back to ambient snippet citations when the LLM emits no citation block", async () => {
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
        jsonOk({ choices: [{ message: { content: "Plain answer, no JSON." } }] }),
      ),
    };
    const deps: GroundedAnswerDeps = {
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
    };

    const result = await groundedAnswerOverScope("Q", scope, deps);
    expect(result.body).toBe("Plain answer, no JSON.");
    expect(result.citations).toHaveLength(2);
    expect(result.citations.every((c) => c.tier === "ambient")).toBe(true);
  });
});
