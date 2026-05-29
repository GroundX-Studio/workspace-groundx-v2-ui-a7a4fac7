/**
 * WF-15 — app placeholder document ids use a `kind:value` shape (e.g.
 * `scenario:utility`) that the canvas mounts with before the active
 * entity resolves the real GroundX documentId. GroundX document ids are
 * colon-free UUIDs, so a *resolved* id is one that is non-empty and
 * carries no `:` separator.
 *
 * The document viewer gates its X-Ray fetch on this: a placeholder id
 * must never hit `GET /ingest/document/xray/scenario%3Autility`, which
 * 406s and paints "COULD NOT LOAD DOCUMENT" before the real id arrives.
 */
export function isResolvedDocumentId(id: string | null | undefined): id is string {
  return typeof id === "string" && id.length > 0 && !id.includes(":");
}
