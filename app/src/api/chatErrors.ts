import { ApiError } from "@groundx/shared";

export class ChatApiError extends ApiError {
  constructor(message: string, status: number, detail: unknown) {
    super(message, status, detail);
    this.name = "ChatApiError";
  }
}

/**
 * CF-08 — per-status error -> user-facing UX mapping. The chat surface
 * (F2, F5, future steady-mode chat) consumes this in catch sites to
 * render the right copy without leaking raw status codes or stack
 * traces.
 */
export type ChatErrorKind =
  | "reauth"
  | "not-yet"
  | "timeout"
  | "upstream"
  | "bug"
  | "not-found"
  | "orphaned-session"
  | "network"
  | "superseded"
  | "unknown";

/**
 * True iff `err` is the middleware's `403 { error: "not_session_owner" }` —
 * the caller's current anon cookie identity does not own the chat-session row
 * it just referenced. This happens when the localStorage-cached chat session
 * id outlives the `gx_app_session` cookie identity that created it (cookie /
 * session-row 30-day expiry, SESSION_SECRET rotation on a namespace teardown,
 * or cookie loss while localStorage persists). The local id is ORPHANED, not
 * the cookie — recovery is to abandon it and start a fresh session owned by
 * the current identity. NOT a security failure to paper over: the server guard
 * (an IDOR fix) stays exactly as-is; this predicate only lets the CLIENT
 * self-heal its own stale cache.
 */
export function isOrphanedAnonSessionError(err: unknown): boolean {
  return (
    err instanceof ChatApiError &&
    err.status === 403 &&
    typeof err.detail === "object" &&
    err.detail !== null &&
    (err.detail as { error?: unknown }).error === "not_session_owner"
  );
}

export interface ChatErrorMapping {
  kind: ChatErrorKind;
  message: string;
  retryable: boolean;
}

export function chatErrorToUserCopy(err: unknown): ChatErrorMapping {
  if (err instanceof ChatApiError) {
    const status = err.status;
    // A turn the user REPLACED with a newer message (supersede) — not a failure.
    // Streaming surfaces it as an `error` frame ("chat stream error: superseded");
    // the JSON branch as a 409. Soft, non-alarming, not retryable (it was replaced).
    if (status === 409 || err.message.includes("superseded")) {
      return {
        kind: "superseded",
        message: "This reply was replaced by a newer message.",
        retryable: false,
      };
    }
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
        message: "I can't answer that yet \u2014 that mode isn't available yet in this deployment.",
        retryable: false,
      };
    }
    if (status === 504) {
      return {
        kind: "timeout",
        message: "That took too long \u2014 want to try again?",
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
        message: "This chat session is no longer on the server \u2014 please refresh to start a new one.",
        retryable: false,
      };
    }
    // 403 not_session_owner \u2014 the local chat-session id is orphaned relative to
    // the current anon cookie identity. The send path self-heals this (recovers
    // to a fresh session + retries once); this copy only surfaces if recovery
    // ALSO failed, so it steers the user to a full refresh rather than the
    // scary generic "Something went wrong" fall-through.
    if (isOrphanedAnonSessionError(err)) {
      return {
        kind: "orphaned-session",
        message: "Your session has expired \u2014 please refresh to start a new one.",
        retryable: false,
      };
    }
    if (status >= 500) {
      return {
        kind: "upstream",
        message: "Something went wrong on our side \u2014 try again in a moment.",
        retryable: true,
      };
    }
  }
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
        message: "Couldn't reach the chat service \u2014 check your connection and try again.",
        retryable: true,
      };
    }
  }
  return {
    kind: "unknown",
    message: "Something went wrong \u2014 please try again in a moment.",
    retryable: false,
  };
}
