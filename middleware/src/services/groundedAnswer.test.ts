import { afterEach, describe, expect, it, vi } from "vitest";

import { __clearXrayCache } from "./xrayCache.js";
import { __clearWordMapCache } from "./wordMapCache.js";

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

// The X-Ray + word-map caches are module-global keyed by documentId; the
// fixtures here reuse "d1" across tests (and searchGroundX's geometry
// fallback fetches X-Ray for bbox-less snippets), so clear between tests.
afterEach(() => {
  __clearXrayCache();
  __clearWordMapCache();
});

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

  // Same-page multi-chunk verification (2026-06-12 defect). GroundX search
  // routinely returns SEVERAL chunks for the same (documentId, page) — the
  // utility sample returns 2-3 page-2 chunks. A quote verbatim in the SECOND
  // page-2 chunk must verify (and use that chunk's bbox), not silently fail
  // against the FIRST chunk and demote to `ambient`/confidence 0.
  it("verifies a quote against ALL same-page snippets, not just the first", async () => {
    const pages = [{ number: 2, width: 1000, height: 1000 }];
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [
              {
                documentId: "d1",
                text: "usage history and meter readings for the period",
                boundingBoxes: [
                  { pageNumber: 2, topLeftX: 0, topLeftY: 0, bottomRightX: 100, bottomRightY: 100 },
                ],
                pages,
              },
              {
                documentId: "d1",
                text: "City Sales Tax $3.27 and State Surcharge $1.18 applied",
                boundingBoxes: [
                  { pageNumber: 2, topLeftX: 500, topLeftY: 500, bottomRightX: 600, bottomRightY: 600 },
                ],
                pages,
              },
            ],
          },
        }),
      ),
    };
    const llmAnswer = [
      "Taxes were $3.27 plus $1.18.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":2,"quote":"City Sales Tax $3.27 and State Surcharge $1.18"}]}',
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
      wordMapFetch: async () => null,
    };

    const result = await groundedAnswerOverScope("what taxes were applied?", scope, deps);

    expect(result.citations).toHaveLength(1);
    // Verbatim in the SECOND page-2 chunk → verified (paraphrase, no atom box),
    // NOT demoted to ambient by only checking the first same-page chunk.
    expect(result.citations[0].tier).toBe("paraphrase");
    expect(result.citations[0].confidence).toBeGreaterThan(0);
    // And the bbox is the MATCHING chunk's, not the first same-page chunk's.
    expect(result.citations[0].bbox).toMatchObject({ x: 0.5, y: 0.5 });
  });

  // Latency guard (adversarial review 2026-06-12): the embedder is a LIVE
  // blocking HTTP call (2s abort budget) — once any candidate verifies
  // lexically, scanning the remaining same-page candidates must NOT spend
  // embedder calls (an embedding pass can never out-rank a lexical match).
  it("does not call the embedder for sibling candidates once a lexical match is held", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [
              // Quote matches this first chunk via the NORMALIZED gate
              // (case difference) — no embedder needed.
              { documentId: "d1", text: "city sales tax $3.27 applied" },
              // Lexical miss — pre-fix code would fire the embedder here.
              { documentId: "d1", text: "usage history for the period" },
            ],
          },
        }),
      ),
    };
    const llmAnswer = [
      "Tax was $3.27.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":1,"quote":"City Sales Tax $3.27"}]}',
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    const embedder = vi.fn(async () => 0.99);
    const deps: GroundedAnswerDeps = {
      groundxClient,
      groundxApiKey: "k",
      llmClient,
      llmModelId: "test-model",
      wordMapFetch: async () => null,
      quoteEmbedder: embedder,
    };

    const result = await groundedAnswerOverScope("what tax was applied?", scope, deps);

    expect(result.citations[0].tier).toBe("paraphrase");
    expect(embedder).not.toHaveBeenCalled();
  });

  // Ranking pin (no RED phase — pins already-correct behavior): a later
  // exact match outranks an earlier normalized match.
  it("keeps the BEST same-page verification (exact beats an earlier normalized match)", async () => {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [
              { documentId: "d1", text: "city sales tax $3.27 applied" }, // normalized
              { documentId: "d1", text: "City Sales Tax $3.27 applied" }, // exact
            ],
          },
        }),
      ),
    };
    const llmAnswer = [
      "Tax was $3.27.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":1,"quote":"City Sales Tax $3.27"}]}',
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
      wordMapFetch: async () => null,
    };

    const result = await groundedAnswerOverScope("what tax was applied?", scope, deps);
    // exact method, no atom box → paraphrase tier but confidence 1 (exact).
    expect(result.citations[0].tier).toBe("paraphrase");
    expect(result.citations[0].confidence).toBe(1);
  });

  // No invented citations (2026-06-11). The model is INSTRUCTED to emit the
  // citations block only for content claims and to skip it for non-content
  // turns (product questions, jokes, small talk). Omitting the block is
  // therefore the model's signal that the answer did not draw on the
  // documents — the old "ambient fallback" (cite the top snippets anyway)
  // fabricated document citations for answers that never used them. A reply
  // SHALL carry citations only when the model actually cited.
  it("emits NO citations when the LLM omits the citation block (no invented ambient fallback)", async () => {
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
    expect(result.citations).toHaveLength(0);
  });

  // turn-router-extraction-appstate Task 1 — the extractionContext gate.
  // `false` skips fetchDocumentExtraction BEFORE any HTTP call; `true`
  // preserves today's fetch-when-primary-doc-exists behavior.
  describe("extractionContext plan gate", () => {
    const docScope: ContentScope = { type: "documents", documentIds: ["d1"] };

    function depsWithSpies(): {
      deps: GroundedAnswerDeps;
      groundxForward: ReturnType<typeof vi.fn>;
      llmForward: ReturnType<typeof vi.fn>;
    } {
      const groundxForward = vi.fn(async () =>
        jsonOk({ search: { results: [{ documentId: "d1", text: "total is $214.07" }] } }),
      );
      const llmForward = vi.fn(async () =>
        jsonOk({ choices: [{ message: { content: "Hello!" } }] }),
      );
      return {
        groundxForward,
        llmForward,
        deps: {
          groundxClient: { forward: groundxForward },
          groundxApiKey: "k",
          llmClient: { forward: llmForward },
          llmModelId: "test-model",
        },
      };
    }

    it("extractionContext: false makes NO extract request and the prompt carries no extraction block", async () => {
      const { deps, groundxForward, llmForward } = depsWithSpies();
      await groundedAnswerOverScope("hi there!", docScope, deps, {
        turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: false },
      });
      const extractCalls = groundxForward.mock.calls.filter(([path]) =>
        String(path).includes("/ingest/document/extract/"),
      );
      expect(extractCalls).toHaveLength(0);
      const llmBody = JSON.parse((llmForward.mock.calls[0][1] as { body: string }).body) as {
        messages: Array<{ content: string }>;
      };
      expect(llmBody.messages.map((m) => m.content).join("\n")).not.toContain("EXTRACTED FIELDS");
    });

    it("extractionContext: true fetches the primary document's extraction as today", async () => {
      const { deps, groundxForward } = depsWithSpies();
      await groundedAnswerOverScope("how many meters?", docScope, deps, {
        turnPlan: { documentSearch: true, productKnowledge: false, extractionContext: true },
      });
      const extractCalls = groundxForward.mock.calls.filter(([path]) =>
        String(path).includes("/ingest/document/extract/"),
      );
      expect(extractCalls).toHaveLength(1);
      expect(String(extractCalls[0][0])).toContain("d1");
    });
  });

  // wire-embedding-verification — the third verification gate. A quote that
  // matches the chunk by MEANING only (no exact/normalized hit) verifies via
  // the injected embedder and earns the paraphrase tier; without an embedder
  // (dev-degrade) or on any embedder failure it stays ambient and the turn
  // always succeeds.
  describe("embedding-similarity verification (third gate)", () => {
    // Quote shares no usable lexical overlap with the snippet text.
    const PARAPHRASE_QUOTE = "monthly amount owed by the customer";
    const SNIPPET_TEXT = "the bill total is $214.07";

    function depsWithCitedParaphrase(
      quoteEmbedder?: GroundedAnswerDeps["quoteEmbedder"],
    ): GroundedAnswerDeps {
      const groundxClient: GroundXClient = {
        forward: vi.fn(async () =>
          jsonOk({ search: { results: [{ documentId: "d1", text: SNIPPET_TEXT }] } }),
        ),
      };
      const llmAnswer = [
        "You owe $214.07 this month.",
        "",
        "```json",
        `{"citations":[{"documentId":"d1","page":1,"quote":"${PARAPHRASE_QUOTE}"}]}`,
        "```",
      ].join("\n");
      const llmClient: LlmClient = {
        forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
      };
      return {
        groundxClient,
        groundxApiKey: "k",
        llmClient,
        llmModelId: "test-model",
        wordMapFetch: async () => null,
        ...(quoteEmbedder ? { quoteEmbedder } : {}),
      };
    }

    it("meaning-level paraphrase + embedder above threshold → paraphrase tier, cosine confidence", async () => {
      const deps = depsWithCitedParaphrase(async () => 0.9);
      const result = await groundedAnswerOverScope("What do I owe?", scope, deps);
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].tier).toBe("paraphrase");
      expect(result.citations[0].confidence).toBe(0.9);
    });

    it("no embedder dep (dev-degrade) → ambient, exactly today's behavior", async () => {
      const result = await groundedAnswerOverScope("What do I owe?", scope, depsWithCitedParaphrase());
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0].tier).toBe("ambient");
    });

    it("embedder resolving 0 (provider failure/timeout) → ambient, turn succeeds", async () => {
      const deps = depsWithCitedParaphrase(async () => 0);
      const result = await groundedAnswerOverScope("What do I owe?", scope, deps);
      expect(result.citations[0].tier).toBe("ambient");
    });

    it("embedder that REJECTS → ambient, turn succeeds (seam holds the never-fail invariant)", async () => {
      const deps = depsWithCitedParaphrase(async () => {
        throw new Error("provider exploded");
      });
      const result = await groundedAnswerOverScope("What do I owe?", scope, deps);
      expect(result.citations[0].tier).toBe("ambient");
    });

    it("embedThreshold dep is honored (cosine below custom threshold → ambient)", async () => {
      const deps = { ...depsWithCitedParaphrase(async () => 0.9), embedThreshold: 0.95 };
      const result = await groundedAnswerOverScope("What do I owe?", scope, deps);
      expect(result.citations[0].tier).toBe("ambient");
    });
  });
});

// harden-citation-emission T1c — citation funnel observability (RED first).
// A turn whose ONE emitted extraction citation is dropped by value-mismatch
// must surface the loss on the debug accumulator: omitted-block turns
// (emitted: 0) become distinguishable from all-dropped turns.
describe("citation funnel (harden-citation-emission)", () => {
  it("surfaces emitted/shipped/dropReasons for a value-mismatch drop", async () => {
    const docScope: ContentScope = { type: "documents", documentIds: ["d1"] };
    const groundxClient: GroundXClient = {
      forward: vi.fn(async (path: string) => {
        if (String(path).startsWith("/ingest/document/extract/")) {
          return jsonOk({ invoice_number: "10295809" });
        }
        return jsonOk({
          search: { results: [{ documentId: "d1", text: "unrelated snippet text" }] },
        });
      }),
    };
    const llmAnswer = [
      "The invoice number is 99999999.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","field":"invoice_number","value":"99999999"}]}',
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
      wordMapFetch: async () => null,
    };
    const debug: Record<string, unknown> = {};

    const result = await groundedAnswerOverScope("what is the invoice number?", docScope, deps, {
      debug,
    });

    expect(result.citations).toHaveLength(0);
    expect(debug.citations).toMatchObject({
      emitted: 1,
      shipped: 0,
      dropReasons: { value: 1 },
    });
  });
});

// harden-citation-emission T4 — structural extraction truncation (RED first).
// The prompt's EXTRACTED FIELDS block must ALWAYS be valid JSON: over-budget
// payloads shed whole trailing array items (never mid-string slicing) and
// carry a machine-readable `_truncated` marker; citation validation keeps
// using the FULL payload regardless of what the prompt shows.
describe("extraction prompt-block truncation (harden-citation-emission)", () => {
  const docScope: ContentScope = { type: "documents", documentIds: ["d1"] };

  /** Capture the EXTRACTED FIELDS block out of the grounded user message. */
  function extractionBlockFrom(llmForward: ReturnType<typeof vi.fn>): string | null {
    for (const call of llmForward.mock.calls) {
      const body = JSON.parse(String((call[1] as RequestInit).body)) as {
        messages?: Array<{ role: string; content: string | null }>;
      };
      const user = body.messages?.find((m) => m.role === "user")?.content ?? "";
      const m = user.match(/EXTRACTED FIELDS \(full workflow output for this document\):\n([\s\S]*?)\n\nQuestion:/);
      if (m) return m[1];
    }
    return null;
  }

  function mkClients(extractionPayload: unknown) {
    const groundxClient: GroundXClient = {
      forward: vi.fn(async (path: string) => {
        if (String(path).startsWith("/ingest/document/extract/")) return jsonOk(extractionPayload);
        return jsonOk({ search: { results: [{ documentId: "d1", text: "snippet text" }] } });
      }),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: "Answer." } }] })),
    };
    return { groundxClient, llmClient };
  }

  it("keeps an under-budget payload byte-identical", async () => {
    const payload = { invoice_number: "10295809", meters: [{ meter_number: "49099992" }] };
    const { groundxClient, llmClient } = mkClients(payload);
    await groundedAnswerOverScope("q", docScope, {
      groundxClient, groundxApiKey: "k", llmClient, llmModelId: "m", wordMapFetch: async () => null,
    });
    expect(extractionBlockFrom(llmClient.forward as ReturnType<typeof vi.fn>)).toBe(JSON.stringify(payload));
  });

  it("sheds whole trailing array items into ALWAYS-valid JSON with a _truncated marker", async () => {
    // ~200 items x ~90 chars ≈ 18k chars — well over the 12k budget.
    const payload = {
      invoice_number: "10295809",
      meters: Array.from({ length: 200 }, (_, i) => ({
        meter_number: `M-${String(i).padStart(6, "0")}`,
        service: "Commercial Water and Sewer service line",
      })),
    };
    const { groundxClient, llmClient } = mkClients(payload);
    await groundedAnswerOverScope("q", docScope, {
      groundxClient, groundxApiKey: "k", llmClient, llmModelId: "m", wordMapFetch: async () => null,
    });
    const block = extractionBlockFrom(llmClient.forward as ReturnType<typeof vi.fn>);
    expect(block).not.toBeNull();
    expect(block!.length).toBeLessThanOrEqual(12_000);
    const parsed = JSON.parse(block!) as { _truncated?: string; meters?: unknown[]; invoice_number?: string };
    expect(parsed._truncated).toMatch(/omitted/);
    expect(parsed.invoice_number).toBe("10295809");
    // Whole trailing items shed — the survivors are intact objects.
    expect(parsed.meters!.length).toBeGreaterThan(0);
    expect(parsed.meters!.length).toBeLessThan(200);
    expect(parsed.meters![0]).toMatchObject({ meter_number: "M-000000" });
  });

  it("validates a citation to a field SHED from the truncated prompt block (full payload wins)", async () => {
    // meters[199] is dropped from the prompt by the structural fit, but the
    // model may still know it (e.g. from a snippet) — validation must run
    // against the FULL fetched payload, not the truncated prompt block.
    const payload = {
      meters: Array.from({ length: 200 }, (_, i) => ({
        meter_number: `M-${String(i).padStart(6, "0")}`,
        service: "Commercial Water and Sewer service line",
      })),
    };
    const groundxClient: GroundXClient = {
      forward: vi.fn(async (path: string) => {
        if (String(path).startsWith("/ingest/document/extract/")) return jsonOk(payload);
        if (String(path).startsWith("/ingest/document/xray/")) {
          return jsonOk({
            chunks: [
              {
                text: "Meter M-000199 service summary",
                boundingBoxes: [
                  { pageNumber: 3, topLeftX: 10, topLeftY: 10, bottomRightX: 90, bottomRightY: 30 },
                ],
                pageNumbers: [3],
              },
            ],
            documentPages: [{ pageNumber: 3, width: 1000, height: 1000 }],
          });
        }
        return jsonOk({ search: { results: [{ documentId: "d1", text: "snippet text" }] } });
      }),
    };
    const llmAnswer = [
      "The last meter is M-000199.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","field":"meters[199].meter_number","value":"M-000199"}]}',
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };

    const result = await groundedAnswerOverScope("what is the last meter?", docScope, {
      groundxClient, groundxApiKey: "k", llmClient, llmModelId: "m", wordMapFetch: async () => null,
    });

    expect(result.citations).toHaveLength(1);
    expect(result.citations[0]).toMatchObject({ documentId: "d1", page: 3, tier: "paraphrase" });
  });

  it("truncates a lone oversized scalar IN PLACE keeping valid JSON", async () => {
    const payload = { blob: "y".repeat(20_000) };
    const { groundxClient, llmClient } = mkClients(payload);
    await groundedAnswerOverScope("q", docScope, {
      groundxClient, groundxApiKey: "k", llmClient, llmModelId: "m", wordMapFetch: async () => null,
    });
    const block = extractionBlockFrom(llmClient.forward as ReturnType<typeof vi.fn>);
    expect(block!.length).toBeLessThanOrEqual(12_000);
    const parsed = JSON.parse(block!) as { blob?: string; _truncated?: string };
    // The value survives truncated, not dropped to an empty object.
    expect(parsed.blob!.length).toBeGreaterThan(1_000);
    expect(parsed._truncated).toBeDefined();
  });
});
