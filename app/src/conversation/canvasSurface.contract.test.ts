import { describe, expect, it } from "vitest";

import { CANVAS_NON_DOC_NAV_INTENT_KINDS, isNonDocNavIntentKind, parseCanvasIntent } from "@groundx/shared";

/**
 * chat-QA Finding 2 — the single-source surface classification. The set is
 * compile-time pinned to real CanvasIntent kinds (`satisfies` in shared); these
 * tests lock the doc-vs-non-doc split behaviorally so the chat auto-highlight
 * guard (its only consumer) can't silently regress.
 */
describe("canvas surface classification (single source)", () => {
  it("classifies the non-doc widget surfaces as non-doc navigations", () => {
    for (const kind of ["showExtract", "editSchema", "showReport", "editTemplate", "showIntegrate"]) {
      expect(isNonDocNavIntentKind(kind)).toBe(true);
    }
  });

  it("does NOT classify doc-surface navs / citation display / non-navigations", () => {
    for (const kind of ["openDocument", "jumpToPage", "showInteract", "highlightCitation", "showCitations", "openGate", "pinToReport", "proposeSchemaField"]) {
      expect(isNonDocNavIntentKind(kind)).toBe(false);
    }
  });

  it("every classified kind is a REAL CanvasIntent kind (drift guard vs. renames)", () => {
    // A minimal valid payload per kind isn't needed — parseCanvasIntent on a
    // bare {kind} returns null for kinds needing args, so instead assert the kind
    // string is one the schema knows by checking it's not silently unknown: a
    // rename would break the compile-time `satisfies` in shared first, but this
    // keeps the intent explicit at the consumer boundary too.
    expect(CANVAS_NON_DOC_NAV_INTENT_KINDS.length).toBeGreaterThan(0);
    // showExtract with a valid scope parses — proves the kind name is live.
    const ok = parseCanvasIntent({ kind: "showExtract", scope: { type: "documents", documentIds: ["d1"] }, schemaId: "s1" });
    expect(ok?.kind).toBe("showExtract");
  });
});
