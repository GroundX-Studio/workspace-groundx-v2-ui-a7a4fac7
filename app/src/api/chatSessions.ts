/**
 * Chat-surface API client.
 *
 * Two endpoints behind one helper:
 *
 *   1. `POST /api/chat-sessions`  — idempotent server-side row creation
 *      for an in-memory ChatSession. Anonymous sessions get an
 *      `ownerAnonId` from the session cookie; signed-in sessions get
 *      `ownerUserId`. The frontend mints session ids client-side
 *      (localStorage is still the cache) but the server needs a parent
 *      row before `/api/chat/messages` can write to it.
 *
 *   2. `POST /api/chat/messages`  — the chat surface's single entry
 *      point. Validates → persists user message → builds 3-axis context
 *      bundle → optional compression → routes (mock OR live RAG) →
 *      persists assistant reply → returns the typed envelope.
 *
 * `sendChatMessage` wraps the two: on the first send for a given
 * chatSessionId, it runs the ensure-create step; subsequent sends
 * skip it. The `__resetEnsuredChatSessions` test hook flushes the
 * cache between test cases.
 */

interface CreateChatSessionInput {
  id: string;
  onboardingSessionId?: string;
  title: string;
  isOnboarding: boolean;
  activeEntityKey?: string | null;
}

export interface CreateChatSessionResult {
  chatSessionId: string;
  ownerUserId: string | null;
  ownerAnonId: string | null;
}

export interface ChatCitation {
  documentId: string;
  page: number;
  snippet?: string;
}

export interface ChatSuggestedAction {
  key: string;
  label: string;
  detail?: Record<string, unknown>;
}

export interface ChatReply {
  mode: "rag" | "structured" | "hybrid";
  answer: string;
  citations: ChatCitation[];
  suggestedActions: ChatSuggestedAction[];
  tools: { name: string; arguments: Record<string, unknown> }[];
}

export interface SendChatMessageResult {
  userMessageId: string;
  assistantMessageId: string;
  reply: ChatReply;
  compressionRan: boolean;
}

export interface SendChatMessageInput {
  chatSessionId: string;
  newUserMessage: string;
  intent?: string | null;
  /**
   * Session metadata used by the ensure-create step. Required because
   * the server needs a title + onboarding flag for new rows. Subsequent
   * sends for the same chatSessionId skip the ensure step entirely.
   */
  sessionMeta: {
    title: string;
    isOnboarding: boolean;
    onboardingSessionId: string;
    activeEntityKey?: string | null;
  };
}

class ChatApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
    this.detail = detail;
  }
}

const ensuredSessionIds = new Set<string>();

/** Test-only: forget which sessions have been ensured. */
export function __resetEnsuredChatSessions(): void {
  ensuredSessionIds.clear();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    throw new ChatApiError(`${path} failed: ${res.status}`, res.status, detail);
  }
  return (await res.json()) as T;
}

/**
 * Idempotently create a server-side ChatSession row. Returns the
 * persisted record's ownership fields so the client can verify it
 * picked up the expected anon/user mapping.
 */
export async function createChatSession(input: CreateChatSessionInput): Promise<CreateChatSessionResult> {
  return postJson<CreateChatSessionResult>("/api/chat-sessions", input);
}

/**
 * Send a user message through the chat surface. On the first call for
 * a given chatSessionId, ensures the server-side row exists; subsequent
 * calls go straight to /api/chat/messages. The ensure-create step is
 * idempotent server-side so a duplicate POST after a cache miss is
 * harmless.
 */
export async function sendChatMessage(input: SendChatMessageInput): Promise<SendChatMessageResult> {
  if (!ensuredSessionIds.has(input.chatSessionId)) {
    await createChatSession({
      id: input.chatSessionId,
      onboardingSessionId: input.sessionMeta.onboardingSessionId,
      title: input.sessionMeta.title,
      isOnboarding: input.sessionMeta.isOnboarding,
      activeEntityKey: input.sessionMeta.activeEntityKey ?? null,
    });
    ensuredSessionIds.add(input.chatSessionId);
  }

  return postJson<SendChatMessageResult>("/api/chat/messages", {
    chatSessionId: input.chatSessionId,
    newUserMessage: input.newUserMessage,
    intent: input.intent ?? null,
  });
}
