/**
 * RT-02 — POST a viewer event to the BFF's `viewer_events` table.
 * Mirrors the `recordIntent` (UI-10b) shape: fire-and-forget from
 * the ChatStore mutator; failures route to Sentry and never block
 * the in-memory append. The frontend's optimistic viewerHistory
 * is the source of truth for the visible session; the durable row
 * is what informs the next chat turn's bundled context.
 *
 * Auth: the BFF requires a session cookie (any session — anon or
 * authed — that OWNS the chat_session_id). Anonymous sessions can
 * write to their own chat sessions just fine.
 *
 * The route was added in RT-02 specifically to close the
 * "write-only-via-tests" gap audited in 2026-05-27. Before RT-02
 * chatHandler's `listViewerEvents` always returned [].
 */

import { ensureServerChatSession } from "@/api/chatSessions";
import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";

export interface RecordViewerEventInput {
  chatSessionId: string;
  timestamp: number;
  entityKey: string | null;
  action:
    | "opened"
    | "frame-advanced"
    | "extracted-value-viewed"
    | "citation-clicked"
    | "scan-completed"
    | "intent-dispatched"
    | "left";
  source: "user" | "agent" | "tour" | "system";
  detail?: Record<string, unknown>;
}

export async function recordViewerEvent(input: RecordViewerEventInput): Promise<void> {
  // Self-trigger ensure-create + wait. ChatStoreProvider's mount
  // effect also fires ensureServerChatSession (with the correct
  // title + isOnboarding flag), but action handlers can fire this
  // helper BEFORE the useEffect runs — at which point only the
  // helpers' ensure call exists to kick off the POST. Both paths
  // converge through the same cached promise so we never double-POST.
  await ensureServerChatSession({
    id: input.chatSessionId,
    onboardingSessionId: input.chatSessionId,
    title: "Onboarding",
    isOnboarding: true,
  });
  try {
    const res = await csrfFetch("/api/viewer-events", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      captureException(new Error(`recordViewerEvent failed: ${res.status}`), {
        route: "/api/viewer-events",
        status: res.status,
        action: input.action,
      });
    }
  } catch (err) {
    captureException(err, {
      route: "/api/viewer-events",
      action: input.action,
    });
  }
}
