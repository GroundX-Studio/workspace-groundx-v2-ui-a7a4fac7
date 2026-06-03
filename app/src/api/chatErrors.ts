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
