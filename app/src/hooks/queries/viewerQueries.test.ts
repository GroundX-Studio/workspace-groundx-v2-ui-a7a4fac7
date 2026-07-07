import { describe, it, expect } from "vitest";

import { unwrap, unwrapParseSensitive } from "./viewerQueries";
import { shouldRetry } from "@/api/queryClient";
import type { SdkActionResult } from "@/contexts/sdkContextTypes";

const ok = <T>(response: T): SdkActionResult<T> => ({ isSuccess: true, response });
const fail = (error: unknown): SdkActionResult<never> => ({ isSuccess: false, response: null, error: error as object });

describe("unwrap", () => {
  it("returns the response on success", async () => {
    await expect(unwrap(Promise.resolve(ok({ a: 1 })))).resolves.toEqual({ a: 1 });
  });
  it("throws the failure error (so the cache retry predicate can see it)", async () => {
    await expect(unwrap(Promise.resolve(fail({ status: 404 })))).rejects.toEqual({ status: 404 });
  });
});

describe("unwrapParseSensitive", () => {
  it("tags the thrown error non-retryable so a consistent parse error fails fast", async () => {
    let thrown: unknown;
    try {
      await unwrapParseSensitive(Promise.resolve(fail(new Error("bad X-Ray payload"))));
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Error);
    // the whole point: the retry predicate must NOT retry it
    expect(shouldRetry(0, thrown)).toBe(false);
  });
});
