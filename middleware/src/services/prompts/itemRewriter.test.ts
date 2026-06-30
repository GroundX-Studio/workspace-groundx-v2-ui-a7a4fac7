import { describe, expect, it } from "vitest";

import { buildItemRewriterPrompt } from "./itemRewriter.js";

// agentic-template-item-editor Task 2.1 — the source-document-grounded,
// kind-aware "rewrite with agent" prompt builder. Tight + JSON-only, mirroring
// the extractor house style. NEVER asks for a `name`.

const snippets = [
  { documentId: "doc-1", pageNumber: 1, text: "Mail To: KWIK TRIP (1147)", fileName: "bill.pdf" },
];

describe("buildItemRewriterPrompt — extract-field", () => {
  const { system, user } = buildItemRewriterPrompt({
    kind: "extract-field",
    item: { id: "f1", name: "addressee", type: "STRING", description: "the recipient name", instructions: ["skip generic descriptors"], identifiers: ["Mail To"] },
    currentResult: { fieldId: "f1", value: "KWIK TRIP", citations: [], confidence: 0.7 },
    matchedSnippets: snippets,
    docSnippets: snippets,
  });

  it("instructs the agent to read the source document and grounds in it", () => {
    expect(system.toLowerCase()).toContain("source document");
    expect(user).toContain("Mail To: KWIK TRIP (1147)");
  });
  it("includes the current definition + current result for diagnosis", () => {
    expect(user).toContain("addressee");
    expect(user).toContain("the recipient name");
    expect(user.toLowerCase()).toContain("confidence");
  });
  it("forbids outputting a name and asks for the field-definition JSON only", () => {
    expect(system.toLowerCase()).toContain("name");
    expect(system).toMatch(/never (output|change|rewrite).{0,20}name/i);
    expect(system).toContain("description");
    expect(system).toContain("instructions");
  });
});

describe("buildItemRewriterPrompt — report-section", () => {
  const { system, user } = buildItemRewriterPrompt({
    kind: "report-section",
    item: { id: "s1", name: "summary", renderAs: "PARAGRAPH", question: "Summarize the bill.", instructions: [], variables: [] },
    currentResult: { sectionId: "s1", body: "The bill totals $7,613.20.", citations: [] },
    matchedSnippets: snippets,
    docSnippets: snippets,
  });

  it("tunes the section fields (question/renderAs/instructions/variables), not name", () => {
    expect(system).toContain("question");
    expect(system).toContain("renderAs");
    expect(system.toLowerCase()).toContain("source document");
    expect(user).toContain("Summarize the bill.");
  });
});
