import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GroundXClient } from "../types.js";
import { __clearXrayCache, fetchDocumentXray } from "./xrayCache.js";

function jsonClient(payload: unknown, ok = true): { client: GroundXClient; forward: ReturnType<typeof vi.fn> } {
  const forward = vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? 200 : 500,
      headers: { "content-type": "application/json" },
    }),
  );
  return { client: { forward }, forward };
}

describe("fetchDocumentXray (WF-03 cache)", () => {
  beforeEach(() => __clearXrayCache());

  it("fetches once per documentId and serves the second call from cache", async () => {
    const { client, forward } = jsonClient({ chunks: [], documentPages: [] });
    const a = await fetchDocumentXray(client, "k", "doc-1");
    const b = await fetchDocumentXray(client, "k", "doc-1");
    expect(a).toEqual({ chunks: [], documentPages: [] });
    expect(b).toBe(a); // same cached object
    expect(forward).toHaveBeenCalledTimes(1);
  });

  it("calls the X-Ray endpoint with the documentId", async () => {
    const { client, forward } = jsonClient({ chunks: [] });
    await fetchDocumentXray(client, "k", "abc-123");
    expect(forward).toHaveBeenCalledWith(
      "/ingest/document/xray/abc-123",
      expect.objectContaining({ method: "GET", apiKey: "k" }),
    );
  });

  it("returns null (and caches null) on a non-OK response — never throws", async () => {
    const { client, forward } = jsonClient({}, false);
    const v = await fetchDocumentXray(client, "k", "bad");
    expect(v).toBeNull();
    await fetchDocumentXray(client, "k", "bad");
    expect(forward).toHaveBeenCalledTimes(1); // null is cached too
  });

  it("returns null when the client throws", async () => {
    const client: GroundXClient = { forward: vi.fn(async () => { throw new Error("boom"); }) };
    expect(await fetchDocumentXray(client, "k", "x")).toBeNull();
  });

  it("re-fetches after the TTL expires", async () => {
    const { client, forward } = jsonClient({ chunks: [] });
    let t = 1_000;
    const now = () => t;
    await fetchDocumentXray(client, "k", "doc-ttl", now);
    t += 6 * 60 * 1000; // past the 5-min TTL
    await fetchDocumentXray(client, "k", "doc-ttl", now);
    expect(forward).toHaveBeenCalledTimes(2);
  });
});
