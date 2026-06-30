/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { csrfFetch } from "./csrfFetch";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  // jsdom: blow away document.cookie between tests.
  document.cookie = "csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("csrfFetch (SC-01 client)", () => {
  it("safe methods (GET) skip the CSRF header injection entirely", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("{}", { status: 200 }),
    );
    await csrfFetch("/api/foo", { method: "GET" });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.has("X-CSRF-Token")).toBe(false);
  });

  it("POST with cookie present → injects the cookie value as X-CSRF-Token", async () => {
    document.cookie = "csrf_token=abc123def; path=/";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response("{}", { status: 200 }),
    );
    await csrfFetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("X-CSRF-Token")).toBe("abc123def");
    expect((init as RequestInit).credentials).toBe("include");
  });

  it("POST without cookie → bootstraps via GET /api/csrf/token first", async () => {
    // First call: GET /api/csrf/token → returns token + sets cookie.
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockImplementationOnce(async () => {
        document.cookie = "csrf_token=bootstrap-token; path=/";
        return new Response(JSON.stringify({ token: "bootstrap-token" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      })
      // Second call: the actual POST.
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));

    await csrfFetch("/api/chat/messages", { method: "POST", body: "{}" });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const firstPath = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(firstPath).toBe("/api/csrf/token");
    const [, postInit] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    const headers = new Headers((postInit as RequestInit).headers);
    expect(headers.get("X-CSRF-Token")).toBe("bootstrap-token");
  });

  it("PUT and DELETE are also treated as state-changing (header injected)", async () => {
    document.cookie = "csrf_token=tok; path=/";
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(new Response("{}"))
      .mockResolvedValueOnce(new Response("{}"));
    await csrfFetch("/api/x", { method: "PUT" });
    await csrfFetch("/api/x", { method: "DELETE" });
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    for (const [, init] of calls) {
      const headers = new Headers((init as RequestInit).headers);
      expect(headers.get("X-CSRF-Token")).toBe("tok");
    }
  });

  it("preserves the caller's headers (Content-Type etc.) when adding X-CSRF-Token", async () => {
    document.cookie = "csrf_token=tok; path=/";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("{}"));
    await csrfFetch("/api/x", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Custom": "yes" },
    });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = new Headers((init as RequestInit).headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Custom")).toBe("yes");
    expect(headers.get("X-CSRF-Token")).toBe("tok");
  });

  it("preserves an explicit credentials option set by the caller", async () => {
    document.cookie = "csrf_token=tok; path=/";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(new Response("{}"));
    await csrfFetch("/api/x", { method: "POST", credentials: "same-origin" });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect((init as RequestInit).credentials).toBe("same-origin");
  });
});
