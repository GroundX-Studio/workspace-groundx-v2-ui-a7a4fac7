/**
 * RT-04 — PATCH the chat_sessions row to update `currentIntent`
 * and/or `activeEntityKey`. Without this, the row goes stale on
 * the first canvas navigation: POST /api/chat-sessions seeds it
 * once and no other endpoint touches it. chatHandler reads
 * `getChatSession.currentIntent` on every chat turn for the
 * bundled LLM context, so the LLM only ever saw the creation-time
 * value (typically null).
 *
 * Fire-and-forget mirror of `recordViewerEvent` /
 * `upsertChatSessionEntity` — failures route to Sentry and never
 * block the optimistic UI update. The ChatStore mutators
 * (`setCurrentIntent`, entity activation) call this after the
 * in-memory mutation commits.
 *
 * Merge semantics on the server: omitted body fields are
 * preserved. Send `currentIntent: null` to explicitly clear it.
 */

import { ensureServerChatSession } from "@/api/chatSessions";
import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";

export interface PatchChatSessionInput {
  chatSessionId: string;
  /**
   * Set the canvas-orchestrator's current intent. Pass `null` to
   * clear (canvas closed / steady mode home). Omit the property
   * to leave the existing value unchanged.
   */
  currentIntent?: Record<string, unknown> | null;
  /**
   * Set the chat session's active entity key. Pass `null` to clear
   * (F1 picker, no active entity). Omit to leave unchanged.
   */
  activeEntityKey?: string | null;
  /**
   * `master-viewer-session` Phase 1 — paired viewer-state slots.
   * Each is omitted by default; pass an array or object to write,
   * `null` to explicitly clear. The server stores each as JSON on
   * the chat_sessions row with the same merge semantics as
   * `currentIntent`.
   */
  viewerHistory?: unknown[] | null;
  viewerOverlays?: unknown[] | null;
  viewerWorkspace?: Record<string, unknown> | null;
}

export async function patchChatSession(input: PatchChatSessionInput): Promise<void> {
  const body: Record<string, unknown> = {};
  if (Object.prototype.hasOwnProperty.call(input, "currentIntent")) {
    body.currentIntent = input.currentIntent ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "activeEntityKey")) {
    body.activeEntityKey = input.activeEntityKey ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "viewerHistory")) {
    body.viewerHistory = input.viewerHistory ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "viewerOverlays")) {
    body.viewerOverlays = input.viewerOverlays ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(input, "viewerWorkspace")) {
    body.viewerWorkspace = input.viewerWorkspace ?? null;
  }
  // No-op when the caller didn't ask to change anything — saves a
  // round trip and a server 400.
  if (Object.keys(body).length === 0) return;

  // Self-trigger ensure-create + wait. See viewerEvents.ts for the
  // race rationale; same pattern here.
  await ensureServerChatSession({
    id: input.chatSessionId,
    onboardingSessionId: input.chatSessionId,
    title: "Onboarding",
    isOnboarding: true,
  });

  const path = `/api/chat-sessions/${encodeURIComponent(input.chatSessionId)}`;
  try {
    const res = await csrfFetch(path, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      captureException(new Error(`patchChatSession failed: ${res.status}`), {
        route: "/api/chat-sessions/:id",
        status: res.status,
        fields: Object.keys(body).join(","),
      });
    }
  } catch (err) {
    captureException(err, {
      route: "/api/chat-sessions/:id",
      fields: Object.keys(body).join(","),
    });
  }
}
