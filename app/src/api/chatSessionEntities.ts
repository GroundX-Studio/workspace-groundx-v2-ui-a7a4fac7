/**
 * RT-03 — PUT a chat-session-entity row to the BFF.
 *
 * Mirrors the `recordViewerEvent` / `recordIntent` fire-and-forget
 * pattern: ChatStore's upsert/update entity mutators call this
 * after the in-memory mutation; failures route to Sentry and
 * never block the optimistic UI update. The frontend's
 * EntitySessionStore state is the source of truth for the visible
 * session; the durable row is what informs the next chat turn's
 * bundled context.
 *
 * Merge semantics on the server: only the fields the client knows
 * about (lastStep + reachedStages + the JSON blobs) get overlaid;
 * server-only scope refs (bucketId / projectIds / groupId /
 * documentIds) survive a client PUT. That's why this helper's input
 * type is narrow — those fields aren't ours to set.
 *
 * Added in RT-03 to close the "write-only-via-tests" gap audited
 * 2026-05-27. Before RT-03 chatHandler.ts:249 + structuredHandler
 * read `listChatSessionEntities` every turn — and always got [].
 */

import { ensureServerChatSession, type ChatSessionEnsureClient } from "@/api/chatSessions";
import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";

export interface UpsertChatSessionEntityInput {
  chatSessionId: string;
  entityKey: string;
  /**
   * JSON-stringified `PersistedViewerStep` — the resume anchor (the active
   * viewer step, navigational payload only) (standardized-viewer-control
   * D13/R5).
   */
  lastStepJson: string;
  /** JSON-stringified array of reached `JourneyStage` values (checkmarks). */
  reachedStagesJson: string;
  /** JSON-stringified scan progress payload, or null when none. */
  scanProgressJson?: string | null;
  /** JSON-stringified extracted values, or null when none. */
  extractedValuesJson?: string | null;
}

type ChatSessionEnsureDependency = Pick<ChatSessionEnsureClient, "ensureServerChatSession">;

export async function upsertChatSessionEntity(
  input: UpsertChatSessionEntityInput,
  chatSessionEnsure: ChatSessionEnsureDependency = { ensureServerChatSession },
): Promise<void> {
  // Self-trigger ensure-create + wait. See viewerEvents.ts for the
  // race rationale; same pattern here.
  await chatSessionEnsure.ensureServerChatSession({
    id: input.chatSessionId,
    onboardingSessionId: input.chatSessionId,
    title: "Onboarding",
    isOnboarding: true,
  });
  const path = `/api/chat-sessions/${encodeURIComponent(input.chatSessionId)}/entities/${encodeURIComponent(input.entityKey)}`;
  try {
    const res = await csrfFetch(path, {
      method: "PUT",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lastStepJson: input.lastStepJson,
        reachedStagesJson: input.reachedStagesJson,
        scanProgressJson: input.scanProgressJson ?? null,
        extractedValuesJson: input.extractedValuesJson ?? null,
      }),
    });
    if (!res.ok) {
      captureException(new Error(`upsertChatSessionEntity failed: ${res.status}`), {
        route: "/api/chat-sessions/:id/entities/:entityKey",
        status: res.status,
        entityKey: input.entityKey,
      });
    }
  } catch (err) {
    captureException(err, {
      route: "/api/chat-sessions/:id/entities/:entityKey",
      entityKey: input.entityKey,
    });
  }
}
