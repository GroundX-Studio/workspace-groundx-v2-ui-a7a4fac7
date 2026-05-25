/**
 * Conversation compressor — leaf summaries + rare meta-compaction.
 *
 * The compression chain has TWO levels:
 *
 *   Level 1 — leaf compaction
 *     Fires when the assembled bundle's liveTail is too large. Takes
 *     a contiguous range of uncompressed messages and produces a NEW
 *     INDEPENDENT summary covering exactly that range. NO prior
 *     summary is threaded into the LLM call — older summaries stay
 *     untouched. Generation = 0. absorbedSummaryIds = [].
 *
 *   Level 2 — meta-compaction
 *     Fires when the count of ACTIVE summaries exceeds a threshold
 *     (e.g. > 10). Takes a batch of the oldest active summaries and
 *     folds them into one super-summary. Generation = max(absorbed) + 1.
 *     absorbedSummaryIds = [the batch's ids]. The batched leaves stay
 *     in the table for audit/replay but are filtered out of the active
 *     set because a newer summary now absorbs them.
 *
 * A summary is "active" iff no other summary lists it in its
 * `absorbedSummaryIdsJson`. The handler builds the bundle from
 * `selectActiveSummaries(allSummaries)` (chronological).
 *
 * This shape avoids the telephone-game decay of the previous design
 * (which re-summarized every prior summary on every level-1 run).
 * Recent prose stays at leaf-summary fidelity for a long time; only
 * truly old history is meta-compacted.
 */

import { randomUUID } from "node:crypto";

import type {
  AppRepository,
  ChatMessageRecord,
  ConversationSummaryRecord,
  LlmClient,
} from "../types.js";

import type { CompressionPlan } from "./contextBundler.js";

// ── Leaf prompt + LLM call ──────────────────────────────────────────

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
  messages: ReadonlyArray<Pick<ChatMessageRecord, "role" | "content">>,
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

export interface SummarizeChunkResult {
  /** The summary text the LLM produced. */
  content: string;
  /** Provider-reported prompt tokens, or fallback char-estimate. */
  tokensIn: number;
  /** Provider-reported completion tokens, or fallback char-estimate. */
  tokensOut: number;
  /** Model id used (echo of the request). */
  model: string;
}

export interface SummarizeChunkDeps {
  llmClient: LlmClient;
  /** Provider model id, e.g. "gpt-5.5" or "claude-3-haiku". */
  modelId: string;
  /**
   * Hard cap on LLM output tokens for this summarization call. Passed
   * as `max_tokens` in the chat.completions body so the provider
   * stops generating once the cap is hit. Defaults to undefined
   * (provider's default) for backward compatibility; chatHandler
   * always passes a real number derived from
   * `env.MAX_SUMMARY_OUTPUT_TOKENS`.
   */
  maxOutputTokens?: number;
}

/**
 * Call the LLM to summarize a leaf-level chunk of conversation. Pure
 * I/O; no DB writes. The caller is responsible for persisting the
 * result. NO prior summary is included — this is the leaf path.
 */
export async function summarizeChunk(
  messages: ReadonlyArray<Pick<ChatMessageRecord, "role" | "content">>,
  deps: SummarizeChunkDeps,
): Promise<SummarizeChunkResult> {
  const prompt = buildSummaryPrompt(messages);
  return invokeSummarizer(prompt, deps);
}

/**
 * Call the LLM to fold N older summaries into one super-summary.
 * Pure I/O; the caller (`runMetaCompaction`) writes the new row.
 */
export async function summarizeSummaries(
  priorSummaries: ReadonlyArray<{ content: string }>,
  deps: SummarizeChunkDeps,
): Promise<SummarizeChunkResult> {
  if (priorSummaries.length < 2) {
    throw new Error("summarizeSummaries: need at least two summaries to merge");
  }
  const prompt = buildMetaSummaryPrompt(priorSummaries);
  return invokeSummarizer(prompt, deps);
}

async function invokeSummarizer(
  prompt: { messages: { role: "system" | "user"; content: string }[] },
  deps: SummarizeChunkDeps,
): Promise<SummarizeChunkResult> {
  const body: Record<string, unknown> = {
    model: deps.modelId,
    messages: prompt.messages,
    // Compression is a tight summarization task — low temperature
    // keeps the output deterministic and reduces token spread.
    temperature: 0.1,
  };
  if (deps.maxOutputTokens != null) {
    body.max_tokens = deps.maxOutputTokens;
  }

  const response = await deps.llmClient.forward("/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "<unreadable>");
    throw new Error(
      `Summarization LLM call failed: ${response.status} ${response.statusText} — ${text.slice(0, 200)}`,
    );
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    model?: string;
  };

  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Summarization LLM call returned no content");
  }

  return {
    content,
    tokensIn: payload.usage?.prompt_tokens ?? estimateCharsAsTokens(JSON.stringify(prompt)),
    tokensOut: payload.usage?.completion_tokens ?? estimateCharsAsTokens(content),
    model: payload.model ?? deps.modelId,
  };
}

// ── Leaf-level DB writer (level 1) ──────────────────────────────────

export interface RunCompressionDeps extends SummarizeChunkDeps {
  repo: AppRepository;
  /** Override for tests; defaults to crypto.randomUUID. */
  idGen?: () => string;
}

export interface RunCompressionResult {
  summary: ConversationSummaryRecord;
  absorbedMessageCount: number;
}

/**
 * Level-1 leaf compaction: fold a contiguous range of uncompressed
 * messages into a new INDEPENDENT summary. No prior summary is
 * threaded in; generation is always 0; absorbedSummaryIds is always
 * []. Older summaries are unchanged.
 *
 * The plan's `absorbedSummaryIds` is IGNORED for leaf compaction. If
 * older summaries need to be folded, that's level 2's job — call
 * `runMetaCompaction` separately.
 */
export async function runCompression(
  chatSessionId: string,
  plan: CompressionPlan,
  deps: RunCompressionDeps,
): Promise<RunCompressionResult> {
  if (plan.messageIds.length < 2) {
    throw new Error("runCompression: plan must include at least two messages");
  }

  const allMessages = await deps.repo.listChatMessages(chatSessionId);
  const idSet = new Set(plan.messageIds);
  const absorbed = allMessages.filter((m) => idSet.has(m.id));
  if (absorbed.length !== plan.messageIds.length) {
    throw new Error(
      `runCompression: plan referenced ${plan.messageIds.length} messages but repo had ${absorbed.length}`,
    );
  }

  // Leaf: NO prior summary passed to the LLM. Each leaf summary is
  // independent and stands on its own.
  const summarized = await summarizeChunk(absorbed, deps);

  const idGen = deps.idGen ?? (() => randomUUID());
  const summary: ConversationSummaryRecord = {
    id: idGen(),
    chatSessionId,
    fromMessageId: plan.fromMessageId,
    toMessageId: plan.toMessageId,
    generation: 0, // ALWAYS 0 for leaf summaries.
    absorbedSummaryIdsJson: "[]", // ALWAYS empty for leaf summaries.
    content: summarized.content,
    model: summarized.model,
    tokensIn: summarized.tokensIn,
    tokensOut: summarized.tokensOut,
    createdAt: new Date(),
  };

  await deps.repo.appendConversationSummary(summary);
  await deps.repo.markChatMessagesCompressed(plan.messageIds, summary.id);

  return { summary, absorbedMessageCount: absorbed.length };
}

// ── Meta-compaction DB writer (level 2) ─────────────────────────────

export interface RunMetaCompactionResult {
  summary: ConversationSummaryRecord;
  absorbedSummaryCount: number;
}

/**
 * Level-2 meta-compaction: fold a batch of existing summaries into a
 * single super-summary. The absorbed summaries stay in the table but
 * become inactive (filtered out by `selectActiveSummaries` because
 * a newer summary lists them in `absorbedSummaryIdsJson`).
 *
 * Caller's responsibility (the handler's level-2 trigger):
 *   - Decide WHEN to fire — typically when `selectActiveSummaries`
 *     returns more than MAX_ACTIVE_SUMMARIES.
 *   - Pick the batch — typically the oldest N (e.g. 5) active
 *     summaries.
 *
 * No chat_messages are touched. The messages those summaries cover
 * are already flagged compressed; they stay that way.
 */
export async function runMetaCompaction(
  chatSessionId: string,
  summaryIdsToFold: string[],
  deps: RunCompressionDeps,
): Promise<RunMetaCompactionResult> {
  if (summaryIdsToFold.length < 2) {
    throw new Error("runMetaCompaction: need at least two summaries to fold");
  }

  const allSummaries = await deps.repo.listConversationSummaries(chatSessionId);
  // Preserve the caller's order so the prompt sees the inputs oldest→
  // newest — semantically that's how the caller will have batched the
  // oldest active summaries.
  const byId = new Map(allSummaries.map((s) => [s.id, s] as const));
  const ordered: ConversationSummaryRecord[] = [];
  for (const id of summaryIdsToFold) {
    const found = byId.get(id);
    if (!found) {
      throw new Error(`runMetaCompaction: summary id not found in repo: ${id}`);
    }
    ordered.push(found);
  }

  const summarized = await summarizeSummaries(
    ordered.map((s) => ({ content: s.content })),
    deps,
  );

  const idGen = deps.idGen ?? (() => randomUUID());
  // Span the message-id range of the folded inputs. Oldest fromMessageId
  // → newest toMessageId. The ordered array is oldest-first.
  const fromMessageId = ordered[0].fromMessageId;
  const toMessageId = ordered[ordered.length - 1].toMessageId;
  const maxAbsorbedGen = ordered.reduce((acc, s) => (s.generation > acc ? s.generation : acc), -1);

  const summary: ConversationSummaryRecord = {
    id: idGen(),
    chatSessionId,
    fromMessageId,
    toMessageId,
    // One level deeper than the deepest input. A summary of leaves
    // (all gen=0) lands at gen=1; a summary of mixed-gen inputs lands
    // at max+1.
    generation: maxAbsorbedGen + 1,
    absorbedSummaryIdsJson: JSON.stringify(summaryIdsToFold),
    content: summarized.content,
    model: summarized.model,
    tokensIn: summarized.tokensIn,
    tokensOut: summarized.tokensOut,
    createdAt: new Date(),
  };

  await deps.repo.appendConversationSummary(summary);

  return { summary, absorbedSummaryCount: ordered.length };
}

// ── Active-summary selection ────────────────────────────────────────

/**
 * Filter a flat list of summaries to the "active" set — those NOT
 * absorbed by any other summary in the list. A summary is absorbed
 * iff some other summary lists its id in `absorbedSummaryIdsJson`.
 *
 * Used by the chatHandler to build the LLM bundle: only active
 * summaries inform the next prompt; absorbed ones live on for
 * audit/replay only.
 *
 * Returns summaries in chronological order (oldest first) so the
 * prompt sees them in the order they cover.
 */
export function selectActiveSummaries(
  summaries: ReadonlyArray<ConversationSummaryRecord>,
): ConversationSummaryRecord[] {
  const absorbedIds = new Set<string>();
  for (const s of summaries) {
    try {
      const ids = JSON.parse(s.absorbedSummaryIdsJson) as unknown;
      if (Array.isArray(ids)) {
        for (const id of ids) {
          if (typeof id === "string") absorbedIds.add(id);
        }
      }
    } catch {
      // Malformed json — skip; the summary itself stays in the candidate set.
    }
  }
  return summaries
    .filter((s) => !absorbedIds.has(s.id))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

// ── helpers ─────────────────────────────────────────────────────────

function estimateCharsAsTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
