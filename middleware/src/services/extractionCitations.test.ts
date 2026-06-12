import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroundXClient, LlmClient } from "../types.js";

import { routeChat, type ChatRouterRequest } from "./chatRouter.js";
import { __clearXrayCache } from "./xrayCache.js";
import { __clearWordMapCache } from "./wordMapCache.js";
import type { WordMap } from "./citationGeometry.js";

/**
 * 2026-06-11-extraction-grounded-citations — T1, the failing user-visible test.
 *
 * Answers grounded ONLY in the EXTRACTED FIELDS block must still carry
 * citations: the model cites `{documentId, field, value}` (no snippet quote),
 * the middleware validates the entry against the REAL extraction payload it
 * fetched, resolves geometry by matching the value against the document X-Ray
 * (the WF-05 field resolver), and the reply seeds the "Show all sources" chip.
 * Before this change such answers systematically returned `citations: []`.
 */

function jsonOk(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

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

/** The extraction payload `/ingest/document/extract/d1` returns (values only —
 * the live endpoint never carries geometry). */
const EXTRACTION_PAYLOAD = {
  invoice_number: "10295809",
  meter_count: 2,
  meters: [{ meter_number: "49099992" }, { meter_number: "91496724" }],
};

/** X-Ray fixture: the meter number appears in a page-2 chunk with boxes. */
const XRAY_PAYLOAD = {
  chunks: [
    {
      text: "Meter Number 49099992 — usage readings for the period",
      boundingBoxes: [
        { pageNumber: 2, topLeftX: 100, topLeftY: 200, bottomRightX: 300, bottomRightY: 240 },
      ],
      pageNumbers: [2],
    },
  ],
  documentPages: [{ pageNumber: 2, width: 1000, height: 1000 }],
};

/** Fakes routed by path: search → one snippet that does NOT contain the
 * answer (the extraction is the only grounding source), plus the extract +
 * X-Ray endpoints. */
function mkClients(
  llmAnswer: string,
  overrides: { xrayStatus?: number; xrayBody?: unknown; extractStatus?: number } = {},
) {
  const groundxClient: GroundXClient = {
    forward: vi.fn(async (path: string) => {
      if (String(path).startsWith("/ingest/document/extract/")) {
        if (overrides.extractStatus) {
          return new Response("nope", { status: overrides.extractStatus });
        }
        return jsonOk(EXTRACTION_PAYLOAD);
      }
      if (String(path).startsWith("/ingest/document/xray/")) {
        if (overrides.xrayStatus) {
          return new Response("nope", { status: overrides.xrayStatus });
        }
        return jsonOk(overrides.xrayBody ?? XRAY_PAYLOAD);
      }
      return jsonOk({
        search: {
          results: [{ documentId: "d1", text: "general account and service information" }],
        },
      });
    }),
  };
  const llmClient: LlmClient = {
    forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
  };
  return { groundxClient, llmClient };
}

const routeDeps = (clients: { groundxClient: GroundXClient; llmClient: LlmClient }) => ({
  llmClient: clients.llmClient,
  groundxClient: clients.groundxClient,
  groundxApiKey: "k",
  samplesBucketId: 42,
  llmModelId: "test-model",
});

afterEach(() => {
  __clearXrayCache();
  __clearWordMapCache();
});

describe("extraction-grounded citations (user-visible)", () => {
  it("an answer cited ONLY from the EXTRACTED FIELDS block carries a verified citation + the sources chip", async () => {
    const llmAnswer = [
      "The meter number is 49099992.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","field":"meters[0].meter_number","value":"49099992","answerSpan":"meter number is 49099992"}]}',
      "```",
    ].join("\n");
    const clients = mkClients(llmAnswer);

    const reply = await routeChat(
      makeRequest({ newUserMessage: "what is the meter number?" }),
      routeDeps(clients),
    );

    expect(reply.answer).toBe("The meter number is 49099992.");
    // The flagship defect: this used to be [].
    expect(reply.citations).toHaveLength(1);
    // Geometry resolved via the X-Ray field match → real page + chunk box.
    expect(reply.citations[0]).toMatchObject({
      documentId: "d1",
      page: 2,
      tier: "paraphrase",
    });
    expect(reply.citations[0].bbox).toMatchObject({ x: 0.1, y: 0.2, w: 0.2, h: 0.04 });
    expect(reply.citations[0].confidence).toBeGreaterThan(0);
    // And the user gets the "Show all sources" affordance.
    expect(reply.suggestedActions.find((a) => a.key === "show-source")).toBeDefined();
  });

  it("a fabricated field path or mismatched value is DROPPED (no invented extraction citations)", async () => {
    const llmAnswer = [
      "Made-up claims.",
      "",
      "```json",
      JSON.stringify({
        citations: [
          // unknown path
          { documentId: "d1", field: "meters[9].meter_number", value: "49099992" },
          // real path, wrong value
          { documentId: "d1", field: "invoice_number", value: "00000000" },
          // wrong document
          { documentId: "d2", field: "invoice_number", value: "10295809" },
        ],
      }),
      "```",
    ].join("\n");
    const clients = mkClients(llmAnswer);

    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), routeDeps(clients));

    expect(reply.citations).toHaveLength(0);
    expect(reply.suggestedActions.find((a) => a.key === "show-source")).toBeUndefined();
  });

  it("a geometry miss drops the extraction citation without failing the turn", async () => {
    const llmAnswer = [
      "The invoice number is 10295809.",
      "",
      "```json",
      // Validates against the payload, but the X-Ray endpoint errors → no
      // page to point at → dropped (user decision 2026-06-11: no pageless
      // citation form).
      '{"citations":[{"documentId":"d1","field":"invoice_number","value":"10295809"}]}',
      "```",
    ].join("\n");
    const clients = mkClients(llmAnswer, { xrayStatus: 500 });

    const reply = await routeChat(makeRequest({ newUserMessage: "invoice number?" }), routeDeps(clients));

    expect(reply.answer).toBe("The invoice number is 10295809.");
    expect(reply.citations).toHaveLength(0);
  });

  it("a joke turn still carries zero citations (no-invented-citations holds)", async () => {
    const clients = mkClients("Why did the bill meditate? To find inner piece rates.");

    const reply = await routeChat(makeRequest({ newUserMessage: "tell me a joke" }), routeDeps(clients));

    expect(reply.citations).toHaveLength(0);
    expect(reply.suggestedActions.find((a) => a.key === "show-source")).toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────
// Unit coverage: parser arms, path resolver, fabrication on a
// no-extraction turn, X-Ray fetched once per document per turn.
// ────────────────────────────────────────────────────────────────────
import { parseGroundedAnswer } from "./ragPipeline.js";
import { resolveExtractionPath } from "./groundedAnswer.js";
import { isExtractionCitation } from "./chatRouterTypes.js";

describe("parseGroundedAnswer citation arms", () => {
  const fence = (entries: unknown[]) =>
    "A.\n\n```json\n" + JSON.stringify({ citations: entries }) + "\n```";

  it("accepts the snippet arm and the extraction arm side by side", () => {
    const parsed = parseGroundedAnswer(
      fence([
        { documentId: "d1", page: 2, quote: "verbatim" },
        { documentId: "d1", field: "meters[0].meter_number", value: "49099992" },
      ]),
    );
    expect(parsed.structuredCitations).toHaveLength(2);
    expect(parsed.structuredCitations!.filter(isExtractionCitation)).toHaveLength(1);
  });

  it("drops entries with neither or BOTH complete shapes, and non-primitive values", () => {
    const parsed = parseGroundedAnswer(
      fence([
        { documentId: "d1" }, // neither arm
        { documentId: "d1", page: 2, quote: "q", field: "f", value: "v" }, // both arms
        { documentId: "d1", field: "meters", value: { nested: true } }, // non-primitive value
        { documentId: "d1", field: "invoice_number", value: "10295809" }, // valid
      ]),
    );
    expect(parsed.structuredCitations).toHaveLength(1);
    expect(parsed.structuredCitations![0]).toMatchObject({ field: "invoice_number" });
  });
});

describe("resolveExtractionPath", () => {
  const payload = {
    invoice_number: "10295809",
    totals: { due: 214.07 },
    meters: [{ meter_number: "49099992" }, { meter_number: "91496724" }],
  };

  it("resolves dotted and bracket paths", () => {
    expect(resolveExtractionPath(payload, "invoice_number")).toEqual({
      found: true,
      value: "10295809",
    });
    expect(resolveExtractionPath(payload, "totals.due")).toEqual({ found: true, value: 214.07 });
    expect(resolveExtractionPath(payload, "meters[1].meter_number")).toEqual({
      found: true,
      value: "91496724",
    });
  });

  it("refuses unknown segments, out-of-range indexes, and prototype keys", () => {
    expect(resolveExtractionPath(payload, "nope").found).toBe(false);
    expect(resolveExtractionPath(payload, "meters[9].meter_number").found).toBe(false);
    expect(resolveExtractionPath(payload, "totals.due.deeper").found).toBe(false);
    expect(resolveExtractionPath(payload, "constructor").found).toBe(false);
    expect(resolveExtractionPath(payload, "").found).toBe(false);
  });
});

// ── word-level upgrade: the named MAY-evolution, now wired ──
//
// A validated extraction citation's `value` is verbatim by construction (it
// matched the real payload), so it can resolve through the document's
// `-118-map` word map exactly like the snippet-quote arm: a word-atom hit
// replaces the chunk-envelope box with the tight atom-run box and lights
// `tier: "exact"`. A word-map miss (unfetchable map / span not present)
// keeps the chunk box at `paraphrase` — the upgrade is best-effort and never
// drops a citation that already resolved chunk geometry.
describe("extraction citation word-level exact-tier upgrade", () => {
  /** Word map for d1: the meter number sits in a tight atom band strictly
   * inside the X-Ray chunk envelope (100,200)-(300,240) on page 2. */
  const WORD_MAP: WordMap = {
    pages: [
      {
        pageNumber: 2,
        width: 1000,
        height: 1000,
        molecules: [
          {
            rows: [
              {
                atoms: [
                  { text: "Meter ", minX: 100, minY: 205, maxX: 140, maxY: 225 },
                  { text: "Number ", minX: 145, minY: 205, maxX: 195, maxY: 225 },
                  { text: "49099992", minX: 200, minY: 205, maxX: 290, maxY: 225 },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const llmAnswer = [
    "The meter number is 49099992.",
    "",
    "```json",
    '{"citations":[{"documentId":"d1","field":"meters[0].meter_number","value":"49099992"}]}',
    "```",
  ].join("\n");

  it("a validated extraction citation upgrades to tier 'exact' with the tight word-level bbox", async () => {
    const clients = mkClients(llmAnswer);
    const wordMapFetch = vi.fn(async (_c: GroundXClient, _k: string, documentId: string) =>
      documentId === "d1" ? WORD_MAP : null,
    );

    const reply = await routeChat(makeRequest({ newUserMessage: "meter number?" }), {
      ...routeDeps(clients),
      wordMapFetch,
    });

    expect(reply.citations).toHaveLength(1);
    const c = reply.citations[0];
    expect(c).toMatchObject({ documentId: "d1", page: 2, tier: "exact" });
    // The "49099992" atom box, not the chunk envelope (0.1,0.2,0.2,0.04).
    expect(c.bbox).toBeDefined();
    expect(c.bbox!.x).toBeCloseTo(0.2, 4);
    expect(c.bbox!.y).toBeCloseTo(0.205, 4);
    expect(c.bbox!.w).toBeCloseTo(0.09, 4);
    expect(c.bbox!.h).toBeCloseTo(0.02, 4);
    expect(c.confidence).toBe(1);
    expect(wordMapFetch).toHaveBeenCalledWith(clients.groundxClient, "k", "d1");
  });

  it("keeps the chunk box at tier 'paraphrase' when the word-map is unfetchable (no drop)", async () => {
    const clients = mkClients(llmAnswer);
    const wordMapFetch = vi.fn(async () => null);

    const reply = await routeChat(makeRequest({ newUserMessage: "meter number?" }), {
      ...routeDeps(clients),
      wordMapFetch,
    });

    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0]).toMatchObject({ documentId: "d1", page: 2, tier: "paraphrase" });
    expect(reply.citations[0].bbox).toMatchObject({ x: 0.1, y: 0.2, w: 0.2, h: 0.04 });
  });

  it("keeps the chunk box at tier 'paraphrase' when the value has no atom run in the map", async () => {
    // invoice_number is validated and X-Ray-resolvable in this fixture set?
    // No — the X-Ray only carries the meter chunk. Use the meter citation but a
    // word map whose atoms never spell the value.
    const mapWithoutValue: WordMap = {
      pages: [
        {
          pageNumber: 2,
          width: 1000,
          height: 1000,
          molecules: [
            {
              rows: [
                { atoms: [{ text: "Unrelated words only", minX: 10, minY: 10, maxX: 90, maxY: 30 }] },
              ],
            },
          ],
        },
      ],
    };
    const clients = mkClients(llmAnswer);
    const wordMapFetch = vi.fn(async () => mapWithoutValue);

    const reply = await routeChat(makeRequest({ newUserMessage: "meter number?" }), {
      ...routeDeps(clients),
      wordMapFetch,
    });

    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0]).toMatchObject({ tier: "paraphrase" });
    expect(reply.citations[0].bbox).toMatchObject({ x: 0.1, y: 0.2, w: 0.2, h: 0.04 });
  });

  it("a thrown word-map fetch degrades to 'paraphrase' — best-effort, never drops, never fails the turn", async () => {
    const clients = mkClients(llmAnswer);
    const wordMapFetch = vi.fn(async () => {
      throw new Error("storage origin down");
    });

    const reply = await routeChat(makeRequest({ newUserMessage: "meter number?" }), {
      ...routeDeps(clients),
      wordMapFetch,
    });

    expect(reply.citations).toHaveLength(1);
    expect(reply.citations[0]).toMatchObject({ tier: "paraphrase" });
  });
});

describe("extraction-citation hardening", () => {
  it("an extraction-form entry on a turn with NO extraction block is dropped (nothing to validate against)", async () => {
    const llmAnswer = [
      "Claim.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","field":"invoice_number","value":"10295809"}]}',
      "```",
    ].join("\n");
    // No extract endpoint: search yields no snippets → no primary doc → no fetch.
    const groundxClient: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [] } })),
    };
    const llmClient: LlmClient = {
      forward: vi.fn(async () => jsonOk({ choices: [{ message: { content: llmAnswer } }] })),
    };
    const reply = await routeChat(
      makeRequest({ newUserMessage: "Q" }),
      routeDeps({ groundxClient, llmClient }),
    );
    expect(reply.citations).toHaveLength(0);
  });

  it("two extraction citations for one document fetch the X-Ray at most once (cached)", async () => {
    const llmAnswer = [
      "Two claims.",
      "",
      "```json",
      JSON.stringify({
        citations: [
          { documentId: "d1", field: "meters[0].meter_number", value: "49099992" },
          { documentId: "d1", field: "invoice_number", value: "10295809" },
        ],
      }),
      "```",
    ].join("\n");
    const clients = mkClients(llmAnswer);
    const reply = await routeChat(makeRequest({ newUserMessage: "Q" }), routeDeps(clients));
    // The meter number resolves (it's in the X-Ray chunk); the invoice number
    // is validated but absent from the X-Ray → dropped.
    expect(reply.citations).toHaveLength(1);
    const xrayCalls = (clients.groundxClient.forward as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: unknown[]) => String(c[0]).startsWith("/ingest/document/xray/"),
    );
    expect(xrayCalls).toHaveLength(1);
  });
});

// ────────────────────────────────────────────────────────────────────
// Adversarial-review fixes (2026-06-12): F1 two-block tolerance,
// F2 short-value guard, F3 bbox-required drop, F4 extract-fetch failure.
// ────────────────────────────────────────────────────────────────────
describe("adversarial-review hardening", () => {
  // F1 — the model emits TWO fenced blocks (one per citation form) despite
  // the same-array instruction: both parse, both strip from the body.
  it("merges citations from two fenced blocks and strips both from the answer", () => {
    const raw = [
      "The meter is 49099992 on a $214.07 bill.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","page":2,"quote":"verbatim phrase"}]}',
      "```",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","field":"meters[0].meter_number","value":"49099992"}]}',
      "```",
    ].join("\n");
    const parsed = parseGroundedAnswer(raw);
    expect(parsed.structuredCitations).toHaveLength(2);
    expect(parsed.cleanedAnswer).toBe("The meter is 49099992 on a $214.07 bill.");
    expect(parsed.cleanedAnswer).not.toContain("```");
  });

  // F1 guard-rail: a fenced JSON block that is CONTENT (no metadata key)
  // stays in the body — e.g. the user asked for an example payload.
  it("leaves a non-metadata JSON code block in the answer body", () => {
    const raw = [
      "Here is an example filter:",
      "",
      "```json",
      '{"filter":{"projectId":"proj_123"}}',
      "```",
    ].join("\n");
    const parsed = parseGroundedAnswer(raw);
    expect(parsed.structuredCitations).toBeNull();
    expect(parsed.cleanedAnswer).toContain('"projectId"');
  });

  // F2 — a 1-character value (a count) would fuzzy-match almost any chunk;
  // too short to locate honestly → dropped even though it validates.
  it("drops an extraction citation whose value is too short to locate (count of 2)", async () => {
    const llmAnswer = [
      "There are 2 meters.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","field":"meter_count","value":2}]}',
      "```",
    ].join("\n");
    const clients = mkClients(llmAnswer);
    const reply = await routeChat(makeRequest({ newUserMessage: "how many meters?" }), routeDeps(clients));
    expect(reply.answer).toBe("There are 2 meters.");
    expect(reply.citations).toHaveLength(0);
  });

  // F3 — chunk matches but the X-Ray has no usable page dims (no box) and no
  // word-map: page-without-bbox is a miss → dropped, turn succeeds.
  it("drops an extraction citation when the X-Ray match yields no usable box", async () => {
    const llmAnswer = [
      "The meter number is 49099992.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","field":"meters[0].meter_number","value":"49099992"}]}',
      "```",
    ].join("\n");
    const clients = mkClients(llmAnswer, {
      xrayBody: { ...XRAY_PAYLOAD, documentPages: [] }, // no page dims → normalizeBox null
    });
    const reply = await routeChat(makeRequest({ newUserMessage: "meter number?" }), routeDeps(clients));
    expect(reply.answer).toBe("The meter number is 49099992.");
    expect(reply.citations).toHaveLength(0);
  });

  // F4 — extract endpoint fails WHILE a primary document exists: there is no
  // payload to validate against, so an emitted extraction entry is dropped.
  it("drops extraction entries when the extract fetch fails on a turn with a primary document", async () => {
    const llmAnswer = [
      "Claim.",
      "",
      "```json",
      '{"citations":[{"documentId":"d1","field":"invoice_number","value":"10295809"}]}',
      "```",
    ].join("\n");
    const clients = mkClients(llmAnswer, { extractStatus: 500 });
    const reply = await routeChat(makeRequest({ newUserMessage: "invoice?" }), routeDeps(clients));
    expect(reply.citations).toHaveLength(0);
  });
});
