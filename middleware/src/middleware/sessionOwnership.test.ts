import { describe, expect, it } from "vitest";

import {
  assertChatSessionOwnership,
  SESSION_NOT_OWNER_ERROR,
} from "./sessionOwnership.js";
import type { SessionContext } from "./session.js";

/**
 * 2026-05-31-core-data-followups §4 #19 — one ownership helper + one error
 * code, replacing the 6 copy-pasted guards (+ the drifted `chat_session_forbidden`
 * twin) across the session routes.
 */
describe("assertChatSessionOwnership (§4 #19)", () => {
  const authed: SessionContext = { id: "cookie-1", groundxUsername: "gx-user" };
  const anon: SessionContext = { id: "cookie-2", groundxUsername: "" };

  it("an authed caller owns a row whose ownerUserId matches groundxUsername", () => {
    expect(
      assertChatSessionOwnership({ ownerUserId: "gx-user", ownerAnonId: null }, authed),
    ).toBe(true);
  });

  it("an authed caller does NOT own a row owned by a different user", () => {
    expect(
      assertChatSessionOwnership({ ownerUserId: "other-user", ownerAnonId: null }, authed),
    ).toBe(false);
  });

  it("an authed caller does NOT own an anon-only row (ownership keys off auth state)", () => {
    expect(
      assertChatSessionOwnership({ ownerUserId: null, ownerAnonId: "cookie-1" }, authed),
    ).toBe(false);
  });

  it("an anon caller owns a row whose ownerAnonId matches the cookie session id", () => {
    expect(
      assertChatSessionOwnership({ ownerUserId: null, ownerAnonId: "cookie-2" }, anon),
    ).toBe(true);
  });

  it("an anon caller does NOT own a row owned by a different cookie", () => {
    expect(
      assertChatSessionOwnership({ ownerUserId: null, ownerAnonId: "other-cookie" }, anon),
    ).toBe(false);
  });

  it("an anon caller does NOT own a user-owned row", () => {
    expect(
      assertChatSessionOwnership({ ownerUserId: "gx-user", ownerAnonId: null }, anon),
    ).toBe(false);
  });

  it("exposes the single canonical not-owner error code", () => {
    expect(SESSION_NOT_OWNER_ERROR).toBe("not_session_owner");
  });
});
