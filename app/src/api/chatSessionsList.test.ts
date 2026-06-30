import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatApiError } from "./chatSessions";
import { listChatSessions } from "./chatSessionsList";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("listChatSessions (RT-05 client)", () => {
  it("GETs /api/chat-sessions and returns the array", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        sessions: [
          {
            id: "s1",
            onboardingSessionId: "s1",
            title: "First",
            isOnboarding: false,
            activeEntityKey: null,
            currentIntent: null,
            createdAt: "2026-05-27T00:00:00.000Z",
            updatedAt: "2026-05-27T00:00:00.000Z",
            archivedAt: null,
          },
        ],
      }),
    });

    const sessions = await listChatSessions();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [path, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe("/api/chat-sessions");
    expect((init as RequestInit).method).toBe("GET");
    expect((init as RequestInit).credentials).toBe("include");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: "s1", title: "First", isOnboarding: false });
  });

  it("resolves 401 to an empty array (anon visitor — no remote list to merge)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: "no_signed_in_user" }),
    });
    const sessions = await listChatSessions();
    expect(sessions).toEqual([]);
  });

  it("throws ChatApiError on other non-2xx (500 upstream)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal" }),
    });
    await expect(listChatSessions()).rejects.toMatchObject({ status: 500 });
  });

  it("returns [] when the server responds with a missing `sessions` field", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    });
    const sessions = await listChatSessions();
    expect(sessions).toEqual([]);
  });

  it("ChatApiError is the thrown class — caller can branch on status", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: "unavailable" }),
    });
    await expect(listChatSessions()).rejects.toBeInstanceOf(ChatApiError);
  });
});
