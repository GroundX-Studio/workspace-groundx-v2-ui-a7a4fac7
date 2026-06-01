import { describe, expect, it } from "vitest";

import type { LoginReqCallback } from "./AuthContext";

/**
 * 2026-05-31-session-auth-subshapes Task 1 — `LoginReqCallback` is a
 * discriminated union (`kind` discriminant), not a flat three-boolean record.
 * The illegal boolean combinations (`{isLoggedIn:true; error:true}`, the
 * all-false silent no-op, etc.) are unrepresentable.
 *
 * The `@ts-expect-error` asserts are load-bearing under `npm run build` (tsc):
 * if the union is reverted to the flat record, the old shape becomes assignable
 * and the `@ts-expect-error` lines fail to error → build RED.
 */

// success narrows on kind, no error field
const _success: LoginReqCallback = { kind: "success" };
// error variant exposes `error`
const _error: LoginReqCallback = { kind: "error", error: new Error("boom") };
// banned variant
const _banned: LoginReqCallback = { kind: "banned" };
// failed (no-response) variant
const _failed: LoginReqCallback = { kind: "failed" };

// The OLD flat record is NOT assignable to the new union.
// @ts-expect-error — old flat three-boolean record is no longer a LoginReqCallback
const _oldFlat: LoginReqCallback = { isLoggedIn: true, error: true, banned: false };
// @ts-expect-error — the all-false silent no-op is unrepresentable
const _oldNoop: LoginReqCallback = { isLoggedIn: false, error: false, banned: false };
// @ts-expect-error — `error` cannot ride the success variant
const _errorOnSuccess: LoginReqCallback = { kind: "success", error: new Error("x") };

function narrow(result: LoginReqCallback): string {
  switch (result.kind) {
    case "success":
      return "ok";
    case "error":
      // `error` is only readable after narrowing to the error arm.
      return String(result.error);
    case "banned":
      return "banned";
    case "failed":
      return "failed";
  }
}

describe("LoginReqCallback — discriminated union", () => {
  it("narrows on kind", () => {
    expect(narrow(_success)).toBe("ok");
    expect(narrow(_error)).toContain("boom");
    expect(narrow(_banned)).toBe("banned");
    expect(narrow(_failed)).toBe("failed");
  });

  it("keeps the type-level reject asserts referenced", () => {
    expect([_oldFlat, _oldNoop, _errorOnSuccess]).toHaveLength(3);
  });
});
