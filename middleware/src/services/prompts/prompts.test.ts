/**
 * Pinning tests for the prompts module (chat-architecture-hardening Task 2).
 * Each model-facing prompt has at least one shape test here; consumer-level
 * integration assertions stay in the consumers' own test files (see
 * README.md inventory).
 */
import { describe, expect, it } from "vitest";

import {
  citationsContract,
  VOICE_RULE,
  snippetHeader,
} from "./fragments.js";
import { buildGroundedSystem } from "./grounded.js";
import { buildExtractorPrompt } from "./extractor.js";
import { buildSummaryPrompt, buildMetaSummaryPrompt } from "./summarizer.js";
import { buildTurnRouterPrompt } from "./turnRouter.js";

describe("buildTurnRouterPrompt", () => {
  // turn-router-extraction-appstate Task 1 — extractionContext joins the
  // strict-JSON shape with a true-when-unsure bias (fallback parity).
  it("declares the extractionContext flag with a true-when-unsure bias", () => {
    const { system } = buildTurnRouterPrompt("hi");
    expect(system).toContain('"extractionContext": <bool>');
    expect(system).toMatch(/extractionContext.*unsure/is);
  });

  // Task 2 — appState joins the shape with a FALSE-when-unsure bias
  // (mis-routing toward rag is today's behavior; toward structured would
  // be a regression).
  it("declares the appState flag with a false-when-unsure bias", () => {
    const { system } = buildTurnRouterPrompt("hi");
    expect(system).toContain('"appState": <bool>');
    expect(system).toMatch(/appState.*false when unsure/is);
  });
});

describe("fragments", () => {
  it("VOICE_RULE bans the internal vocabulary", () => {
    expect(VOICE_RULE).toMatch(/never expose your internal materials/i);
    for (const term of ["snippets", "extracted fields", "skill pack", "sections", "context", "system prompt", "tools"]) {
      expect(VOICE_RULE).toContain(`'${term}'`);
    }
    expect(VOICE_RULE).toContain("I don't see that in this document");
  });

  it("citationsContract demands verbatim quotes referencing snippet documentIds", () => {
    for (const hasExtraction of [true, false]) {
      const c = citationsContract(hasExtraction);
      expect(c).toMatch(/copied VERBATIM/);
      expect(c).toMatch(/documentIds present in the snippet/);
      expect(c).toContain('"citations":[{"documentId"');
    }
  });

  // harden-citation-emission U1 — the extraction-form entry appears iff the
  // extraction block does, inside the SAME single example fence.
  it("citationsContract(true) defines the field+value entry and bans fabricated paths", () => {
    const c = citationsContract(true);
    expect(c).toMatch(/grounded in the EXTRACTED FIELDS/);
    expect(c).toContain('"field":"<path in EXTRACTED FIELDS>"');
    expect(c).toContain('"value":"<verbatim field value>"');
    expect(c).toMatch(/fabricated paths/);
  });

  it("snippetHeader formats with and without fileName", () => {
    expect(snippetHeader({ documentId: "d1", pageNumber: 3, fileName: "bill.pdf" }, 0)).toBe(
      '[1] file="bill.pdf" doc=d1 page=3',
    );
    expect(snippetHeader({ documentId: "d2" }, 1)).toBe("[2] doc=d2 page=?");
  });
});

describe("buildGroundedSystem", () => {
  it("base prompt carries voice + citations contract and no conditional blocks", () => {
    const system = buildGroundedSystem();
    expect(system).toMatch(/^You are the user's analyst/);
    expect(system).toContain(VOICE_RULE);
    expect(system).toContain(citationsContract(false));
    expect(system).not.toContain("EXTRACTED FIELDS block is");
    expect(system).not.toContain("GROUNDX KNOWLEDGE");
    // No extraction block → the extraction-citation form is NOT offered.
    expect(system).not.toContain('"field":"<path in EXTRACTED FIELDS>"');
  });

  it("extraction option adds the EXTRACTED FIELDS guidance", () => {
    const system = buildGroundedSystem({ extraction: "{}" });
    expect(system).toContain("and the EXTRACTED FIELDS block");
    expect(system).toContain("authoritative for the document's own values");
    // And offers the extraction-sourced citation form (2026-06-11).
    expect(system).toContain(citationsContract(true));
  });

  it("skillKnowledge option embeds the GROUNDX KNOWLEDGE block with never-cite framing", () => {
    const system = buildGroundedSystem({ skillKnowledge: "## GroundX\nfacts" });
    expect(system).toContain("GROUNDX KNOWLEDGE (private background for YOU");
    expect(system).toContain("NEVER mention or cite this material");
    expect(system).toContain("## GroundX\nfacts");
  });
});

describe("buildExtractorPrompt", () => {
  it("system demands JSON-only single-field extraction; user carries snippet headers", () => {
    const { system, user } = buildExtractorPrompt(
      { name: "total_due", type: "NUMBER", description: "Total amount due" },
      [{ documentId: "doc-1", pageNumber: 2, text: "Total due: $42.10", fileName: "bill.pdf" }],
      { fileName: "bill.pdf" },
    );
    expect(system).toMatch(/^You are a field extractor/);
    expect(system).toContain('{"value": null, "confidence": 0, "citation": null}');
    expect(user).toContain("Field: total_due (NUMBER)");
    expect(user).toContain('[1] file="bill.pdf" doc=doc-1 page=2');
  });
});

describe("summarizer prompts", () => {
  it("leaf summary prompt frames the chunk", () => {
    const { messages } = buildSummaryPrompt([{ role: "user", content: "hi" }]);
    expect(messages[0].content).toMatch(/^You are a conversation summarizer/);
    expect(messages[1].content).toContain("USER: hi");
  });

  it("meta summary prompt merges prior summaries oldest-first", () => {
    const { messages } = buildMetaSummaryPrompt([{ content: "a" }, { content: "b" }]);
    expect(messages[0].content).toMatch(/^You are merging older conversation summaries/);
    expect(messages[1].content).toContain("--- Summary 1 ---\na");
  });
});

// chat-architecture-hardening Task 6 — tool guidance is declared WITH the
// tool (description + optional promptGuidance) and rendered as ONE generated
// TOOL NOTES section from the step-FILTERED catalog. The hand-written
// per-tool paragraphs are gone from the grounded prompt source.
describe("buildToolNotes + grounded TOOL NOTES section", () => {
  it("renders a notes entry per tool that declares promptGuidance, none otherwise", async () => {
    const { buildToolNotes } = await import("./toolNotes.js");
    const notes = buildToolNotes([
      { name: "tool_a", promptGuidance: "Call tool_a when X." },
      { name: "tool_b" },
    ]);
    expect(notes).toContain("TOOL NOTES");
    expect(notes).toContain("`tool_a`: Call tool_a when X.");
    expect(notes).not.toContain("tool_b");
  });

  it("returns null when no offered tool declares guidance", async () => {
    const { buildToolNotes } = await import("./toolNotes.js");
    expect(buildToolNotes([{ name: "t" }])).toBeNull();
    expect(buildToolNotes([])).toBeNull();
  });

  it("grounded system embeds the toolNotes block and carries NO hand-written tool paragraphs", () => {
    const withNotes = buildGroundedSystem({ toolNotes: "TOOL NOTES:\n- `propose_schema_field`: guidance" });
    expect(withNotes).toContain("TOOL NOTES");
    const without = buildGroundedSystem();
    expect(without).not.toContain("propose_schema_field");
    expect(without).not.toContain("suggest_intent");
    expect(without).not.toContain("ship via tools");
  });
});
