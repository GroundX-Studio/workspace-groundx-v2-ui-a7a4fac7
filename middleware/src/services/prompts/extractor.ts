/**
 * Field-extractor prompt builder (chat-architecture-hardening Task 2).
 *
 * Moved VERBATIM from `fieldExtractor.ts#buildPrompt`. Tight + JSON-only
 * so the parser stays trivial. The LLM is allowed to return
 * `{value:null, confidence:0}` when the snippets don't contain the
 * answer — far better than fabricating.
 */
import { snippetHeader } from "./fragments.js";

/** Per-snippet char cap for the focused single-field prompt. */
export const FIELD_SNIPPET_CHARS = 400;

export interface ExtractorField {
  name: string;
  type: string;
  description: string;
}

export function buildExtractorPrompt(
  field: ExtractorField,
  snippets: Array<{ documentId: string; pageNumber?: number; text?: string; fileName?: string }>,
  scopeHint?: { fileName?: string | null },
): { system: string; user: string } {
  const system =
    "You are a field extractor. Read the snippets below and extract " +
    "the value of ONE schema field. Respond ONLY with a single JSON " +
    "object — no prose, no markdown fences, no commentary.\n\n" +
    "Shape: {\"value\": <typed primitive or null>, \"confidence\": <0-1 float>, " +
    "\"citation\": {\"documentId\": \"<doc>\", \"page\": <int>, \"quote\": \"<short verbatim>\"} | null }\n\n" +
    "Rules:\n" +
    "- If the snippets don't contain the value, return {\"value\": null, \"confidence\": 0, \"citation\": null}. Don't guess.\n" +
    "- For NUMBER fields: a JSON number (not a string). Strip currency / thousands separators.\n" +
    "- For DATE fields: ISO 8601 (`YYYY-MM-DD`) when the snippet supplies one; otherwise the verbatim snippet text.\n" +
    "- For BOOLEAN fields: true or false.\n" +
    "- For STRING fields: the shortest accurate phrase from the snippets.\n" +
    "- citation.documentId MUST reference a snippet header below — anything else is dropped.\n" +
    "- confidence: 0.9+ for direct quotes; 0.6–0.8 for inferred; <0.5 for hedged.";

  const lines: string[] = [];
  if (scopeHint?.fileName) lines.push(`Working on: ${scopeHint.fileName}`);
  lines.push("", `Field: ${field.name} (${field.type})`, `Description: ${field.description}`, "", "Snippets:");
  if (snippets.length === 0) {
    lines.push("(none)");
  } else {
    snippets.forEach((s, i) => {
      lines.push(snippetHeader(s, i));
      lines.push((s.text ?? "").slice(0, FIELD_SNIPPET_CHARS));
      lines.push("");
    });
  }
  return { system, user: lines.join("\n") };
}
