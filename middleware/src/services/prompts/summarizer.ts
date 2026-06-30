/**
 * Conversation-summarizer prompt builders (chat-architecture-hardening
 * Task 2). Moved VERBATIM from `conversationCompressor.ts`.
 */

/**
 * Build the leaf-summary prompt. Takes ONLY the chunk of messages
 * being absorbed; no prior summary is spliced in — that's what makes
 * this a "leaf" summary (independent of the rest of the chain).
 *
 * The leaf prompt is intentionally NOT merging older summary content
 * (that would re-summarize already-summarized prose, causing telephone-
 * game decay). Older summaries get folded by `runMetaCompaction` /
 * `buildMetaSummaryPrompt` when the active-summaries list itself
 * grows too long. Locked 2026-05-25.
 */
export function buildSummaryPrompt(
  messages: ReadonlyArray<{ role: string; content: string }>,
): { messages: { role: "system" | "user"; content: string }[] } {
  const system =
    "You are a conversation summarizer for a multi-turn document Q&A " +
    "system. Produce a dense, structured summary of the conversation " +
    "chunk below. Focus on: (1) the user's intent / topic of inquiry, " +
    "(2) any decisions the user made, (3) facts or document " +
    "references the assistant supplied, (4) unresolved threads. " +
    "Output 6–10 short bullet lines, no preamble. Skip social " +
    "pleasantries. The result will be spliced into a future LLM " +
    "call as `Prior context:` and counted against the token budget, " +
    "so be terse.";

  const chunk = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Conversation chunk:\n${chunk}` },
    ],
  };
}

/**
 * Build the meta-compaction prompt — fold N existing summaries into
 * one super-summary covering the same time span. Used at level 2 when
 * the active-summaries list itself is too long.
 */
export function buildMetaSummaryPrompt(
  priorSummaries: ReadonlyArray<{ content: string }>,
): { messages: { role: "system" | "user"; content: string }[] } {
  const system =
    "You are merging older conversation summaries into a single " +
    "denser super-summary. The inputs are already structured " +
    "summaries of earlier conversation chunks (oldest first). Produce " +
    "a single dense summary that preserves user intents, decisions, " +
    "document references, and unresolved threads from across ALL " +
    "inputs. Output 8–14 short bullet lines, chronological where it " +
    "matters. No preamble.";

  const block = priorSummaries
    .map((s, i) => `--- Summary ${i + 1} ---\n${s.content}`)
    .join("\n\n");

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Older summaries to merge:\n${block}` },
    ],
  };
}
