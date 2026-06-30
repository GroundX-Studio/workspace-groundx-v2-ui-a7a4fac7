/**
 * WF-03 — per-document X-Ray fetch + in-memory cache.
 *
 * The X-Ray is the geometry fallback for search results that lack
 * `boundingBoxes` (and the primary geometry source for WF-05 extract fields).
 * It is large (~200KB+) and immutable after ingest, so we fetch once per
 * documentId and cache with a short TTL. Best-effort: any failure returns null
 * so the caller degrades gracefully (citation ships geometry-less).
 */

import type { GroundXClient } from "../types.js";
import type { XrayDoc } from "./citationGeometry.js";

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  value: XrayDoc | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test seam — clears the module cache between tests. */
export function __clearXrayCache(): void {
  cache.clear();
}

/**
 * Fetch a document's X-Ray (cached per documentId, short TTL). Returns null on
 * any error or non-OK response — never throws.
 */
export async function fetchDocumentXray(
  client: GroundXClient,
  apiKey: string,
  documentId: string,
  now: () => number = Date.now,
): Promise<XrayDoc | null> {
  if (!documentId) return null;
  const hit = cache.get(documentId);
  if (hit && hit.expiresAt > now()) return hit.value;

  let value: XrayDoc | null = null;
  try {
    const res = await client.forward(`/ingest/document/xray/${encodeURIComponent(documentId)}`, {
      method: "GET",
      apiKey,
    });
    if (res.ok) {
      value = (await res.json()) as XrayDoc;
    }
  } catch {
    value = null;
  }
  cache.set(documentId, { value, expiresAt: now() + TTL_MS });
  return value;
}
