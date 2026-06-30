import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GroundXClient } from "../types.js";
import { __clearWordMapCache, fetchDocumentWordMap } from "./wordMapCache.js";

const XRAY_URL =
  "https://upload.eyelevel.ai/layout/processed/7e811d87-e718-45a6-8251-7e19dd70c1a9/doc-1-xray.json";
const EXPECTED_MAP_URL =
  "https://upload.eyelevel.ai/layout/processed/7e811d87-e718-45a6-8251-7e19dd70c1a9/doc-1-118-map.json";

const WORD_MAP = { pages: [{ pageNumber: 1, width: 1700, height: 2200, molecules: [] }] };

/** A GroundXClient whose `forward` returns a document_get payload with an xrayUrl. */
function docClient(
  payload: unknown,
  ok = true,
): { client: GroundXClient; forward: ReturnType<typeof vi.fn> } {
  const forward = vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? 200 : 500,
      headers: { "content-type": "application/json" },
    }),
  );
  return { client: { forward }, forward };
}

/** A storage-origin fetch seam returning the word-map JSON. */
function mapFetch(payload: unknown, ok = true): ReturnType<typeof vi.fn> {
  return vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? 200 : 404,
      headers: { "content-type": "application/json" },
    }),
  );
}

describe("fetchDocumentWordMap (-118-map live fetch + cache)", () => {
  beforeEach(() => __clearWordMapCache());

  it("calls document_get for the documentId, derives the -118-map URL from xrayUrl, and returns the parsed map", async () => {
    const { client, forward } = docClient({ document: { xrayUrl: XRAY_URL } });
    const fetchImpl = mapFetch(WORD_MAP);
    const map = await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl });
    expect(map).toEqual(WORD_MAP);
    // document_get hit with the documentId + apiKey
    expect(forward).toHaveBeenCalledWith(
      "/ingest/document/doc-1",
      expect.objectContaining({ method: "GET", apiKey: "k" }),
    );
    // the storage GET swaps -xray.json -> -118-map.json (no API key on the storage fetch)
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toBe(EXPECTED_MAP_URL);
  });

  it("accepts a top-level xrayUrl (not nested under `document`)", async () => {
    const { client } = docClient({ xrayUrl: XRAY_URL });
    const fetchImpl = mapFetch(WORD_MAP);
    const map = await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl });
    expect(map).toEqual(WORD_MAP);
  });

  it("caches per documentId and serves the second call from cache", async () => {
    const { client, forward } = docClient({ document: { xrayUrl: XRAY_URL } });
    const fetchImpl = mapFetch(WORD_MAP);
    const a = await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl });
    const b = await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl });
    expect(b).toBe(a);
    expect(forward).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("returns null when document_get is non-OK — never throws", async () => {
    const { client } = docClient({}, false);
    const fetchImpl = mapFetch(WORD_MAP);
    expect(await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when the document has no usable xrayUrl", async () => {
    const { client } = docClient({ document: { xrayUrl: "not-a-url" } });
    const fetchImpl = mapFetch(WORD_MAP);
    expect(await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null when the storage fetch is non-OK", async () => {
    const { client } = docClient({ document: { xrayUrl: XRAY_URL } });
    const fetchImpl = mapFetch(WORD_MAP, false);
    expect(await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl })).toBeNull();
  });

  it("returns null on malformed JSON from the storage fetch — never throws", async () => {
    const { client } = docClient({ document: { xrayUrl: XRAY_URL } });
    const fetchImpl = vi.fn(async () =>
      new Response("<<<not json>>>", { status: 200, headers: { "content-type": "application/json" } }),
    );
    expect(await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl })).toBeNull();
  });

  it("returns null when the client throws", async () => {
    const client: GroundXClient = { forward: vi.fn(async () => { throw new Error("boom"); }) };
    const fetchImpl = mapFetch(WORD_MAP);
    expect(await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl })).toBeNull();
  });

  it("returns null when the storage fetch throws", async () => {
    const { client } = docClient({ document: { xrayUrl: XRAY_URL } });
    const fetchImpl = vi.fn(async () => { throw new Error("network"); });
    expect(await fetchDocumentWordMap(client, "k", "doc-1", { fetchImpl })).toBeNull();
  });

  it("returns null for an empty documentId without any fetch", async () => {
    const { client, forward } = docClient({ document: { xrayUrl: XRAY_URL } });
    const fetchImpl = mapFetch(WORD_MAP);
    expect(await fetchDocumentWordMap(client, "k", "", { fetchImpl })).toBeNull();
    expect(forward).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("re-fetches after the TTL expires", async () => {
    const { client, forward } = docClient({ document: { xrayUrl: XRAY_URL } });
    const fetchImpl = mapFetch(WORD_MAP);
    let t = 1_000;
    const now = () => t;
    await fetchDocumentWordMap(client, "k", "doc-ttl", { fetchImpl, now });
    t += 6 * 60 * 1000; // past the 5-min TTL
    await fetchDocumentWordMap(client, "k", "doc-ttl", { fetchImpl, now });
    expect(forward).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
