import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { claimAnonymousChat } from "./claimAnonymousChat";

describe("claimAnonymousChat", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn();
    // SC-01: pre-set csrf cookie so csrfFetch skips bootstrap GET.
    if (typeof document !== "undefined") {
      document.cookie = "csrf_token=test-csrf-token; path=/";
    }
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("POSTs (with empty body) to /api/chat-sessions/claim and returns the parsed re-key count", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ rekeyedSessions: 3 }),
    });
    const result = await claimAnonymousChat();
    // csrfFetch wraps headers in a Headers instance — assert on shape
    // without pinning the headers type.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [path, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe("/api/chat-sessions/claim");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).credentials).toBe("include");
    expect((init as RequestInit).body).toBe("{}");
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(result).toEqual({ rekeyedSessions: 3 });
  });

  it("returns rekeyedSessions: 0 when the server reports no anon rows", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ rekeyedSessions: 0 }),
    });
    const result = await claimAnonymousChat();
    expect(result.rekeyedSessions).toBe(0);
  });

  it("throws with status + detail when the BFF returns non-2xx", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "Sign-in required", code: "ANONYMOUS_SESSION" }),
    });
    try {
      await claimAnonymousChat();
      throw new Error("should have thrown");
    } catch (error) {
      const e = error as Error & { status?: number; detail?: { code?: string } };
      expect(e.status).toBe(401);
      expect(e.detail?.code).toBe("ANONYMOUS_SESSION");
    }
  });
});
