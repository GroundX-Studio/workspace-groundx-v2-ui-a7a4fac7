import { describe, it, expect } from "vitest";

import { shouldRetry, markNonRetryable, makeQueryClient } from "./queryClient";
import { queryKeys, geometryQueriesHash } from "./queryKeys";

describe("shouldRetry — retry predicate (not a blanket count)", () => {
  it("retries transient network/5xx up to 2 times, then stops", () => {
    const netErr = new Error("network blip");
    expect(shouldRetry(0, netErr)).toBe(true);
    expect(shouldRetry(1, netErr)).toBe(true);
    expect(shouldRetry(2, netErr)).toBe(false); // exhausted (3 attempts)
    expect(shouldRetry(0, { status: 503 })).toBe(true);
  });

  it("never retries a 4xx client error", () => {
    expect(shouldRetry(0, { status: 404 })).toBe(false);
    expect(shouldRetry(0, { status: 400 })).toBe(false);
    expect(shouldRetry(0, { response: { status: 403 } })).toBe(false);
  });

  it("never retries a parse/validation error (tagged non-retryable) — a consistent error, fail fast", () => {
    const parseErr = markNonRetryable(new Error("malformed X-Ray payload"));
    expect(shouldRetry(0, parseErr)).toBe(false);
  });
});

describe("query cache config", () => {
  it("builds a client with a positive staleTime so a remount reads cache, not refetch", () => {
    const qc = makeQueryClient();
    const opts = qc.getDefaultOptions().queries;
    expect(opts?.staleTime).toBeGreaterThan(0);
    expect(opts?.refetchOnWindowFocus).toBe(false);
  });
});

describe("query keys", () => {
  it("are hierarchical + collision-free across the viewer reads", () => {
    const keys = [
      queryKeys.document("d1"),
      queryKeys.xray("d1"),
      queryKeys.extract("d1"),
      queryKeys.workflow("w1"),
    ].map((k) => JSON.stringify(k));
    expect(new Set(keys).size).toBe(keys.length); // all distinct
    expect(queryKeys.document("d1")[0]).toBe("groundx"); // shared root for bulk invalidation
  });

  it("geometry hash is stable across order and deterministic", () => {
    const a = geometryQueriesHash([
      { field: "line_amount", value: "55.0" },
      { field: "meter_id", value: "A12345" },
    ]);
    const b = geometryQueriesHash([
      { field: "meter_id", value: "A12345" },
      { field: "line_amount", value: "55.0" },
    ]);
    expect(a).toBe(b); // order-independent → key doesn't thrash on re-render
    expect(a).not.toBe(geometryQueriesHash([{ field: "line_amount", value: "56.0" }]));
  });
});
