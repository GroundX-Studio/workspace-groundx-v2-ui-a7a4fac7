/**
 * 3-axis LLM context bundler (per project_chat_session_model.md
 * Phase J) + the compression-trigger check (Phase I).
 *
 * The chat router calls bundleChatContext() right before every
 * outbound LLM call. The bundle has three axes:
 *
 *   1. conversation — the latest summary (if any) plus the live tail
 *      of messages that haven't been compressed into a summary yet.
 *   2. currentEntity — the per-session entity state (last frame,
 *      completed frames, extracted values…). Reads from
 *      ChatStore.activeSession.entities or from the DB chat_session_entities
 *      table depending on auth state (server picks the right read).
 *   3. viewerTrail — the recent slice of viewer_events for the
 *      session. Always server-side (telemetry).
 *
 * The bundler is a PURE function — it doesn't read context itself,
 * doesn't call the LLM. The caller passes raw inputs; the bundler
 * shapes them into the wire format.
 *
 * Token counting + compression trigger
 * ────────────────────────────────────
 * shouldCompress(estimateTokens, budget) returns true when the
 * assembled context approaches the LLM's context window. When true,
 * the router runs the compression pipeline (write a new
 * ConversationSummary that absorbs older messages, mark the
 * compressed messages with compressed_into_summary_id, reassemble
 * the bundle). The compression LLM call itself lands with the real
 * middleware wiring track (#70); this file provides the trigger +
 * the data shape the summary writer needs.
 */

export interface BundleConversationInput {
  /**
   * Every ACTIVE ConversationSummary, chronologically (oldest first).
   * "Active" means no other summary lists this one in its
   * `absorbedSummaryIdsJson` — `selectActiveSummaries` in the
   * conversationCompressor does that filtering.
   *
   * Each leaf summary covers a contiguous slice of original messages
   * at full fidelity; meta-compacted super-summaries cover spans of
   * older leaves. The LLM sees all of them in order plus the
   * uncompressed live tail.
   */
  activeSummaries: ReadonlyArray<{
    id: string;
    content: string;
    tokensIn: number;
    tokensOut: number;
  }>;
  /**
   * Live tail messages (compressed_into_summary_id IS NULL).
   * Ordered chronologically (oldest first).
   */
  liveTail: { id: string; role: string; content: string }[];
}

export interface BundleEntityInput {
  entityKey: string | null;
  lastFrame: string | null;
  completedFrames: string[];
  extractedValues: Record<string, unknown> | null;
}

export interface BundleViewerEvent {
  action: string;
  entityKey: string | null;
  source: string;
  timestamp: number;
}

export interface BundleChatContextInput {
  conversation: BundleConversationInput;
  currentEntity: BundleEntityInput;
  /**
   * Recent viewer events. The caller should pre-slice to the most
   * recent N (typical: last 10) — older events are noise to the LLM.
   */
  recentViewerEvents: BundleViewerEvent[];
  newUserMessage: string;
}

export interface BundledChatContext {
  /** Convenience: estimated token count of the entire bundle. */
  estimatedTokens: number;
  conversation: BundleConversationInput;
  currentEntity: BundleEntityInput;
  viewerTrail: BundleViewerEvent[];
  newUserMessage: string;
}

/**
 * Bundle the 3-axis context for an outbound LLM call.
 *
 * Pure: same inputs → same output. No I/O, no LLM call, no DB read.
 */
export function bundleChatContext(input: BundleChatContextInput): BundledChatContext {
  const estimatedTokens =
    estimateConversationTokens(input.conversation) +
    estimateEntityTokens(input.currentEntity) +
    estimateViewerEventsTokens(input.recentViewerEvents) +
    estimateText(input.newUserMessage);

  return {
    estimatedTokens,
    conversation: input.conversation,
    currentEntity: input.currentEntity,
    viewerTrail: input.recentViewerEvents,
    newUserMessage: input.newUserMessage,
  };
}

/**
 * Default ratio of the LLM context window at which compression
 * triggers. 0.7 leaves room for the LLM's response token allocation
 * AND for the response itself; deployments can tune via
 * `COMPRESSION_TRIGGER_RATIO` env (CF-17).
 */
export const DEFAULT_COMPRESSION_TRIGGER_RATIO = 0.7;

/**
 * Whether the assembled context needs compression before the LLM call.
 * `triggerRatio` defaults to 0.7 — leaves room for the LLM's response.
 * Configurable via `COMPRESSION_TRIGGER_RATIO` env so deployments can
 * dial more conservative (0.5 = compress earlier, safer for streaming)
 * or more aggressive (0.9 = pack more context, riskier).
 */
export function shouldCompress(
  estimatedTokens: number,
  contextWindowTokens: number,
  triggerRatio: number = DEFAULT_COMPRESSION_TRIGGER_RATIO,
): boolean {
  if (contextWindowTokens <= 0) return false;
  return estimatedTokens >= contextWindowTokens * triggerRatio;
}

/**
 * What the next compression run should fold into a single summary.
 * Walks the liveTail oldest-first, collects messages whose cumulative
 * token estimate fits within `targetCompressedTokens`, and returns
 * the boundary. The router then asks the LLM to summarize that
 * slice; the summary becomes the new "latest summary" with the
 * absorbed message ids recorded.
 */
/**
 * A level-1 compression plan: which liveTail messages to fold into
 * a new leaf summary. NO prior summary is absorbed (that's level 2's
 * job — see `runMetaCompaction`). `absorbedSummaryIds` is kept on the
 * type only as a backward-compat shim; level-1 callers always pass [].
 */
export interface CompressionPlan {
  fromMessageId: string;
  toMessageId: string;
  messageIds: string[];
  /** @deprecated Level-1 leaf compaction never absorbs prior summaries.
   *  Kept for back-compat with callers that haven't migrated yet. */
  absorbedSummaryIds: string[];
}

export function planCompression(
  liveTail: BundleConversationInput["liveTail"],
  targetCompressedTokens: number,
): CompressionPlan | null {
  if (liveTail.length < 2) return null;
  const messages: { id: string; tokens: number }[] = liveTail.map((m) => ({
    id: m.id,
    tokens: estimateText(m.content),
  }));

  let acc = 0;
  const collected: string[] = [];
  for (const m of messages) {
    acc += m.tokens;
    collected.push(m.id);
    if (acc >= targetCompressedTokens) break;
  }
  // We must leave at least the last message in the live tail so the
  // LLM has something to respond to. If the collected window covers
  // every live-tail message, drop the last one from the plan.
  if (collected.length === liveTail.length) {
    collected.pop();
  }
  if (collected.length < 2) return null;

  return {
    fromMessageId: collected[0],
    toMessageId: collected[collected.length - 1],
    messageIds: collected,
    absorbedSummaryIds: [], // ALWAYS empty for leaf compaction.
  };
}

// ── Token-estimate helpers ────────────────────────────────────────
//
// Crude character-based heuristic — good enough for compression-
// trigger decisions. The actual LLM call uses the provider's own
// tokenizer; this is a pre-flight ceiling check.

function estimateText(text: string): number {
  // ~4 chars per token is a reasonable cross-provider average.
  return Math.ceil(text.length / 4);
}

function estimateConversationTokens(c: BundleConversationInput): number {
  let total = 0;
  // Every ACTIVE summary contributes to the budget — leaf summaries
  // cover non-overlapping slices, meta summaries supplant the leaves
  // they absorb (which is why we only count active ones).
  for (const s of c.activeSummaries) total += estimateText(s.content);
  for (const msg of c.liveTail) total += estimateText(msg.content);
  return total;
}

function estimateEntityTokens(e: BundleEntityInput): number {
  if (!e.entityKey) return 0;
  let total = estimateText(e.entityKey) + estimateText(e.lastFrame ?? "") + e.completedFrames.length * 2;
  if (e.extractedValues) total += estimateText(JSON.stringify(e.extractedValues));
  return total;
}

function estimateViewerEventsTokens(events: BundleViewerEvent[]): number {
  // Each event is small — entityKey + action + source.
  return events.reduce((acc, e) => acc + estimateText(e.action) + estimateText(e.entityKey ?? "") + 4, 0);
}
