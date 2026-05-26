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

import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";

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

export class ChatApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "ChatApiError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * CF-08 — per-status error → user-facing UX mapping. The chat surface
 * (F2, F5, future steady-mode chat) consumes this in catch sites to
 * render the right copy without leaking raw status codes or stack
 * traces. Status branches:
 *
 *   401   → "sign in to continue" — re-auth flow surface (UI decides
 *           whether to open the gate or redirect to /auth/login).
 *   501   → "I can't answer that yet" — mode-not-wired surface
 *           (structured/hybrid in some deployments).
 *   504   → "took too long" — retryable, retry chip recommended.
 *   400   → "programming error" — developer-visible; the request
 *           should not have shipped.
 *   404   → "session row missing" — recommend refresh (the chatHandler
 *           cache invalidation already happens; this is the user copy).
 *   5xx   → "try again in a moment" — retryable.
 *   network (no status, e.g. fetch threw) → "couldn't reach the chat".
 *   anything else → generic.
 *
 * `retryable: true` is a hint, not an instruction — UIs decide whether
 * to show a retry chip, auto-retry, or just surface the message.
 */
export type ChatErrorKind =
  | "reauth"
  | "not-yet"
  | "timeout"
  | "upstream"
  | "bug"
  | "not-found"
  | "network"
  | "unknown";

export interface ChatErrorMapping {
  kind: ChatErrorKind;
  message: string;
  retryable: boolean;
}

export function chatErrorToUserCopy(err: unknown): ChatErrorMapping {
  if (err instanceof ChatApiError) {
    const status = err.status;
    if (status === 401) {
      return {
        kind: "reauth",
        message: "Please sign in to continue this conversation.",
        retryable: false,
      };
    }
    if (status === 501) {
      return {
        kind: "not-yet",
        message: "I can't answer that yet — that mode isn't available yet in this deployment.",
        retryable: false,
      };
    }
    if (status === 504) {
      return {
        kind: "timeout",
        message: "That took too long — want to try again?",
        retryable: true,
      };
    }
    if (status === 400) {
      return {
        kind: "bug",
        message: "Invalid request (programming error). Please report this if it keeps happening.",
        retryable: false,
      };
    }
    if (status === 404) {
      return {
        kind: "not-found",
        message: "This chat session is no longer on the server — please refresh to start a new one.",
        retryable: false,
      };
    }
    if (status >= 500) {
      return {
        kind: "upstream",
        message: "Something went wrong on our side — try again in a moment.",
        retryable: true,
      };
    }
  }
  // Network-layer throws (fetch rejected before getting a status) come
  // through as plain Errors. Distinguish from "really unknown" by
  // matching the common runtime messages.
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("failed to fetch") ||
      msg.includes("networkerror") ||
      msg.includes("network request failed") ||
      msg.includes("load failed")
    ) {
      return {
        kind: "network",
        message: "Couldn't reach the chat service — check your connection and try again.",
        retryable: true,
      };
    }
  }
  return {
    kind: "unknown",
    message: "Something went wrong — please try again in a moment.",
    retryable: false,
  };
}

const ensuredSessionIds = new Set<string>();

/** Test-only: forget which sessions have been ensured. */
export function __resetEnsuredChatSessions(): void {
  ensuredSessionIds.clear();
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await csrfFetch(path, {
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
 *
 * Cache-invalidation rules:
 *   - If `createChatSession` throws, we don't add to the cache, so the
 *     next call retries the create.
 *   - If `/api/chat/messages` returns 404 (server has no row for this
 *     chatSessionId — possible after retention sweep, DB wipe, or an
 *     ownership flip we missed), we DROP the id from the cache and
 *     re-throw, so the next call re-creates the row.
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

  try {
    return await postJson<SendChatMessageResult>("/api/chat/messages", {
      chatSessionId: input.chatSessionId,
      newUserMessage: input.newUserMessage,
      intent: input.intent ?? null,
    });
  } catch (err) {
    if (err instanceof ChatApiError && err.status === 404) {
      // Server no longer has this row — invalidate the cache so the
      // next send re-creates it.
      ensuredSessionIds.delete(input.chatSessionId);
    }
    // CF-13: ship every chat-send failure to Sentry. The wrapper is a
    // no-op when DSN is unset, so this is safe in dev/test. Extras
    // give the Sentry event enough context to triage without leaking
    // user content.
    captureException(err, {
      route: "/api/chat/messages",
      chatSessionId: input.chatSessionId,
      status: err instanceof ChatApiError ? err.status : null,
    });
    // CF-08: per-status user copy lives in `chatErrorToUserCopy`.
    // Catch sites (F2, F5, future steady chat) call that helper to
    // render the right copy without re-implementing the status branch.
    throw err;
  }
}
