/**
 * Client for the saved-Template endpoint (shared-template-lifecycle Phase 3).
 * Posts a named snapshot of a Template (an Extract schema today; a Report
 * template later) to the auth-gated `POST /api/templates`. The wire shape is
 * the shared `TemplateSaveInput` — `{id, kind, name, body}` with NO owner /
 * timestamps: the server assigns the owner from the session and stamps times
 * (🔒 ownership is never client-supplied).
 *
 * Auth model: gated server-side on `requireAuthenticatedUser`. Anon sessions
 * get a 401 which the caller turns into a "sign in to save" surface.
 *
 * (Was `extractionSchemas.ts` / `saveExtractionSchema` / `ExtractionSchemaApiError`
 * — renamed in the Phase-3 flag-day cutover.)
 */

import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";
import type { TemplateSaveInput } from "@groundx/shared";

export type { TemplateSaveInput };

export interface SaveTemplateResult {
  id: string;
  name: string;
  /** ISO 8601 timestamp of the row's last write. */
  updatedAt: string;
}

export class TemplateApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "TemplateApiError";
    this.status = status;
    this.detail = detail;
  }
}

export async function saveTemplate(input: TemplateSaveInput): Promise<SaveTemplateResult> {
  let res: Response;
  try {
    res = await csrfFetch("/api/templates", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    captureException(err, { route: "/api/templates" });
    throw err;
  }
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const error = new TemplateApiError(`POST /api/templates failed: ${res.status}`, res.status, detail);
    // Don't ship 400/401 to Sentry — those are programmer + auth-state errors
    // the UI surfaces locally. 5xx is the failure we want to know about.
    if (res.status >= 500) {
      captureException(error, { route: "/api/templates", status: res.status });
    }
    throw error;
  }
  return (await res.json()) as SaveTemplateResult;
}
