/**
 * UI-10b — POST a canvas-orchestrator dispatch to the BFF's
 * `intent_log` table. Fire-and-forget from the orchestrator (failure
 * gets captured to Sentry; never blocks the dispatch). The frontend
 * already does the in-memory triple-write via UI-10; this is the
 * durable-row half.
 *
 * Auth: the BFF requires a session cookie (any session — anon or
 * authed — that OWNS the chat_session_id). Anonymous sessions can
 * write to their own chat sessions' intent_log just fine.
 */

import type { Source } from "@groundx/shared";

import { csrfFetch } from "@/api/csrfFetch";
import type { CanvasIntent } from "@/contexts/CanvasOrchestratorContext/types";
import { captureException } from "@/lib/sentry";

export interface RecordIntentInput {
  chatSessionId: string;
  // 2026-05-31-chat-wire-types-shared — single-sourced off the shared `Source`.
  source: Source;
  /** The dispatched canvas intent (always a structured `CanvasIntent`). */
  intent: CanvasIntent;
}

export async function recordIntent(input: RecordIntentInput): Promise<void> {
  try {
    const res = await csrfFetch("/api/intent", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      // Don't bubble — this is best-effort telemetry. Log via Sentry
      // so we still notice elevated error rates in production.
      captureException(new Error(`recordIntent failed: ${res.status}`), {
        route: "/api/intent",
        status: res.status,
        intentKind: typeof input.intent.kind === "string" ? input.intent.kind : null,
      });
    }
  } catch (err) {
    captureException(err, {
      route: "/api/intent",
      intentKind: typeof input.intent.kind === "string" ? input.intent.kind : null,
    });
  }
}
