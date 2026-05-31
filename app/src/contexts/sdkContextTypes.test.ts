import { describe, expect, it } from "vitest";

import { SdkActionResult, sdkSuccess, sdkFailure } from "@/contexts/sdkContextTypes";

// These are compile-time guarantees first, runtime second. The whole point of
// §3 is to make the success/error LIMBO unrepresentable: a value that claims
// `isSuccess: false` but carries neither a real error nor a response must be
// rejected by the type-checker, and narrowing on `isSuccess` must expose
// exactly `response` (success) or a non-null `error` (failure).

describe("SdkActionResult discriminated union", () => {
  it("a success value exposes its response after narrowing", () => {
    const ok: SdkActionResult<number> = sdkSuccess(42);
    if (ok.isSuccess) {
      // narrowing: response is `number`, never null on the success branch
      const value: number = ok.response;
      expect(value).toBe(42);
    } else {
      throw new Error("expected success branch");
    }
  });

  it("a failure value exposes a non-null error after narrowing", () => {
    const boom = new Error("kaput");
    const failed: SdkActionResult<number> = sdkFailure(boom);
    expect(failed.isSuccess).toBe(false);
    if (!failed.isSuccess) {
      // narrowing: error is present and non-null on the failure branch
      expect(failed.error).toBe(boom);
      // the failure branch keeps `response: null` (the existing context tests
      // assert `toMatchObject({ isSuccess: false, response: null })`).
      expect(failed.response).toBeNull();
    } else {
      throw new Error("expected failure branch");
    }
  });

  it("makes the { isSuccess:false; response:null; error:null } limbo unrepresentable", () => {
    // The directive below is load-bearing: if the limbo ever became assignable
    // again, tsc would flag it as an UNUSED suppression and the build would fail.
    // @ts-expect-error - error:null is illegal on the failure branch (it requires a non-null error).
    const limbo: SdkActionResult<number> = { isSuccess: false, response: null, error: null };
    expect(limbo.isSuccess).toBe(false);
  });

  it("makes a success value with response:null unrepresentable", () => {
    // @ts-expect-error - the success branch requires a real response: T, never null.
    const bad: SdkActionResult<number> = { isSuccess: true, response: null };
    expect(bad.isSuccess).toBe(true);
  });
});
