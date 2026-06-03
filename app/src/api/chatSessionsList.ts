/**
 * RT-05 — read the signed-in user's chat sessions for steady-mode
 * hydration. Without this the SessionSwitcher reads sessions only
 * from ChatStore (which hydrates from localStorage), so a user
 * signing in on a fresh browser sees zero sessions even though
 * the DB carries them.
 *
 * Auth: signed-in users only. Anonymous visitors are scoped to a
 * single cookie session and have no cross-device list — calling
 * this as anon returns 401, which the caller resolves to an empty
 * array (treating "no signed-in user" as "no remote list to merge").
 *
 * Mirrors `listChatMessages` (RT-01) for shape: returns the parsed
 * array on 200, an empty array on 401 (no signed-in user), throws
 * ChatApiError on other non-2xx.
 */

import { ChatApiError } from "@/api/chatErrors";
import { csrfFetch } from "@/api/csrfFetch";

/**
 * Narrowed projection of `ChatSessionRecord`. We don't expose
 * server-only fields (ownerUserId, ownerAnonId, archivedAt) to UI
 * consumers — the SessionSwitcher only needs id + title + flags
 * + timestamps.
 */
export interface PersistedChatSessionSummary {
  id: string;
  onboardingSessionId: string;
  title: string;
  isOnboarding: boolean;
  activeEntityKey: string | null;
  currentIntent: Record<string, unknown> | null;
  /** ISO timestamps (Date serialized through JSON.stringify). */
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

interface ListChatSessionsResponse {
  sessions: PersistedChatSessionSummary[];
}

export async function listChatSessions(): Promise<PersistedChatSessionSummary[]> {
  const res = await csrfFetch("/api/chat-sessions", {
    method: "GET",
    credentials: "include",
  });
  // Anon visitor / no cookie → no remote list to merge. Caller
  // treats this as "render localStorage only" rather than an error.
  if (res.status === 401) return [];
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    throw new ChatApiError(`/api/chat-sessions failed: ${res.status}`, res.status, detail);
  }
  const payload = (await res.json()) as ListChatSessionsResponse;
  return payload.sessions ?? [];
}
