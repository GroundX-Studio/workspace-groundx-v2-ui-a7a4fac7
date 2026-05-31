/**
 * WF-05 — fetch extract-field source geometry from the middleware.
 *
 * `document_getextract` returns field VALUES only (no geometry), so the F3/F4
 * field-click source highlight is resolved by matching each field value
 * against the document X-Ray server-side (`POST /api/documents/:id/
 * field-geometry`). Returns a parallel array (null where no chunk matched →
 * the field highlight degrades to none). Best-effort: any failure returns all
 * nulls so the extract UI never breaks on a geometry miss.
 */
import { csrfFetch } from "@/api/csrfFetch";
import type { NormalizedBbox } from "@groundx/shared";

export interface ResolvedFieldGeometry {
  page: number;
  bbox: NormalizedBbox | null;
}

export interface FieldGeometryQuery {
  value: string | number | boolean | null;
  label: string;
}

export async function fetchFieldGeometry(
  documentId: string,
  fields: FieldGeometryQuery[],
): Promise<Array<ResolvedFieldGeometry | null>> {
  if (!fields.length) return [];
  try {
    const res = await csrfFetch(`/api/documents/${encodeURIComponent(documentId)}/field-geometry`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) return fields.map(() => null);
    const json = (await res.json()) as { geometry?: Array<ResolvedFieldGeometry | null> };
    return Array.isArray(json.geometry) ? json.geometry : fields.map(() => null);
  } catch {
    return fields.map(() => null);
  }
}
