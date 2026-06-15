/**
 * WF-05 — fetch extract-field source geometry from the middleware.
 *
 * `document_getextract` returns field VALUES only (no geometry), so the F3/F4
 * field-click source highlight is resolved by matching each field value
 * against the document X-Ray server-side (`POST /api/documents/:id/
 * field-geometry`).
 *
 * multi-region-citations P1.3b: the endpoint returns, per field, the field's
 * REGIONS (`{page,bbox}[]` — every chunk the value appears in). This client
 * returns the FULL region set per field so the Extract value grid lights every
 * occurrence (the PdfViewer's render-time merge collapses adjacent boxes).
 * Best-effort: any failure returns all-empty so the extract UI never breaks on a
 * geometry miss.
 */
import { csrfFetch } from "@/api/csrfFetch";
import type { NormalizedBbox } from "@groundx/shared";

/** A resolved source region for a field (multi-region wire element). */
export interface FieldRegion {
  page: number;
  bbox: NormalizedBbox;
}

export interface FieldGeometryQuery {
  value: string | number | boolean | null;
  label: string;
}

/** Coerce one field's wire `regions[]` into typed `FieldRegion[]`, dropping malformed entries. */
function parseFieldRegions(raw: unknown): FieldRegion[] {
  if (!Array.isArray(raw)) return [];
  const out: FieldRegion[] = [];
  for (const r of raw) {
    const reg = r as Partial<FieldRegion>;
    if (typeof reg?.page === "number" && reg.bbox) out.push({ page: reg.page, bbox: reg.bbox });
  }
  return out;
}

export async function fetchFieldGeometry(
  documentId: string,
  fields: FieldGeometryQuery[],
): Promise<Array<FieldRegion[]>> {
  if (!fields.length) return [];
  try {
    const res = await csrfFetch(`/api/documents/${encodeURIComponent(documentId)}/field-geometry`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) return fields.map(() => []);
    const json = (await res.json()) as { geometry?: unknown[] };
    return Array.isArray(json.geometry)
      ? fields.map((_, i) => parseFieldRegions(json.geometry![i]))
      : fields.map(() => []);
  } catch {
    return fields.map(() => []);
  }
}
