/**
 * Conversation compressor — Phases I + J of the chat-session model.
 *
 * Phase I  (this module's `summarizeChunk`)
 *   The actual LLM call: given a slice of `ChatMessageRecord`s plus
 *   any prior summary text, ask the LLM to produce a structured
 *   summary covering decisions, intents, references, and unresolved
 *   threads. Returns the summary content + token counters for cost
 *   tracking.
 *
 * Phase J  (this module's `runCompression`)
 *   The DB writer: takes a `CompressionPlan` from the contextBundler,
 *   calls `summarizeChunk`, writes a new `ConversationSummaryRecord`
 *   into the repo, then flags the absorbed messages via
 *   `markChatMessagesCompressed`. The next `bundleChatContext` call
 *   sees a fresh "latest summary" + a shorter live tail.
 *
 * Both phases live behind a single facade so callers (chatRouter or
 * a background job) treat compression as one atomic unit.
 *
 * Token accounting: we accept whatever the LLM provider reports in
 * `usage.prompt_tokens` / `usage.completion_tokens`. If the provider
 * omits them (some self-hosted backends), we fall back to the
 * character-based estimator already shipping in contextBundler.
 */

import { randomUUID } from "node:crypto";

import type {
  AppRepository,
  ChatMessageRecord,
  ConversationSummaryRecord,
  LlmClient,
} from "../types.js";

import type { CompressionPlan } from "./contextBundler.js";

/**
 * Build the summarization prompt for a chunk of messages, optionally
 * absorbing a prior summary. The system message is intentionally
 * specific: we want output the next LLM call can splice in as a
 * "context preamble", not a chatty paragraph.
 */
export function buildSummaryPrompt(
  messages: ReadonlyArray<Pick<ChatMessageRecord, "role" | "content">>,
  priorSummary: string | null,
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

  const userBody = priorSummary
    ? `Prior summary (absorb this into the new summary; do not lose " +
        "information from it):\n${priorSummary}\n\n--- New chunk ---\n${chunk}`
    : `Conversation chunk:\n${chunk}`;

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: userBody },
    ],
  };
}

export interface SummarizeChunkResult {
  /** The summary text the LLM produced. */
  content: string;
  /** Provider-reported prompt tokens, or null if unavailable. */
  tokensIn: number;
  /** Provider-reported completion tokens, or null if unavailable. */
  tokensOut: number;
  /** Model id used (echo of the request). */
  model: string;
}

export interface SummarizeChunkDeps {
  llmClient: LlmClient;
  /** Provider model id, e.g. "gpt-5.5" or "claude-3-haiku". */
  modelId: string;
}

/**
 * Call the LLM to summarize a chunk of conversation. Pure I/O; no DB
 * writes. The caller is responsible for persisting the result.
 */
export async function summarizeChunk(
  messages: ReadonlyArray<Pick<ChatMessageRecord, "role" | "content">>,
  priorSummary: string | null,
  deps: SummarizeChunkDeps,
): Promise<SummarizeChunkResult> {
  const prompt = buildSummaryPrompt(messages, priorSummary);
  const body = {
    model: deps.modelId,
    messages: prompt.messages,
    // Compression is a tight summarization task — low temperature
    // keeps the output deterministic and reduces token spread.
    temperature: 0.1,
  };

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
 * End-to-end compression run: takes a `CompressionPlan`, fetches the
 * absorbed messages, calls the LLM, writes the summary, and flags the
 * absorbed messages so the next live-tail read skips them.
 *
 * The caller (chatRouter or a background job) is responsible for:
 *   - Deciding whether to compress (`shouldCompress` from contextBundler).
 *   - Building the plan (`planCompression` from contextBundler).
 *   - Choosing the model id.
 *
 * Failures bubble up. Partial-write recovery (summary appended but
 * markChatMessagesCompressed failed) is rare in practice and surfaces
 * as duplicate messages in the next live tail — the bundler tolerates
 * that since `compressedIntoSummaryId IS NULL` is the only signal
 * that matters for inclusion.
 */
export async function runCompression(
  chatSessionId: string,
  plan: CompressionPlan,
  deps: RunCompressionDeps,
): Promise<RunCompressionResult> {
  if (plan.messageIds.length < 2) {
    throw new Error("runCompression: plan must include at least two messages");
  }

  // Fetch the absorbed messages + the prior summary content (if any)
  // from the repo. We could pass these in as args, but reading from
  // the repo here keeps callers honest: they can't pass stale data.
  const allMessages = await deps.repo.listChatMessages(chatSessionId);
  const idSet = new Set(plan.messageIds);
  const absorbed = allMessages.filter((m) => idSet.has(m.id));
  if (absorbed.length !== plan.messageIds.length) {
    throw new Error(
      `runCompression: plan referenced ${plan.messageIds.length} messages but repo had ${absorbed.length}`,
    );
  }

  let priorSummaryContent: string | null = null;
  let priorGeneration = -1;
  if (plan.absorbedSummaryIds.length > 0) {
    const summaries = await deps.repo.listConversationSummaries(chatSessionId);
    // The plan can reference an older summary id we want absorbed.
    // We always take the highest generation among the referenced ids.
    const referenced = summaries.filter((s) => plan.absorbedSummaryIds.includes(s.id));
    for (const s of referenced) {
      if (s.generation > priorGeneration) {
        priorGeneration = s.generation;
        priorSummaryContent = s.content;
      }
    }
  }

  const summarized = await summarizeChunk(absorbed, priorSummaryContent, deps);

  const idGen = deps.idGen ?? (() => randomUUID());
  const summary: ConversationSummaryRecord = {
    id: idGen(),
    chatSessionId,
    fromMessageId: plan.fromMessageId,
    toMessageId: plan.toMessageId,
    // Generation 0 is the first summary; each subsequent one absorbs
    // the prior and increments.
    generation: priorGeneration + 1,
    absorbedSummaryIdsJson: JSON.stringify(plan.absorbedSummaryIds),
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

// ── helpers ─────────────────────────────────────────────────────────

function estimateCharsAsTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
