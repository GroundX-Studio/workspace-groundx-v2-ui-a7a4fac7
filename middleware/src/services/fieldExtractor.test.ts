import { describe, expect, it, vi } from "vitest";

import type { GroundXClient, LlmClient } from "../types.js";
import { extractField } from "./fieldExtractor.js";

/**
 * unify-extract-citations T3 — the extract-field citation is verified + tiered
 * through the SAME pipeline as chat/report (`verifyAndTierSnippetCitation`),
 * not stored as a bare unverified subset. A quote present in a retrieved
 * snippet earns a non-ambient tier + confidence; an unverifiable quote survives
 * at `ambient`; a citation to an unretrieved document is dropped.
 */

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function makeDeps(opts: { snippetText: string; llmCitation: unknown }) {
  const groundxClient: GroundXClient = {
    // Only searchGroundX calls this in the extract path; return one snippet.
    forward: vi.fn(async () =>
      jsonResponse({
        search: { results: [{ documentId: "doc-1", pageNumber: 1, text: opts.snippetText }] },
      }),
    ),
  };
  const llmClient: LlmClient = {
    forward: vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({ value: 7613.2, confidence: 0.9, citation: opts.llmCitation }),
            },
          },
        ],
      }),
    ),
  };
  return {
    llmClient,
    groundxClient,
    groundxApiKey: "k",
    llmModelId: "m",
    // Deterministic: no word-level box, so a verified quote tiers to `paraphrase`.
    wordMapFetch: vi.fn(async () => null),
  };
}

const field = { name: "Amount due", type: "NUMBER" as const, description: "total amount due" };
const scope = { type: "documents" as const, documentIds: ["doc-1"] };

describe("extractField — unified citation verification (T3)", () => {
  it("tiers a citation whose quote is verbatim in a snippet (not a bare citation)", async () => {
    const deps = makeDeps({
      snippetText: "The total amount due is $7,613.20, due by July 30.",
      llmCitation: { documentId: "doc-1", page: 1, quote: "total amount due is $7,613.20" },
    });
    const result = await extractField({ field, contentScope: scope }, deps);
    expect(result.citation).not.toBeNull();
    expect(result.citation?.tier).toBe("paraphrase");
    expect(result.citation?.confidence).toBeGreaterThan(0);
    expect(result.citation?.documentId).toBe("doc-1");
  });

  it("keeps an unverifiable quote at ambient tier (not dropped)", async () => {
    const deps = makeDeps({
      snippetText: "The total amount due is $7,613.20, due by July 30.",
      llmCitation: { documentId: "doc-1", page: 1, quote: "this phrase appears nowhere in the bill" },
    });
    const result = await extractField({ field, contentScope: scope }, deps);
    expect(result.citation).not.toBeNull();
    expect(result.citation?.tier).toBe("ambient");
    expect(result.citation?.confidence).toBe(0);
  });

  it("drops a citation referencing a document not in the retrieved snippets", async () => {
    const deps = makeDeps({
      snippetText: "The total amount due is $7,613.20, due by July 30.",
      llmCitation: { documentId: "ghost-doc", page: 1, quote: "total amount due is $7,613.20" },
    });
    const result = await extractField({ field, contentScope: scope }, deps);
    expect(result.citation).toBeNull();
  });
});
