import type { SessionContext } from "./session.js";

/**
 * 2026-05-31-core-data-followups §4 #19 — the SINGLE canonical error code a
 * session route returns when the caller does not own the chat session.
 *
 * Before this, six routes returned `not_session_owner` and one (the
 * messages-hydrate GET) had drifted to `chat_session_forbidden`. Reconciled
 * onto the majority/tested code so every ownership failure is one shape.
 */
export const SESSION_NOT_OWNER_ERROR = "not_session_owner" as const;

/**
 * The ownership-relevant slice of a `chat_sessions` row — the two owner keys.
 * Kept structural (not the full `ChatSessionRecord`) so the helper is callable
 * with any object carrying the two keys (rows, projections, test fixtures).
 */
export interface ChatSessionOwnerRef {
  ownerUserId: string | null;
  ownerAnonId: string | null;
}

/**
 * True iff the session owns the chat-session row. Ownership keys off the
 * session's auth state (the dominant guard semantics, used by six of the seven
 * call-sites — the seventh, the messages-hydrate route, is reconciled onto it):
 *
 *   - authed (`groundxUsername` set) → `ownerUserId === groundxUsername`
 *   - anonymous                      → `ownerAnonId === session.id` (cookie id)
 *
 * The two arms are mutually exclusive by auth state — an authed caller is never
 * matched against the anon key and vice-versa — so a stale anon owner can't
 * grant access to an authed session (and the empty-string anon `groundxUsername`
 * never collides with a real `ownerUserId`).
 */
export function assertChatSessionOwnership(
  row: ChatSessionOwnerRef,
  session: SessionContext,
): boolean {
  return session.groundxUsername
    ? row.ownerUserId === session.groundxUsername
    : row.ownerAnonId === session.id;
}
