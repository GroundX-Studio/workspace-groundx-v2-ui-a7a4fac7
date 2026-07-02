import { describe, expect, it } from "vitest";

import { ChatApiError, chatErrorToUserCopy, isOrphanedAnonSessionError } from "./chatErrors";

describe("isOrphanedAnonSessionError", () => {
  it("is true for a 403 not_session_owner ChatApiError", () => {
    const err = new ChatApiError("/api/chat-sessions failed: 403", 403, { error: "not_session_owner" });
    expect(isOrphanedAnonSessionError(err)).toBe(true);
  });

  it("is false for a 403 with a different error code", () => {
    const err = new ChatApiError("forbidden", 403, { error: "some_other_reason" });
    expect(isOrphanedAnonSessionError(err)).toBe(false);
  });

  it("is false for a non-403 status even with the not_session_owner code", () => {
    const err = new ChatApiError("conflict", 409, { error: "not_session_owner" });
    expect(isOrphanedAnonSessionError(err)).toBe(false);
  });

  it("is false for a plain Error / non-ChatApiError", () => {
    expect(isOrphanedAnonSessionError(new Error("boom"))).toBe(false);
    expect(isOrphanedAnonSessionError(null)).toBe(false);
    expect(isOrphanedAnonSessionError({ status: 403 })).toBe(false);
  });
});

describe("chatErrorToUserCopy — 403 not_session_owner", () => {
  it("maps an unrecovered orphaned-session 403 to a distinct, non-generic, refresh-to-recover copy", () => {
    const err = new ChatApiError("/api/chat-sessions failed: 403", 403, { error: "not_session_owner" });
    const mapping = chatErrorToUserCopy(err);
    expect(mapping.kind).toBe("orphaned-session");
    expect(mapping.retryable).toBe(false);
    // Must NOT fall through to the generic "Something went wrong" default.
    expect(mapping.message).not.toBe("Something went wrong — please try again in a moment.");
    expect(mapping.message.toLowerCase()).toContain("refresh");
  });
});
