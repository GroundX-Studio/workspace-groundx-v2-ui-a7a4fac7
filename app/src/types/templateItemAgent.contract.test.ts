import { describe, expect, it } from "vitest";

import {
  templateItemKindSchema,
  reportSectionItemSchema,
  rewriteItemRequestSchema,
  rewriteItemResultSchema,
  type RewriteItemResult,
} from "@groundx/shared";

// agentic-template-item-editor Task 1.1 — the shared wire contracts for the
// rewrite operation + the report-section item shape. Preview reuses the
// existing ExtractedFieldValue / RenderedSection (no new type), so it is not
// re-declared here.

describe("templateItemKindSchema", () => {
  it("accepts the two item kinds", () => {
    expect(templateItemKindSchema.safeParse("extract-field").success).toBe(true);
    expect(templateItemKindSchema.safeParse("report-section").success).toBe(true);
  });
  it("rejects the template-kind enum values (item kind != template kind)", () => {
    expect(templateItemKindSchema.safeParse("extract").success).toBe(false);
    expect(templateItemKindSchema.safeParse("report").success).toBe(false);
  });
});

describe("reportSectionItemSchema", () => {
  it("accepts a report section item", () => {
    const ok = reportSectionItemSchema.safeParse({
      id: "sec-1",
      name: "summary",
      renderAs: "PARAGRAPH",
      question: "Summarize the billing period.",
      instructions: ["one sentence"],
      variables: [],
    });
    expect(ok.success).toBe(true);
  });
  it("rejects an unknown renderAs", () => {
    expect(
      reportSectionItemSchema.safeParse({
        id: "s",
        name: "n",
        renderAs: "PIECHART",
        question: "q",
        instructions: [],
        variables: [],
      }).success,
    ).toBe(false);
  });
});

describe("rewriteItemRequestSchema", () => {
  it("accepts an extract-field rewrite request (currentResult optional)", () => {
    const ok = rewriteItemRequestSchema.safeParse({
      chatSessionId: "chat-1",
      kind: "extract-field",
      item: { id: "f1", name: "addressee", type: "STRING", description: "the recipient name" },
    });
    expect(ok.success).toBe(true);
  });

  it("accepts a report-section rewrite request with a current result", () => {
    const ok = rewriteItemRequestSchema.safeParse({
      chatSessionId: "chat-1",
      kind: "report-section",
      item: { id: "s1", name: "summary", renderAs: "BULLETS", question: "q", instructions: [], variables: [] },
      currentResult: { sectionId: "s1", body: "prior text", citations: [] },
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a kind/item mismatch (extract-field with a section item)", () => {
    const bad = rewriteItemRequestSchema.safeParse({
      chatSessionId: "chat-1",
      kind: "extract-field",
      item: { id: "s1", name: "summary", renderAs: "BULLETS", question: "q", instructions: [], variables: [] },
    });
    expect(bad.success).toBe(false);
  });
});

describe("rewriteItemResultSchema", () => {
  it("round-trips an extract-field proposal + reasoning", () => {
    const value: RewriteItemResult = {
      kind: "extract-field",
      proposedItem: {
        id: "f1",
        name: "addressee",
        type: "STRING",
        description: "the recipient name on the service address; ignore 'Premise' identifiers",
        instructions: ["skip generic descriptors"],
        identifiers: ["Mail To"],
      },
      reasoning: "tightened to the service-address label",
    };
    expect(rewriteItemResultSchema.safeParse(value).success).toBe(true);
  });
});
