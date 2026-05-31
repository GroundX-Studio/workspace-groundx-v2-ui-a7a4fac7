/**
 * §1 of 2026-05-31-core-data-followups — "Split chatRouter.ts".
 *
 * Behavior-preserving structural guard. This test does NOT assert behavior
 * (the existing `chatRouter.test.ts` suite is the behavior baseline and must
 * stay green unchanged). It asserts the SPLIT itself:
 *
 *   1. The cohesive sub-modules exist and export the symbols that were moved
 *      out of the 1600-line monolith (proof the code actually moved, not just
 *      copied).
 *   2. `chatRouter.ts` re-exports the FULL public surface unchanged, so every
 *      existing `from "./chatRouter.js"` import keeps resolving to the SAME
 *      value (identity, not just presence — proof there's one source of truth,
 *      no fork).
 *
 * Failing-first: before the extraction the sub-modules don't exist, so the
 * dynamic imports reject and this suite is red.
 */
import { describe, expect, it } from "vitest";

import * as chatRouter from "./chatRouter.js";
import * as types from "./chatRouterTypes.js";
import * as classifier from "./chatClassifier.js";
import * as search from "./groundxSearch.js";
import * as ragPipeline from "./ragPipeline.js";

describe("chatRouter.ts split — module seams", () => {
  it("extracts the wire types + shared constants + envelope schema + error into chatRouterTypes.ts", () => {
    expect(typeof types.proposalEnvelopeV1Schema?.safeParse).toBe("function");
    expect(typeof types.ChatRouteNotImplementedError).toBe("function");
    expect(typeof types.MAX_SNIPPET_BLOCK_CHARS).toBe("number");
    expect(typeof types.GROUNDED_REFUSAL_PHRASE).toBe("string");
    expect(typeof types.SUGGESTED_INTENT_THRESHOLD).toBe("number");
  });

  it("extracts the deterministic classifier into chatClassifier.ts", () => {
    expect(typeof classifier.classifyChatMode).toBe("function");
  });

  it("extracts searchGroundX into groundxSearch.ts", () => {
    expect(typeof search.searchGroundX).toBe("function");
  });

  it("extracts the RAG pipeline helpers into ragPipeline.ts", () => {
    expect(typeof ragPipeline.parseGroundedAnswer).toBe("function");
    expect(typeof ragPipeline.buildSnippetBlock).toBe("function");
  });
});

describe("chatRouter.ts split — public surface preserved by re-export", () => {
  // Every symbol an external importer depends on, with the module it now
  // lives in. The chatRouter barrel MUST re-export the SAME binding (===),
  // not a copy.
  const reexported: Array<[string, Record<string, unknown>]> = [
    ["classifyChatMode", classifier],
    ["searchGroundX", search],
    ["parseGroundedAnswer", ragPipeline],
    ["buildSnippetBlock", ragPipeline],
    ["proposalEnvelopeV1Schema", types],
    ["ChatRouteNotImplementedError", types],
    ["MAX_SNIPPET_BLOCK_CHARS", types],
    ["GROUNDED_REFUSAL_PHRASE", types],
    ["SUGGESTED_INTENT_THRESHOLD", types],
  ];

  it.each(reexported)("re-exports %s as the identical binding", (name, source) => {
    expect((chatRouter as Record<string, unknown>)[name]).toBe(source[name]);
  });

  it("still exports routeChat as a function (the entry point)", () => {
    expect(typeof chatRouter.routeChat).toBe("function");
  });
});
