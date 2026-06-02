/**
 * 2026-06-01-projects-rbac-scope-filter Task 6.1 — the RAG-correctness
 * regression suite (the surviving piece of the withdrawn
 * rag-retrieval-correctness). OFFLINE + deterministic: fake `GroundXClient` /
 * `LlmClient` replay a known-answerable snippet + a grounded answer, and we
 * assert the shared `groundedAnswerOverScope` seam yields a cited answer for
 * every ground-truth pair over the seeded Utility sample — plus a hard
 * "never silently no-snippets" tripwire. NO live network.
 *
 * (The scope→filter→RBAC half of the DL-1 fix is locked separately by
 * `entityScopeProducer.test.ts` (producer emits the real projectId) and
 * `projectAccess.test.ts` (RBAC cross-user isolation). This suite locks the
 * generation+citation guarantee: an answerable query NEVER silently refuses.)
 */
import { describe, expect, it, vi } from "vitest";

import type { ContentScope } from "@groundx/shared";

import { groundedAnswerOverScope, type GroundedAnswerDeps } from "./groundedAnswer.js";
import type { GroundXClient, LlmClient } from "../types.js";

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE_DOC = "c3bfff49-6640-4213-822b-e81c3a771e45";
const UTILITY_SCOPE: ContentScope = {
  type: "bucket",
  bucketId: 28454,
  filter: { projectId: ["proj_c7701da7-0e08-482a-a496-df9dfe991613"] },
};

/** Ground-truth Q&A over the seeded Utility bill (values from the real doc). */
const GROUND_TRUTH = [
  {
    q: "What is the total amount due on this bill?",
    expect: "7,613.20",
    snippet: '{"amount_due":"$ 7,613.20","customer":"KWIK TRIP (1147)","total_amount_due":"$ 7,613.20"}',
    quote: '"amount_due":"$ 7,613.20"',
  },
  {
    q: "Who is the bill addressed to?",
    expect: "KWIK TRIP (1147)",
    snippet: '{"addressee":"KWIK TRIP (1147)","utility_company":"City of Windom"}',
    quote: '"addressee":"KWIK TRIP (1147)"',
  },
  {
    q: "How many meters are on this bill?",
    expect: "8",
    snippet: "This statement covers 8 meters across electric, water/sewer and water-only accounts.",
    quote: "covers 8 meters",
  },
] as const;

function depsFor(snippet: string, answer: string): GroundedAnswerDeps {
  const groundxClient: GroundXClient = {
    forward: vi.fn(async () =>
      jsonOk({ search: { results: [{ documentId: SAMPLE_DOC, text: snippet }] } }),
    ),
  };
  const llmClient: LlmClient = {
    forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: answer } }] })),
  };
  return { groundxClient, groundxApiKey: "k", llmClient, llmModelId: "test-model", wordMapFetch: async () => null };
}

describe("RAG correctness regression — Utility ground truth", () => {
  for (const pair of GROUND_TRUTH) {
    it(`answers "${pair.q}" with a grounded citation (contains ${pair.expect})`, async () => {
      const answer = [
        `${pair.expect} — per the bill.`,
        "```json",
        `{"citations":[{"documentId":"${SAMPLE_DOC}","page":1,"quote":${JSON.stringify(pair.quote)}}]}`,
        "```",
      ].join("\n");
      const result = await groundedAnswerOverScope(pair.q, UTILITY_SCOPE, depsFor(pair.snippet, answer));

      expect(result.body).toContain(pair.expect); // the answer surfaces the value
      expect(result.citations.length).toBeGreaterThanOrEqual(1); // ≥1 citation
      expect(result.citations[0]).toMatchObject({ documentId: SAMPLE_DOC });
      expect(result.citations[0].tier).not.toBe("ambient"); // verbatim quote → verified tier
    });
  }

  it("TRIPWIRE: a known-answerable query NEVER silently returns 0 citations / a no-snippets refusal", async () => {
    const pair = GROUND_TRUTH[0]; // amount due
    const answer = [
      `The total amount due is $7,613.20.`,
      "```json",
      `{"citations":[{"documentId":"${SAMPLE_DOC}","page":1,"quote":${JSON.stringify(pair.quote)}}]}`,
      "```",
    ].join("\n");
    const result = await groundedAnswerOverScope(pair.q, UTILITY_SCOPE, depsFor(pair.snippet, answer));

    expect(result.citations.length).toBeGreaterThan(0); // the DL-1 regression tripwire
    expect(result.body.toLowerCase()).not.toContain("no snippets");
    expect(result.body).toContain("7,613.20");
  });
});
