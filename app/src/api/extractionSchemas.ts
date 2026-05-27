/**
 * UI-01 Phase 2d — client for the saved-extraction-schema endpoint.
 * Posts a named snapshot of the merged extraction schema (manifest +
 * pending overlay) so the user can pin "Utility (with tax)" or
 * "Loan (DTI variant)" without re-walking the chat flow.
 *
 * Auth model: gated server-side on `requireAuthenticatedUser`. Anon
 * sessions get a 401 which the caller turns into a "sign in to save"
 * surface (the SchemaView footer holds the affordance).
 */

import { csrfFetch } from "@/api/csrfFetch";
import { captureException } from "@/lib/sentry";

export interface SaveExtractionSchemaInput {
  /** Stable client-minted id (e.g. `es-<uuid>`). Re-using upserts. */
  id: string;
  /** User-facing template name. */
  name: string;
  /**
   * The merged schema shape — manifest categories + overlay
   * additions, with removed-field ids dropped. Shape mirrors
   * `ExtractionSchemaDef` on the frontend; the server stores it as
   * JSON without inspecting fields.
   */
  schema: Record<string, unknown>;
}

export interface SaveExtractionSchemaResult {
  id: string;
  name: string;
  /** ISO 8601 timestamp of the row's last write. */
  updatedAt: string;
}

export class ExtractionSchemaApiError extends Error {
  status: number;
  detail: unknown;
  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "ExtractionSchemaApiError";
    this.status = status;
    this.detail = detail;
  }
}

export async function saveExtractionSchema(
  input: SaveExtractionSchemaInput,
): Promise<SaveExtractionSchemaResult> {
  let res: Response;
  try {
    res = await csrfFetch("/api/extraction-schemas", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (err) {
    captureException(err, { route: "/api/extraction-schemas" });
    throw err;
  }
  if (!res.ok) {
    let detail: unknown = null;
    try {
      detail = await res.json();
    } catch {
      // ignore
    }
    const error = new ExtractionSchemaApiError(
      `POST /api/extraction-schemas failed: ${res.status}`,
      res.status,
      detail,
    );
    // Don't ship 400/401 to Sentry — those are programmer + auth-state
    // errors that the UI surfaces locally. 5xx is the failure we want
    // to know about.
    if (res.status >= 500) {
      captureException(error, { route: "/api/extraction-schemas", status: res.status });
    }
    throw error;
  }
  return (await res.json()) as SaveExtractionSchemaResult;
}
