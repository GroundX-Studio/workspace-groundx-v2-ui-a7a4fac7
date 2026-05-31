/**
 * WF-05b — per-document `-118-map.json` fetch + in-memory cache.
 *
 * The `-118-map.json` carries WORD-level atom boxes (the finest geometry tier);
 * a verified verbatim citation span resolves against it to a box strictly
 * tighter than the X-Ray chunk box (see `resolveWordGeometry` in
 * `citationGeometry.ts`). This service is the live caller that resolver was
 * waiting on.
 *
 * How the URL is obtained (settled by the §0 investigation, 2026-05-31):
 *  - `document_get` (`GET /ingest/document/{id}`) returns the document's
 *    `xrayUrl`, an absolute storage URL of the form
 *    `…/layout/processed/{processId}/{documentId}-xray.json`. The processId is
 *    NOT surfaced as a usable standalone field — `document.processId` points at
 *    a render that 403s for the map — but the `xrayUrl` path's processId DOES
 *    serve the map. So we derive the map URL by swapping `-xray.json` →
 *    `-118-map.json` on the `xrayUrl` itself (no processId parsing, no origin
 *    config).
 *  - The `-118-map.json` is served from the same storage origin
 *    (`upload.eyelevel.ai`) as a PLAIN, UNAUTHED HTTPS GET — confirmed 200
 *    server-side with no API key. So the storage fetch carries no credential;
 *    only the `document_get` call (a GroundX API call) needs the apiKey.
 *
 * Mirrors `xrayCache.ts`: fetch once per documentId, short TTL, best-effort
 * (any error / non-OK / malformed JSON → `null`, never throws), `__clear*`
 * test seam. The storage GET is injectable via `fetchImpl` for tests.
 */

import type { GroundXClient } from "../types.js";
import type { WordMap } from "./citationGeometry.js";

const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  value: WordMap | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

/** Test seam — clears the module cache between tests. */
export function __clearWordMapCache(): void {
  cache.clear();
}

type FetchImpl = (url: string) => Promise<Response>;

interface Options {
  /** Storage-origin fetch seam (default: global fetch). The `-118-map.json` is unauthed. */
  fetchImpl?: FetchImpl;
  now?: () => number;
}

/** Pull a string `xrayUrl` off a document_get payload (nested or top-level). */
function readXrayUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const top = payload as Record<string, unknown>;
  const doc = (top.document && typeof top.document === "object" ? top.document : top) as Record<
    string,
    unknown
  >;
  const url = doc.xrayUrl;
  return typeof url === "string" ? url : null;
}

/** Derive the `-118-map.json` URL from an `xrayUrl`. Returns null when it isn't the expected shape. */
function mapUrlFromXrayUrl(xrayUrl: string): string | null {
  if (!xrayUrl.includes("-xray.json")) return null;
  let parsed: URL;
  try {
    parsed = new URL(xrayUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return xrayUrl.replace("-xray.json", "-118-map.json");
}

/**
 * Fetch a document's `-118-map.json` word-map (cached per documentId, short
 * TTL). Returns null on any error, non-OK response, missing/odd `xrayUrl`, or
 * malformed JSON — never throws.
 */
export async function fetchDocumentWordMap(
  client: GroundXClient,
  apiKey: string,
  documentId: string,
  options: Options = {},
): Promise<WordMap | null> {
  if (!documentId) return null;
  const now = options.now ?? Date.now;
  const fetchImpl: FetchImpl = options.fetchImpl ?? ((url) => fetch(url));

  const hit = cache.get(documentId);
  if (hit && hit.expiresAt > now()) return hit.value;

  let value: WordMap | null = null;
  try {
    const docRes = await client.forward(`/ingest/document/${encodeURIComponent(documentId)}`, {
      method: "GET",
      apiKey,
    });
    if (docRes.ok) {
      const xrayUrl = readXrayUrl(await docRes.json());
      const mapUrl = xrayUrl ? mapUrlFromXrayUrl(xrayUrl) : null;
      if (mapUrl) {
        const mapRes = await fetchImpl(mapUrl);
        if (mapRes.ok) {
          value = (await mapRes.json()) as WordMap;
        }
      }
    }
  } catch {
    value = null;
  }
  cache.set(documentId, { value, expiresAt: now() + TTL_MS });
  return value;
}
