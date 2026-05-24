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
  /** Most recent ConversationSummary if one exists, else null. */
  latestSummary: {
    id: string;
    content: string;
    tokensIn: number;
    tokensOut: number;
  } | null;
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
 * Whether the assembled context needs compression before the LLM call.
 * The 70% threshold leaves room for the LLM's response.
 */
export function shouldCompress(estimatedTokens: number, contextWindowTokens: number): boolean {
  if (contextWindowTokens <= 0) return false;
  return estimatedTokens >= contextWindowTokens * 0.7;
}

/**
 * What the next compression run should fold into a single summary.
 * Walks the liveTail oldest-first, collects messages whose cumulative
 * token estimate fits within `targetCompressedTokens`, and returns
 * the boundary. The router then asks the LLM to summarize that
 * slice; the summary becomes the new "latest summary" with the
 * absorbed message ids recorded.
 */
export interface CompressionPlan {
  fromMessageId: string;
  toMessageId: string;
  messageIds: string[];
  absorbedSummaryIds: string[];
}

export function planCompression(
  liveTail: BundleConversationInput["liveTail"],
  latestSummaryId: string | null,
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
    absorbedSummaryIds: latestSummaryId ? [latestSummaryId] : [],
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
  if (c.latestSummary) total += estimateText(c.latestSummary.content);
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
