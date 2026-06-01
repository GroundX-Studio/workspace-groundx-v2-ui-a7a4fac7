import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroundXClient } from "../types.js";

import { logger } from "../lib/logger.js";
import { __clearXrayCache } from "./xrayCache.js";
import { searchGroundX } from "./groundxSearch.js";

/**
 * Regression guard for the "no chat content in logs" invariant
 * (lib/logger.ts: "Free-form fields (chat content, document text) MUST NOT
 * be logged anywhere").
 *
 * The user's free-form RAG/chat query can carry PII (names, SSNs, account
 * numbers). It MUST NOT appear in ANY emitted log payload — not even
 * redacted-in-prod, because pino's redact paths don't match
 * `groundxSearch.query`/`groundxSearchRetry.query` and any non-prod/debug
 * deploy would emit it in cleartext. The fix removes `query` from both
 * `logger.info` payloads entirely; this test fails if it is ever re-added.
 */
describe("searchGroundX logging (PII guard)", () => {
  function jsonOk(payload: unknown): Response {
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
    __clearXrayCache();
  });

  // A query that obviously contains PII so a leak is unambiguous.
  const SECRET_QUERY = "what is SSN 123-45-6789 for jane.doe@example.com";

  function captureLoggerInfo(): unknown[] {
    const payloads: unknown[] = [];
    vi.spyOn(logger, "info").mockImplementation(((obj: unknown) => {
      payloads.push(obj);
      return undefined as never;
    }) as typeof logger.info);
    return payloads;
  }

  function flatten(value: unknown): string {
    return JSON.stringify(value ?? null);
  }

  it("does NOT emit the free-form query in the search-dispatch log payload", async () => {
    const payloads = captureLoggerInfo();
    const client: GroundXClient = {
      forward: vi.fn(async () => jsonOk({ search: { results: [{ documentId: "d1", text: "t" }] } })),
    };

    await searchGroundX(SECRET_QUERY, { type: "bucket", bucketId: 42 }, client, "k");

    // The dispatch log must carry the non-sensitive telemetry (scope/path/n)
    // but never the free-form query.
    const dispatchLog = payloads.find((p) => flatten(p).includes("groundxSearch")) as Record<
      string,
      unknown
    >;
    expect(dispatchLog).toBeDefined();
    for (const p of payloads) {
      expect(flatten(p)).not.toContain(SECRET_QUERY);
      expect(flatten(p)).not.toContain("123-45-6789");
    }
  });

  it("does NOT emit the free-form query in the zero-result retry log payload", async () => {
    const payloads = captureLoggerInfo();
    // First search returns 0 results so the low-floor retry path fires.
    let call = 0;
    const client: GroundXClient = {
      forward: vi.fn(async () => {
        call += 1;
        // Both passes return empty so we exercise the retry log; no X-Ray.
        return jsonOk({ search: { results: [] } });
      }),
    };

    await searchGroundX(SECRET_QUERY, { type: "bucket", bucketId: 42 }, client, "k");

    expect(call).toBeGreaterThanOrEqual(2); // retry actually fired
    const retryLog = payloads.find((p) => flatten(p).includes("groundxSearchRetry"));
    expect(retryLog).toBeDefined();
    for (const p of payloads) {
      expect(flatten(p)).not.toContain(SECRET_QUERY);
      expect(flatten(p)).not.toContain("123-45-6789");
    }
  });

  // Sibling of the query leak: the result-summary log MUST NOT emit retrieved
  // GroundX document text (the `topSnippets[].textPreview` field). Document
  // text is free-form content that can carry PII (the same invariant in
  // lib/logger.ts forbids it). The fix removes the snippet/doc-text field from
  // the result-summary payload entirely, keeping only non-sensitive telemetry
  // (count/score/filenames). This test fails if it is ever re-added.
  it("does NOT emit retrieved document text in the result-summary log payload", async () => {
    const payloads = captureLoggerInfo();
    // A PII-shaped document snippet returned by GroundX search.
    const SECRET_DOC_TEXT =
      "Account holder John Q. Public, SSN 987-65-4321, balance overdue $4,200.";
    const client: GroundXClient = {
      forward: vi.fn(async () =>
        jsonOk({
          search: {
            results: [{ documentId: "d1", fileName: "statement.pdf", text: SECRET_DOC_TEXT }],
          },
        }),
      ),
    };

    await searchGroundX("show me the overdue accounts", { type: "bucket", bucketId: 42 }, client, "k");

    // The result-summary log must carry the non-sensitive telemetry
    // (count/score/filenames) but never the retrieved document text.
    const resultLog = payloads.find((p) => flatten(p).includes("groundxSearchResult"));
    expect(resultLog).toBeDefined();
    for (const p of payloads) {
      expect(flatten(p)).not.toContain(SECRET_DOC_TEXT);
      expect(flatten(p)).not.toContain("987-65-4321");
      // The snippet/doc-text carriers must be gone from the summary entirely.
      expect(flatten(p)).not.toContain("textPreview");
      expect(flatten(p)).not.toContain("topSnippets");
    }
  });
});
