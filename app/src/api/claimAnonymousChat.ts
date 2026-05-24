/**
 * Login-claim: serialize the localStorage chat-session state into the
 * payload shape the middleware expects and POST it to
 * /api/chat-sessions/claim. The middleware writes it to MySQL under
 * the signed-in user's owner_user_id and the storage primary flips
 * from localStorage to DB.
 *
 * Trigger: any time the auth state flips from anonymous to signed-in.
 * The caller (auth provider / signup completion handler) is responsible
 * for invoking this; we keep it as a pure utility so it can be unit-
 * tested without dragging in the React context graph.
 */

import type { ChatStoreState } from "@/contexts/ChatStoreContext/types";

/** What the middleware expects in POST /api/chat-sessions/claim. */
export interface ClaimAnonymousChatRequest {
  chatSessions: SerializedChatSession[];
  chatMessages: SerializedChatMessage[];
  conversationSummaries: SerializedConversationSummary[];
  chatSessionEntities: SerializedChatSessionEntity[];
  viewerEvents: SerializedViewerEvent[];
}

interface SerializedChatSession {
  id: string;
  onboardingSessionId: string;
  ownerUserId: null;
  ownerAnonId: string;
  title: string;
  isOnboarding: boolean;
  activeEntityKey: string | null;
  currentIntent: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: null;
}

interface SerializedChatMessage {
  id: string;
  chatSessionId: string;
  turnIndex: number;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  citationsJson: string | null;
  toolCallsJson: string | null;
  attachmentsJson: string | null;
  compressedIntoSummaryId: string | null;
  llmProvider: string | null;
  llmModelId: string | null;
  latencyMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  errorCode: string | null;
  createdAt: string;
}

interface SerializedConversationSummary {
  id: string;
  chatSessionId: string;
  fromMessageId: string;
  toMessageId: string;
  generation: number;
  absorbedSummaryIdsJson: string;
  content: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
}

interface SerializedChatSessionEntity {
  chatSessionId: string;
  entityKey: string;
  lastFrame: string | null;
  completedFramesJson: string;
  scanProgressJson: string | null;
  extractedValuesJson: string | null;
  createdAt: string;
  lastVisitedAt: string;
}

interface SerializedViewerEvent {
  id: string;
  chatSessionId: string;
  timestamp: number;
  entityKey: string | null;
  action: string;
  source: string;
  detailJson: string | null;
}

/**
 * Serialize a ChatStoreState snapshot + the inferred onboarding-session id
 * + the anonymous user id into the wire shape.
 */
export function serializeChatPayload(
  state: ChatStoreState,
  context: { anonymousUserId: string; onboardingSessionId: string },
): ClaimAnonymousChatRequest {
  const chatSessions: SerializedChatSession[] = [];
  const chatMessages: SerializedChatMessage[] = [];
  const chatSessionEntities: SerializedChatSessionEntity[] = [];
  const viewerEvents: SerializedViewerEvent[] = [];

  for (const session of state.sessions.values()) {
    chatSessions.push({
      id: session.id,
      onboardingSessionId: context.onboardingSessionId,
      ownerUserId: null,
      ownerAnonId: context.anonymousUserId,
      title: session.title,
      isOnboarding: session.isOnboardingSession,
      activeEntityKey: session.activeEntityKey,
      currentIntent: session.currentIntent ? (session.currentIntent as unknown as Record<string, unknown>) : null,
      createdAt: new Date(session.createdAt).toISOString(),
      updatedAt: new Date(session.updatedAt).toISOString(),
      archivedAt: null,
    });

    session.messages.forEach((m, i) => {
      chatMessages.push({
        id: m.id,
        chatSessionId: session.id,
        turnIndex: i + 1,
        role: m.role as SerializedChatMessage["role"],
        content: m.content,
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
        createdAt: new Date(m.createdAt).toISOString(),
      });
    });

    for (const [entityKey, entity] of session.entities) {
      chatSessionEntities.push({
        chatSessionId: session.id,
        entityKey,
        lastFrame: entity.lastFrame ?? null,
        completedFramesJson: JSON.stringify([...(entity.completedFrames ?? [])]),
        scanProgressJson: null,
        extractedValuesJson: null,
        createdAt: new Date(entity.createdAt ?? Date.now()).toISOString(),
        lastVisitedAt: new Date(entity.lastVisitedAt ?? Date.now()).toISOString(),
      });
    }

    for (const event of session.viewerHistory) {
      viewerEvents.push({
        id: event.id,
        chatSessionId: session.id,
        timestamp: event.timestamp,
        entityKey: event.entityKey ?? null,
        action: event.action,
        source: event.source,
        detailJson: event.detail ? JSON.stringify(event.detail) : null,
      });
    }
  }

  // Conversation summaries aren't yet produced client-side (Phase I).
  // Empty array keeps the schema present for forward-compat.
  return {
    chatSessions,
    chatMessages,
    conversationSummaries: [],
    chatSessionEntities,
    viewerEvents,
  };
}

export interface ClaimResult {
  claimedSessions: number;
  claimedMessages: number;
  claimedSummaries: number;
  claimedEntities: number;
  claimedViewerEvents: number;
}

/** POST the serialized payload to the BFF. Throws on non-2xx. */
export async function claimAnonymousChat(payload: ClaimAnonymousChatRequest): Promise<ClaimResult> {
  const res = await fetch("/api/chat-sessions/claim", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const err = new Error(`claim failed: ${res.status}`);
    (err as Error & { detail?: unknown; status?: number }).detail = detail;
    (err as Error & { detail?: unknown; status?: number }).status = res.status;
    throw err;
  }
  return (await res.json()) as ClaimResult;
}
