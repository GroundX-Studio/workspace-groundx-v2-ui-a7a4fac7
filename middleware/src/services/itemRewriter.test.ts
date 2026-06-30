import { describe, expect, it, vi } from "vitest";

import type { GroundXClient, LlmClient } from "../types.js";
import { rewriteItem } from "./itemRewriter.js";

// agentic-template-item-editor Task 2.2 — the rewrite service. Grounded in
// GroundX snippets + the source document; one chat-profile LLM call; the
// proposed item overlays ONLY LLM-provided fields onto the input, so id/name
// are structurally immutable.

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

function makeDeps(llmContent: unknown) {
  const groundxClient: GroundXClient = {
    forward: vi.fn(async () =>
      jsonResponse({ search: { results: [{ documentId: "doc-1", pageNumber: 1, text: "Mail To: KWIK TRIP (1147)" }] } }),
    ),
  };
  const llmClient: LlmClient = {
    forward: vi.fn(async () => jsonResponse({ choices: [{ message: { content: JSON.stringify(llmContent) } }] })),
  };
  return { llmClient, groundxClient, groundxApiKey: "k", llmModelId: "m" };
}

const scope = { type: "documents" as const, documentIds: ["doc-1"] };
const field = { id: "f1", name: "addressee", type: "STRING" as const, description: "the recipient name" };

describe("rewriteItem — extract-field", () => {
  it("overlays the LLM's improved definition and keeps id/name fixed", async () => {
    const deps = makeDeps({
      // The LLM also (wrongly) emits a name — it MUST be ignored.
      name: "evil_rename",
      type: "STRING",
      description: "the recipient on the service address; ignore 'Premise' identifiers",
      instructions: ["skip generic descriptors like SHED/SHOP"],
      identifiers: ["Mail To", "Service Address"],
      reasoning: "tightened to the service-address label seen in the doc",
    });
    const result = await rewriteItem({ kind: "extract-field", item: field, contentScope: scope }, deps);
    expect(result.kind).toBe("extract-field");
    expect(result.proposedItem.id).toBe("f1");
    expect(result.proposedItem.name).toBe("addressee"); // never the LLM's rename
    expect(result.proposedItem.description).toContain("service address");
    expect((result.proposedItem as { instructions?: string[] }).instructions).toContain("skip generic descriptors like SHED/SHOP");
    expect(result.reasoning).toContain("service-address");
  });

  it("throws when the LLM returns no JSON object", async () => {
    const groundxClient: GroundXClient = { forward: vi.fn(async () => jsonResponse({ search: { results: [] } })) };
    const llmClient: LlmClient = { forward: vi.fn(async () => jsonResponse({ choices: [{ message: { content: "not json" } }] })) };
    await expect(
      rewriteItem({ kind: "extract-field", item: field, contentScope: scope }, { llmClient, groundxClient, groundxApiKey: "k", llmModelId: "m" }),
    ).rejects.toThrow();
  });
});

describe("rewriteItem — report-section", () => {
  it("tunes the section definition (renderAs/question/instructions/variables), keeps name", async () => {
    const section = { id: "s1", name: "summary", renderAs: "PARAGRAPH" as const, question: "Summarize the bill.", instructions: [], variables: [] };
    const deps = makeDeps({
      renderAs: "BULLETS",
      question: "List each meter and its charge for the billing period.",
      instructions: ["one bullet per meter"],
      variables: [],
      reasoning: "the answer is a list, so BULLETS fits better",
    });
    const result = await rewriteItem({ kind: "report-section", item: section, contentScope: scope }, deps);
    expect(result.kind).toBe("report-section");
    expect(result.proposedItem.name).toBe("summary");
    expect((result.proposedItem as { renderAs: string }).renderAs).toBe("BULLETS");
    expect((result.proposedItem as { question: string }).question).toContain("each meter");
  });
});
