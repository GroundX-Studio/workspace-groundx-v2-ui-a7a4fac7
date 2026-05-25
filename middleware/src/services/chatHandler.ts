/**
 * Chat handler — the entry point behind `POST /api/chat/messages`.
 *
 * Responsibilities (Track F):
 *   1. Validate the request.
 *   2. Append the new user message to the chat session.
 *   3. Build the 3-axis context bundle.
 *   4. If `shouldCompress` fires, run a compression pass (Phase I + J).
 *   5. Route through `routeChat` (mock OR live RAG pipeline).
 *   6. Append the assistant reply (with provider/model + latency).
 *   7. Return a typed envelope to the client.
 *
 * The handler is a pure function of its inputs (no Express types
 * leak in). The route binding in app.ts is responsible for parsing
 * the request body and shaping the Express response.
 *
 * NOTE: this implementation assumes the chat session already exists.
 * Session creation happens via the existing ChatStore flow (anon
 * localStorage) + `claimAnonymousChatPayload` (post-signup). New
 * authenticated sessions will need a sibling `createSession` route;
 * that's a separate task.
 */

import { randomUUID } from "node:crypto";

import type {
  AppRepository,
  ChatMessageRecord,
  GroundXClient,
  LlmClient,
} from "../types.js";

import {
  bundleChatContext,
  planCompression,
  shouldCompress,
  type BundleChatContextInput,
} from "./contextBundler.js";
import { routeChat, type ChatRouterRequest, type ChatRouterResponse } from "./chatRouter.js";
import { runCompression } from "./conversationCompressor.js";

export interface HandleChatMessageRequest {
  chatSessionId: string;
  newUserMessage: string;
  /** Optional intent hint from the UI orchestrator. */
  intent?: string | null;
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
  llmClient: LlmClient;
  groundxClient: GroundXClient;
  /** GroundX API key for the live RAG path. */
  groundxApiKey: string | null;
  /** Bucket id for RAG search. null = search across all docs. */
  searchBucketId: number | null;
  /** Provider model id, e.g. "gpt-4o" or "claude-3-haiku". */
  llmModelId: string;
  /** Model id used specifically for compression summaries. Defaults to llmModelId. */
  compressionModelId?: string;
  /** When true, skip GroundX/LLM and return canned router responses. */
  mockMode: boolean;
  /**
   * Estimated LLM context window in tokens. Compression triggers when
   * the bundled context exceeds 70% of this value. Defaults to 16k
   * which is a safe lower bound for most production models.
   */
  contextWindowTokens?: number;
  /**
   * Override for tests; defaults to crypto.randomUUID.
   */
  idGen?: () => string;
}

const DEFAULT_CONTEXT_WINDOW = 16_000;
const COMPRESSION_TARGET_TOKENS = 1_000;
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
    toolCallsJson: null,
    attachmentsJson: null,
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
  const summaries = await deps.repository.listConversationSummaries(request.chatSessionId);
  // Summaries return newest-first; the "latest" for bundling is index 0.
  const latestSummary = summaries[0] ?? null;
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
      latestSummary: latestSummary
        ? {
            id: latestSummary.id,
            content: latestSummary.content,
            tokensIn: latestSummary.tokensIn,
            tokensOut: latestSummary.tokensOut,
          }
        : null,
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

  // 3. Compression pre-flight. If the bundle is near the context
  //    window, run a compression pass before the LLM call so the
  //    next prompt fits comfortably.
  let compressionRan = false;
  if (shouldCompress(bundle.estimatedTokens, deps.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW)) {
    const plan = planCompression(liveTail, latestSummary?.id ?? null, COMPRESSION_TARGET_TOKENS);
    if (plan) {
      await runCompression(request.chatSessionId, plan, {
        repo: deps.repository,
        llmClient: deps.llmClient,
        modelId: deps.compressionModelId ?? deps.llmModelId,
        idGen,
      });
      compressionRan = true;
    }
  }

  // 4. Route the chat request. Mock mode returns canned responses;
  //    live mode hits GroundX search + grounded LLM call for RAG,
  //    falls back to mock for structured/hybrid (those branches need
  //    app-state queries that aren't wired yet).
  const startedAt = Date.now();
  const routerRequest: ChatRouterRequest = {
    newUserMessage: request.newUserMessage,
    currentEntityKey: bundleInput.currentEntity.entityKey,
    conversationTail: {
      messageCount: liveTail.length,
      lastTurnContent: liveTail.length >= 2 ? liveTail[liveTail.length - 2].content : null,
    },
    recentViewerEvents: recentViewerEvents.map((v) => ({ action: v.action, entityKey: v.entityKey })),
    intent: request.intent ?? null,
  };

  let reply: ChatRouterResponse;
  let errorCode: string | null = null;
  try {
    reply = await routeChat(routerRequest, {
      llmClient: deps.llmClient,
      groundxClient: deps.groundxClient,
      groundxApiKey: deps.groundxApiKey ?? undefined,
      searchBucketId: deps.searchBucketId,
      llmModelId: deps.llmModelId,
      mockMode: deps.mockMode,
    });
  } catch (err) {
    // Record the failure as an assistant message so the conversation
    // history stays consistent. The client receives a 502.
    errorCode = err instanceof Error ? err.message.slice(0, 200) : "unknown_error";
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
    toolCallsJson: reply.tools.length ? JSON.stringify(reply.tools) : null,
    attachmentsJson: null,
    compressedIntoSummaryId: null,
    llmProvider: deps.mockMode ? "mock" : "live",
    llmModelId: deps.llmModelId,
    latencyMs,
    promptTokens: null,
    completionTokens: null,
    errorCode: null,
    createdAt: new Date(),
  });

  return {
    userMessageId,
    assistantMessageId,
    reply,
    compressionRan,
  };
}

/**
 * Typed handler error so the route layer can map exit codes back to
 * HTTP status codes without catching every Error.
 */
export class ChatHandlerError extends Error {
  constructor(message: string, public readonly statusCode: number) {
    super(message);
    this.name = "ChatHandlerError";
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
