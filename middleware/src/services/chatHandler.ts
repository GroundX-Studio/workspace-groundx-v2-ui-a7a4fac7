/**
 * Chat handler — the entry point behind `POST /api/chat/messages`.
 *
 * Responsibilities (Track F):
 *   1. Validate the request.
 *   2. Append the new user message to the chat session.
 *   3. Build the 3-axis context bundle.
 *   4. If `shouldCompress` fires, run a compression pass (Phase I + J).
 *   5. Route through `routeChat` (live RAG / structured / hybrid path).
 *   6. Append the assistant reply (with provider/model + latency).
 *   7. Return a typed envelope to the client.
 *
 * The handler is a pure function of its inputs (no Express types
 * leak in). The route binding in app.ts is responsible for parsing
 * the request body and shaping the Express response.
 *
 * NOTE: this implementation assumes the chat session already exists.
 * The frontend creates it eagerly via `POST /api/chat-sessions` when
 * a new local ChatSession is minted. On F6 sign-up, those anon rows
 * are re-keyed to the user's id by `POST /api/chat-sessions/claim`
 * (`rekeyAnonymousChatSessions` on the repository).
 */

import { randomUUID } from "node:crypto";

import type {
  AppRepository,
  ChatMessageRecord,
  ChatSessionEntityRecord,
  GroundXClient,
  GroundXPartnerClient,
  LlmClient,
} from "../types.js";

import {
  bundleChatContext,
  planCompression,
  shouldCompress,
  type BundleChatContextInput,
} from "./contextBundler.js";
import {
  ChatRouteNotImplementedError,
  routeChat,
  type ChatRouterRequest,
  type ChatRouterResponse,
} from "./chatRouter.js";
import { ApiError, type ContentScope } from "@groundx/shared";
import { runCompression, runMetaCompaction, selectActiveSummaries } from "./conversationCompressor.js";
import { UpstreamTimeoutError } from "./http.js";
import { logger } from "../lib/logger.js";

export interface HandleChatMessageRequest {
  chatSessionId: string;
  newUserMessage: string;
  /** Optional intent hint from the UI orchestrator. */
  intent?: string | null;
  /**
   * Optional friendly scope hint from the frontend (the scenario
   * manifest + active doc). Threaded into the grounded LLM prompt
   * so the model knows what doc the user is currently looking at,
   * even when GroundX search returns zero snippets.
   */
  scopeHint?: {
    fileName?: string | null;
    scenarioTitle?: string | null;
  };
  /**
   * widget-llm-integration Phase 5 — active ViewerStep kind. Threaded
   * through to the chat router so the LLM tool catalog is filtered
   * to tools relevant on the user's current surface.
   */
  activeStepKind?: string | null;
}

export interface HandleChatMessageResponse {
  /** The persisted user message id. */
  userMessageId: string;
  /** The persisted assistant message id. */
  assistantMessageId: string;
  /** The router's reply envelope (answer + citations + suggested actions). */
  reply: ChatRouterResponse;
  /** True iff a compression pass ran on this request. */
  compressionRan: boolean;
}

export interface HandleChatMessageDeps {
  repository: AppRepository;
  /**
   * Chat-side LLM client. Used for the RAG grounded completion and for
   * everything that needs the high-quality / large-context model.
   * Configured from the `LLM_*` env block.
   */
  llmClient: LlmClient;
  /**
   * Optional light-side LLM client (CF-16). Used for tasks where a
   * smaller / cheaper / faster model is fine — today: leaf
   * summarization + meta-compaction. When omitted, the chat client is
   * used for both (single-LLM deployments still work).
   * Configured from the `LLM_LIGHT_*` env block.
   */
  lightLlmClient?: LlmClient;
  groundxClient: GroundXClient;
  /**
   * CF-04: Partner API client. Required for the structured-mode
   * my_projects + api_keys sub-handlers; optional for RAG-only / MOCK
   * / anon-only deployments. Threaded through `routeChat` →
   * `runStructuredQuery`.
   */
  partnerClient?: GroundXPartnerClient;
  /**
   * CF-03: server-derived RBAC / tenant / region filter. Composed
   * with the scope filter via `$and` inside `searchGroundX`. The
   * BFF derives this from the authed session — NEVER from client
   * input. Optional: deployments without an RBAC system leave it
   * undefined and the scope filter dispatches unchanged.
   */
  rbacFilter?: Record<string, unknown>;
  /** GroundX API key for the live RAG path. */
  groundxApiKey: string | null;
  /**
   * Onboarding samples bucket id (from env.GROUNDX_SAMPLES_BUCKET_ID).
   * Used as the RAG content-scope fallback ONLY when the active entity
   * doesn't carry a more specific bucket/project/group/document scope.
   * In steady mode (signed-in customer with their own buckets) this
   * should be ignored — the scope comes from the active entity. The
   * name is deliberately onboarding-specific to avoid confusing this
   * with the broader "where is the user searching right now" concept.
   */
  samplesBucketId: number | null;
  /** Provider model id, e.g. "gpt-4o" or "claude-3-haiku". */
  llmModelId: string;
  /**
   * Model id for the light-side LLM (CF-16). Used with `lightLlmClient`
   * for compression. Defaults to `llmModelId` so single-LLM deployments
   * keep their existing behavior.
   */
  lightLlmModelId?: string;
  /**
   * Legacy name for `lightLlmModelId`. Kept for back-compat callers
   * that wired `compressionModelId` before CF-16 introduced the
   * light/chat split; `lightLlmModelId` wins when both are set.
   */
  compressionModelId?: string;
  /** Free-tier BYO page budget surfaced by the "pages_remaining" structured query. */
  byoPagesLimit?: number;
  /**
   * Estimated LLM context window in tokens. Compression triggers when
   * the bundled context exceeds `compressionTriggerRatio` of this
   * value. Defaults to 16k — a safe lower bound for most production
   * models. Tune per model (Claude Sonnet=200k, GPT-4o=128k).
   * Wired from `env.LLM_CONTEXT_WINDOW_TOKENS`.
   */
  contextWindowTokens?: number;
  /**
   * Fraction of the context window at which compression fires.
   * Default 0.7. Lower (e.g. 0.5) compresses earlier — safer for
   * streaming. Higher (e.g. 0.9) packs more context — riskier.
   * Wired from `env.COMPRESSION_TRIGGER_RATIO`.
   */
  compressionTriggerRatio?: number;
  /**
   * Approximate token budget the leaf-compaction planner targets when
   * picking the message range to fold. Larger = fewer-but-bigger leaf
   * summaries; smaller = more-but-tinier leaves. Default 1000.
   * Wired from `env.COMPRESSION_TARGET_TOKENS`.
   */
  compressionTargetTokens?: number;
  /**
   * Level-2 trigger: when the count of ACTIVE summaries exceeds this
   * value, meta-compaction folds the oldest batch into a super-summary.
   * Default 10. Wired from `env.MAX_ACTIVE_SUMMARIES_BEFORE_META`.
   */
  maxActiveSummariesBeforeMeta?: number;
  /**
   * Number of OLDEST active summaries to fold in one meta-compaction
   * pass. Default 5. Wired from `env.META_COMPACTION_BATCH_SIZE`.
   */
  metaCompactionBatchSize?: number;
  /**
   * Hard cap on the LLM's output tokens for summarization calls
   * (passed as `max_tokens` in the chat.completions body). Default
   * 600 — long enough for 10–14 bullet lines, short enough that an
   * over-eager model can't write a summary that defeats the
   * compression. Wired from `env.MAX_SUMMARY_OUTPUT_TOKENS`.
   */
  maxSummaryOutputTokens?: number;
  /**
   * Override for tests; defaults to crypto.randomUUID.
   */
  idGen?: () => string;
}

/**
 * In-code fallback constants — used ONLY when handleChatMessage is
 * called from a test or other caller that omits the `deps.<field>`.
 * Production always reads from env via app.ts; the values MUST stay
 * pinned to the env Zod defaults (drift guard test enforces this).
 */
export const DEFAULT_CONTEXT_WINDOW = 16_000;
export const DEFAULT_COMPRESSION_TARGET_TOKENS = 1_000;
export const DEFAULT_MAX_ACTIVE_SUMMARIES_BEFORE_META = 10;
export const DEFAULT_META_COMPACTION_BATCH_SIZE = 5;
export const DEFAULT_MAX_SUMMARY_OUTPUT_TOKENS = 600;
const RECENT_VIEWER_EVENTS = 10;

/**
 * Pure handler — takes a typed request + deps, returns a typed
 * response. Persists side effects to the AppRepository. Throws on
 * validation failure (caller maps to 400) or upstream failure
 * (caller maps to 502).
 */
export async function handleChatMessage(
  request: HandleChatMessageRequest,
  deps: HandleChatMessageDeps,
): Promise<HandleChatMessageResponse> {
  validateRequest(request);

  const session = await deps.repository.getChatSession(request.chatSessionId);
  if (!session) {
    throw new ChatHandlerError("chat_session_not_found", 404);
  }

  const idGen = deps.idGen ?? (() => randomUUID());
  const userMessageId = idGen();
  const existingMessages = await deps.repository.listChatMessages(request.chatSessionId);
  const nextTurnIndex = existingMessages.length + 1;

  // 1. Persist the new user message first so the conversation log
  //    is durable even if the LLM call fails downstream.
  const userMessage: ChatMessageRecord = {
    id: userMessageId,
    chatSessionId: request.chatSessionId,
    turnIndex: nextTurnIndex,
    role: "user",
    content: request.newUserMessage,
    citationsJson: null,
    compressedIntoSummaryId: null,
    llmProvider: null,
    llmModelId: null,
    latencyMs: null,
    promptTokens: null,
    completionTokens: null,
    errorCode: null,
    createdAt: new Date(),
  };
  await deps.repository.appendChatMessage(userMessage);

  // 2. Build the 3-axis context bundle. We re-read messages after
  //    the user-message append so the live tail includes the user's
  //    new turn (giving compression an accurate view).
  const messagesAfterUser = await deps.repository.listChatMessages(request.chatSessionId);
  const allSummaries = await deps.repository.listConversationSummaries(request.chatSessionId);
  // The LLM bundle uses only ACTIVE summaries — those not absorbed
  // by any other summary in the list. Older meta-compacted leaves
  // stay in the table for audit but get filtered out here.
  const activeSummaries = selectActiveSummaries(allSummaries);
  const liveTail = messagesAfterUser
    .filter((m) => m.compressedIntoSummaryId === null)
    .map((m) => ({ id: m.id, role: m.role, content: m.content }));

  const entities = await deps.repository.listChatSessionEntities(request.chatSessionId);
  const activeEntityKey = session.activeEntityKey;
  const activeEntity = entities.find((e) => e.entityKey === activeEntityKey) ?? null;

  const recentViewerEvents = (await deps.repository.listViewerEvents(request.chatSessionId))
    .slice(-RECENT_VIEWER_EVENTS)
    .map((v) => ({
      action: v.action,
      entityKey: v.entityKey,
      source: v.source,
      timestamp: v.timestamp,
    }));

  const bundleInput: BundleChatContextInput = {
    conversation: {
      activeSummaries: activeSummaries.map((s) => ({
        id: s.id,
        content: s.content,
        tokensIn: s.tokensIn,
        tokensOut: s.tokensOut,
      })),
      liveTail,
    },
    currentEntity: {
      entityKey: activeEntity?.entityKey ?? null,
      lastFrame: activeEntity?.lastFrame ?? null,
      completedFrames: activeEntity ? safeParseStringArray(activeEntity.completedFramesJson) : [],
      extractedValues: activeEntity?.extractedValuesJson
        ? safeParseObject(activeEntity.extractedValuesJson)
        : null,
    },
    recentViewerEvents,
    newUserMessage: request.newUserMessage,
  };

  const bundle = bundleChatContext(bundleInput);

  // 3. Compression pre-flight. Two independent triggers:
  //
  //    Level 1 — liveTail too long for the context window
  //       → fold the oldest chunk into a NEW leaf summary
  //         (independent; generation 0; absorbs no prior summary).
  //
  //    Level 2 — active-summaries list too long
  //       → fold the oldest batch of leaves into ONE super-summary
  //         (meta-compaction; the batched leaves become inactive).
  //
  //    They can fire in the same request (large session + many old
  //    summaries) but each fires at most once per request to bound
  //    latency. Background-job migration is on the deferred list.
  let compressionRan = false;
  const maxSummaryOutputTokens = deps.maxSummaryOutputTokens ?? DEFAULT_MAX_SUMMARY_OUTPUT_TOKENS;
  // CF-16: route compression through the LIGHT client when wired.
  // Falls back to the chat client when no light client is configured —
  // single-LLM deployments keep their existing single-call behavior.
  const compressionLlmClient = deps.lightLlmClient ?? deps.llmClient;
  const compressionLlmModelId =
    deps.lightLlmModelId ?? deps.compressionModelId ?? deps.llmModelId;
  const compressionDeps = {
    repo: deps.repository,
    llmClient: compressionLlmClient,
    modelId: compressionLlmModelId,
    maxOutputTokens: maxSummaryOutputTokens,
    idGen,
  };
  const triggerCheck = shouldCompress(
    bundle.estimatedTokens,
    deps.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW,
    deps.compressionTriggerRatio,
  );
  if (triggerCheck) {
    const targetTokens = deps.compressionTargetTokens ?? DEFAULT_COMPRESSION_TARGET_TOKENS;
    const plan = planCompression(liveTail, targetTokens);
    if (plan) {
      await runCompression(request.chatSessionId, plan, compressionDeps);
      compressionRan = true;
    }
  }
  const metaCap = deps.maxActiveSummariesBeforeMeta ?? DEFAULT_MAX_ACTIVE_SUMMARIES_BEFORE_META;
  if (activeSummaries.length > metaCap) {
    // Pick the oldest N active summaries to fold (oldest-first order
    // matches selectActiveSummaries' return order).
    const batchSize = deps.metaCompactionBatchSize ?? DEFAULT_META_COMPACTION_BATCH_SIZE;
    const batch = activeSummaries.slice(0, batchSize);
    if (batch.length >= 2) {
      await runMetaCompaction(
        request.chatSessionId,
        batch.map((s) => s.id),
        compressionDeps,
      );
      compressionRan = true;
    }
  }

  // 4. Route the chat request. The RAG path hits GroundX search +
  //    a grounded LLM call; structured/hybrid run the live handlers.
  //    There is no mock path — tests inject fake clients at the seam.
  const startedAt = Date.now();
  const routerRequest: ChatRouterRequest = {
    newUserMessage: request.newUserMessage,
    currentEntityKey: bundleInput.currentEntity.entityKey,
    conversationTail: {
      messageCount: liveTail.length,
      lastTurnContent: liveTail.length >= 2 ? liveTail[liveTail.length - 2].content : null,
    },
    recentViewerEvents: recentViewerEvents.map((v) => ({ action: v.action, entityKey: v.entityKey })),
    // RT-04 — feed the persisted canvas intent into the router so
    // it knows what view the user is on (independent of per-turn
    // `intent` hints). Without RT-04 the column was stale after the
    // first navigation, so this would always be null/seed-time.
    currentIntent: session.currentIntent,
    intent: request.intent ?? null,
    scopeHint: request.scopeHint,
    activeStepKind: request.activeStepKind,
    // 2026-05-31-tool-system-completion — derive the caller's WidgetRole
    // SERVER-side from the chat session (an authenticated session has an
    // `ownerUserId`; an anonymous one does not). NEVER trusted from the client.
    // The router role-filters the LLM tool catalog on this.
    callerRole: session.ownerUserId ? "member" : "anonymous",
  };

  let reply: ChatRouterResponse;
  let errorCode: string | null = null;
  try {
    // Derive the RAG content scope from the active entity. Until
    // EntitySession carries explicit project/group/document refs,
    // we land here on either a samples-bucket scope (the env-provided
    // default for anon onboarding) or "unknown". The router logs
    // unknown-scope dispatches so we can spot the gap in telemetry.
    const contentScope = deriveRagContentScope(activeEntity, deps.samplesBucketId);
    reply = await routeChat(routerRequest, {
      llmClient: deps.llmClient,
      groundxClient: deps.groundxClient,
      groundxApiKey: deps.groundxApiKey ?? undefined,
      samplesBucketId: deps.samplesBucketId,
      contentScope,
      repository: deps.repository,
      chatSessionId: request.chatSessionId,
      groundxUsername: session.ownerUserId,
      partnerClient: deps.partnerClient,
      rbacFilter: deps.rbacFilter,
      byoPagesLimit: deps.byoPagesLimit,
      llmModelId: deps.llmModelId,
    });
  } catch (err) {
    // Record the failure as an assistant message so the conversation
    // history stays consistent. The status code we re-throw depends on
    // why we failed:
    //   - ChatRouteNotImplementedError -> 501 (mode not wired)
    //   - UpstreamTimeoutError         -> 504 (LLM/GroundX hung)
    //   - anything else                -> 502 (router/upstream blew up)
    errorCode = err instanceof Error ? err.message.slice(0, 200) : "unknown_error";
    logger.error(
      {
        err,
        chatSessionId: request.chatSessionId,
        ownerUserId: session.ownerUserId,
        ownerAnonId: session.ownerAnonId,
      },
      "chat router failed",
    );
    const assistantId = idGen();
    await deps.repository.appendChatMessage({
      ...userMessage,
      id: assistantId,
      turnIndex: nextTurnIndex + 1,
      role: "assistant",
      content: "",
      errorCode,
      latencyMs: Date.now() - startedAt,
      createdAt: new Date(),
    });
    if (err instanceof ChatRouteNotImplementedError) {
      throw new ChatHandlerError(`mode_not_implemented:${err.mode}`, 501);
    }
    if (err instanceof UpstreamTimeoutError) {
      throw new ChatHandlerError(`upstream_timeout:${errorCode}`, 504);
    }
    throw new ChatHandlerError(`router_failed:${errorCode}`, 502);
  }
  const latencyMs = Date.now() - startedAt;

  // 5. Persist the assistant reply.
  const assistantMessageId = idGen();
  const messagesNow = await deps.repository.listChatMessages(request.chatSessionId);
  const assistantTurnIndex = messagesNow.length + 1;
  await deps.repository.appendChatMessage({
    id: assistantMessageId,
    chatSessionId: request.chatSessionId,
    turnIndex: assistantTurnIndex,
    role: "assistant",
    content: reply.answer,
    citationsJson: reply.citations.length ? JSON.stringify(reply.citations) : null,
    compressedIntoSummaryId: null,
    llmProvider: "live",
    llmModelId: deps.llmModelId,
    latencyMs,
    promptTokens: null,
    completionTokens: null,
    errorCode: null,
    createdAt: new Date(),
  });

  // widget-llm-integration Phase 5 — persist every dispatched tool
  // call into `intent_log` (UI-10b's existing table). Source is
  // `agent` since these intents originated from an LLM tool call
  // rather than a user click. Failures are NOT persisted as intents
  // (they didn't dispatch); failures surface on the chat reply for
  // the frontend to render.
  for (const dispatched of reply.intents) {
    const intent = dispatched.intent;
    const intentKind = typeof intent.kind === "string" ? intent.kind : "unknown";
    try {
      await deps.repository.appendIntentLog({
        id: idGen(),
        chatSessionId: request.chatSessionId,
        timestamp: Date.now(),
        source: "agent",
        intentKind,
        intentJson: JSON.stringify(intent),
      });
    } catch (logErr) {
      // Fire-and-forget — a failed intent_log write must not break
      // the chat reply.
      logger.warn(
        {
          err: logErr,
          chatSessionId: request.chatSessionId,
          toolName: dispatched.name,
        },
        "intent_log persist failed (agent tool call)",
      );
    }
  }

  return {
    userMessageId,
    assistantMessageId,
    reply,
    compressionRan,
  };
}

/**
 * Derive the RAG ContentScope from the active entity + the env-
 * provided fallback bucket. CF-15 wires this end-to-end so the active
 * EntitySession's scope refs win over the env samples-bucket fallback.
 *
 * Precedence (first match wins):
 *
 *   1. entity.documentIds (non-empty)             → `{type:"documents"}`
 *   2. entity.groupId (set)                       → `{type:"group"}`
 *   3. entity.bucketId (set)                      → `{type:"bucket",
 *                                                     filter?:{projectId:[...]}}`
 *   4. fallback env samples bucketId              → `{type:"bucket"}`
 *   5. else                                       → `null` (no derivable scope)
 *
 * Onboarding's anon seed entity has none of the four scope refs so
 * the env fallback still drives the search — the legacy behavior is
 * intact. A product project is a `projectId` **filter-field** on the bucket
 * (WF-07), never a group; that mapping is expressed via the composable
 * `filter`. "No derivable scope" returns `null` (not a fake variant);
 * `searchGroundX` handles null as the doc-wide legacy fallback.
 */
export function deriveRagContentScope(
  activeEntity: ChatSessionEntityRecord | null | undefined,
  fallbackBucketId: number | null | undefined,
): ContentScope | null {
  if (activeEntity) {
    // 1. Document-level scope wins (single-PDF viewer flows).
    const docIds = safeParseStringArray(activeEntity.documentIdsJson ?? "[]");
    if (docIds.length > 0) {
      return { type: "documents", documentIds: docIds };
    }
    // 2. Multi-workspace group.
    if (activeEntity.groupId != null) {
      return { type: "group", groupId: activeEntity.groupId };
    }
    // 3. Bucket — optionally narrowed by a projectId filter-field.
    if (activeEntity.bucketId != null) {
      const projectIds = safeParseStringArray(activeEntity.projectIdsJson ?? "[]");
      return projectIds.length > 0
        ? { type: "bucket", bucketId: activeEntity.bucketId, filter: { projectId: projectIds } }
        : { type: "bucket", bucketId: activeEntity.bucketId };
    }
  }
  // 4. Legacy env-bucket fallback for the onboarding samples flow.
  if (fallbackBucketId != null) {
    return { type: "bucket", bucketId: fallbackBucketId };
  }
  // 5. No derivable scope. Returns null; searchGroundX logs the gap.
  return null;
}

/**
 * Typed handler error so the route layer can map exit codes back to
 * HTTP status codes without catching every Error.
 */
export class ChatHandlerError extends ApiError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode);
    this.name = "ChatHandlerError";
  }

  /**
   * The route layer reads `.statusCode` to set the HTTP response status.
   * Backed by the base `status` — this is an alias getter, NOT a re-declared
   * field, so the one error contract stays single-sourced.
   */
  get statusCode(): number {
    return this.status;
  }
}

function validateRequest(request: HandleChatMessageRequest): void {
  if (!request.chatSessionId || typeof request.chatSessionId !== "string") {
    throw new ChatHandlerError("chatSessionId must be a non-empty string", 400);
  }
  if (typeof request.newUserMessage !== "string") {
    throw new ChatHandlerError("newUserMessage must be a string", 400);
  }
  const trimmed = request.newUserMessage.trim();
  if (trimmed.length === 0) {
    throw new ChatHandlerError("newUserMessage must be non-empty", 400);
  }
  if (trimmed.length > 8000) {
    throw new ChatHandlerError("newUserMessage exceeds 8000 chars", 400);
  }
  if (request.intent !== undefined && request.intent !== null && typeof request.intent !== "string") {
    throw new ChatHandlerError("intent must be a string when provided", 400);
  }
}

function safeParseStringArray(json: string): string[] {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function safeParseObject(json: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
