/**
 * UI-01 Phase 2c — client for `POST /api/extract-field`.
 *
 * Fired by the chat propose-card on Accept so the new schema field
 * shows a real value rather than a manifest placeholder. Mirror of the
 * other RT-* fire-and-forget helpers; self-triggers
 * `ensureServerChatSession` so the endpoint doesn't 404 when the chat
 * session row hasn't been created yet.
 */

import { ApiError } from "@groundx/shared";

import { ensureServerChatSession } from "@/api/chatSessions";
import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";

export type ExtractFieldType = "STRING" | "NUMBER" | "DATE" | "BOOLEAN";

export interface ExtractFieldInput {
  chatSessionId: string;
  field: {
    name: string;
    type: ExtractFieldType;
    description: string;
  };
}

export interface ExtractFieldResult {
  value: string | number | boolean | null;
  confidence: number;
  citation?: { documentId: string; page: number; snippet?: string } | null;
}

export class ExtractFieldApiError extends ApiError {
  constructor(message: string, status: number, detail: unknown) {
    super(message, status, detail);
    this.name = "ExtractFieldApiError";
  }
}

export async function extractField(input: ExtractFieldInput): Promise<ExtractFieldResult> {
  // Self-trigger ensure + wait — same pattern as the other helpers.
  await ensureServerChatSession({
    id: input.chatSessionId,
    onboardingSessionId: input.chatSessionId,
    title: "Onboarding",
    isOnboarding: true,
  });

  let res: Response;
  try {
    res = await csrfFetch("/api/extract-field", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    captureException(err, { route: "/api/extract-field" });
    throw err;
  }
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const error = new ExtractFieldApiError(
      `POST /api/extract-field failed: ${res.status}`,
      res.status,
      detail,
    );
    if (res.status >= 500) {
      captureException(error, { route: "/api/extract-field", status: res.status });
    }
    throw error;
  }
  const body = (await res.json()) as ExtractFieldResult;
  return {
    value: body.value ?? null,
    confidence: typeof body.confidence === "number" ? body.confidence : 0,
    citation: body.citation ?? null,
  };
}
