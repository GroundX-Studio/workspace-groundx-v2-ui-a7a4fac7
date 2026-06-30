/**
 * Generated TOOL NOTES section (chat-architecture-hardening Task 6).
 *
 * Per-tool usage guidance is declared WITH the tool — the catalog entry's
 * `description` (already in the function-calling spec the model sees) plus
 * an optional `promptGuidance` for tools needing more than their
 * description. This builder renders the notes for the step-FILTERED catalog
 * only, so a tool absent from the current turn contributes no guidance.
 * Hand-written per-tool paragraphs in prompt text are forbidden (agent-tools
 * spec) — guidance lives exactly once, on the declaration.
 */
export interface ToolNoteSource {
  name: string;
  promptGuidance?: string;
}

export function buildToolNotes(tools: ReadonlyArray<ToolNoteSource>): string | null {
  const entries = tools.filter(
    (t): t is ToolNoteSource & { promptGuidance: string } =>
      typeof t.promptGuidance === "string" && t.promptGuidance.length > 0,
  );
  if (entries.length === 0) return null;
  return (
    "TOOL NOTES (how to use the tools offered this turn):\n" +
    entries.map((t) => `- \`${t.name}\`: ${t.promptGuidance}`).join("\n") +
    "\n\n"
  );
}
