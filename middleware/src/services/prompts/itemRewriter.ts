/**
 * agentic-template-item-editor — the "rewrite with agent" prompt builder.
 *
 * Improves the DEFINITION of one template item (an Extract field or a Report
 * section) so it extracts/renders more accurately, grounded in BOTH the matched
 * snippets AND a broader representative view of the SOURCE DOCUMENT. Tight +
 * JSON-only (mirrors `extractor.ts` house style). The agent NEVER changes the
 * item `name` and never emits one — `name` is held fixed structurally by the
 * service. Output is a DEFINITION, so it carries no citations (the grounding is
 * in the prompt, not the output).
 */
import { snippetHeader } from "./fragments.js";

/** Per-snippet char cap (matches the extractor's budget). */
export const REWRITE_SNIPPET_CHARS = 400;

type PromptSnippet = { documentId: string; pageNumber?: number; text?: string; fileName?: string };

export interface ItemRewriterInput {
  kind: "extract-field" | "report-section";
  /** The current item definition (extract field or report section). */
  item: Record<string, unknown> & { name: string };
  /** The item's latest preview result, if any (value/confidence or rendered body). */
  currentResult?: { value?: unknown; body?: unknown; confidence?: number } | null;
  /** Snippets that matched a query for this item — where the value likely is. */
  matchedSnippets: PromptSnippet[];
  /** A broader, representative view of the source document. */
  docSnippets: PromptSnippet[];
}

function extractFieldSystem(): string {
  return (
    "You are improving the DEFINITION of one data-extraction field so it " +
    "extracts more accurately from this document type. You are NOT extracting " +
    "the value, and you NEVER change or output the field name.\n\n" +
    "You are given the field's current definition, the value it currently " +
    "extracts (with its confidence), the matched snippets, AND a broader view " +
    "of the source document. READ THE SOURCE DOCUMENT — use its real labels, " +
    "layout, units, and alternative phrasings — to diagnose why the current " +
    "definition may be wrong, low-confidence, or empty, then rewrite it.\n\n" +
    'Respond ONLY with a single JSON object — no prose, no fences:\n' +
    '{"type": "STRING|NUMBER|DATE|BOOLEAN", "description": "<the extraction prompt>", ' +
    '"instructions": ["<one rule per line>"], "identifiers": ["<real anchor labels from the doc>"], ' +
    '"format": "<optional hint, e.g. USD or YYYY-MM-DD; empty string if none>", ' +
    '"reasoning": "<one sentence: what changed and why>"}\n\n' +
    "Rules:\n" +
    "- Keep the field's intent; improve precision, do not redefine what it means.\n" +
    "- Ground every change in the source document (reference the actual labels/anchors you saw).\n" +
    "- Prefer concrete, testable instructions over vague ones.\n" +
    "- identifiers MUST be real anchor text from the document, not guesses.\n" +
    "- Change `type` only if the current type is clearly wrong (say so in reasoning).\n" +
    '- If already precise, return it largely unchanged with reasoning "already precise".\n' +
    "- NEVER invent a value; NEVER output a `name`."
  );
}

function reportSectionSystem(): string {
  return (
    "You are improving the DEFINITION of one report section so it renders a " +
    "more accurate, better-grounded answer. You are NOT writing the answer, and " +
    "you NEVER change or output the section name.\n\n" +
    "You are given the section's current definition, its latest rendered body, " +
    "the matched snippets, AND a broader view of the source document. READ THE " +
    "SOURCE DOCUMENT to diagnose why the current section may render poorly, then " +
    "rewrite the definition.\n\n" +
    'Respond ONLY with a single JSON object — no prose, no fences:\n' +
    '{"renderAs": "PARAGRAPH|BULLETS|TABLE", "question": "<the prompt run at render time>", ' +
    '"instructions": ["<one rule per line>"], "variables": ["<literal variable names, if any>"], ' +
    '"reasoning": "<one sentence: what changed and why>"}\n\n' +
    "Rules:\n" +
    "- Keep the section's intent; improve precision, do not redefine it.\n" +
    "- Ground every change in the source document.\n" +
    "- Choose renderAs to fit the answer shape (a list of items -> BULLETS or TABLE; a narrative -> PARAGRAPH).\n" +
    '- If already precise, return it largely unchanged with reasoning "already precise".\n' +
    "- NEVER output a `name`."
  );
}

function snippetBlock(label: string, snippets: PromptSnippet[]): string[] {
  const lines = [label];
  if (snippets.length === 0) {
    lines.push("(none)");
    return lines;
  }
  snippets.forEach((s, i) => {
    lines.push(snippetHeader(s, i));
    lines.push((s.text ?? "").slice(0, REWRITE_SNIPPET_CHARS));
    lines.push("");
  });
  return lines;
}

function currentResultLine(input: ItemRewriterInput): string {
  const r = input.currentResult;
  if (!r) return "Current result: (none yet)";
  const body = input.kind === "extract-field" ? r.value : r.body;
  const conf = typeof r.confidence === "number" ? ` (confidence ${r.confidence.toFixed(2)})` : "";
  const shown = body == null ? "—" : String(body);
  return `Current result: ${shown}${conf}`;
}

export function buildItemRewriterPrompt(input: ItemRewriterInput): { system: string; user: string } {
  const system = input.kind === "extract-field" ? extractFieldSystem() : reportSectionSystem();
  const lines: string[] = [];
  lines.push(
    "Current definition (the `name` is fixed — for context only, do not change it):",
    JSON.stringify(input.item),
    "",
    currentResultLine(input),
    "",
  );
  lines.push(...snippetBlock("Matched snippets:", input.matchedSnippets), "");
  lines.push(...snippetBlock("Source document (broader context):", input.docSnippets));
  return { system, user: lines.join("\n") };
}
