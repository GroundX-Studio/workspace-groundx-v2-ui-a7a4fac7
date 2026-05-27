import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(() => false),
}));
import { captureException } from "@/lib/sentry";

import { patchChatSession } from "./chatSessionPatch";
import { __markChatSessionEnsured, __resetEnsuredChatSessions } from "./chatSessions";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  vi.mocked(captureException).mockReset();
  __resetEnsuredChatSessions();
  // Pre-mark every test session id as ensured so the helper's
  // self-trigger ensure POST is a no-op. Per-test fetch counts then
  // reflect only the helper's PATCH.
  __markChatSessionEnsured("chat-1");
  __markChatSessionEnsured("chat-2");
  __markChatSessionEnsured("chat-3");
  __markChatSessionEnsured("chat-4");
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("patchChatSession (RT-04 client)", () => {
  it("PATCHes /api/chat-sessions/:id with credentials + JSON body", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await patchChatSession({
      chatSessionId: "chat-1",
      currentIntent: { kind: "extract", documentId: "d-1" },
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [path, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe("/api/chat-sessions/chat-1");
    expect((init as RequestInit).method).toBe("PATCH");
    expect((init as RequestInit).credentials).toBe("include");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ currentIntent: { kind: "extract", documentId: "d-1" } });
  });

  it("only sends fields the caller specified (omits absent keys)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await patchChatSession({ chatSessionId: "chat-2", activeEntityKey: "sample:utility" });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ activeEntityKey: "sample:utility" });
    expect("currentIntent" in body).toBe(false);
  });

  it("supports clearing — currentIntent: null and activeEntityKey: null go through", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await patchChatSession({
      chatSessionId: "chat-3",
      currentIntent: null,
      activeEntityKey: null,
    });
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ currentIntent: null, activeEntityKey: null });
  });

  it("no-op when no fields specified (skips the round trip)", async () => {
    await patchChatSession({ chatSessionId: "chat-4" });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("captures to Sentry on non-OK response (best-effort, never throws)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal" }),
    });
    await expect(
      patchChatSession({ chatSessionId: "chat-1", currentIntent: { kind: "extract" } }),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, extras] = vi.mocked(captureException).mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(extras).toMatchObject({
      route: "/api/chat-sessions/:id",
      status: 500,
      fields: "currentIntent",
    });
  });

  it("captures to Sentry on fetch throw (network error, never throws)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(
      patchChatSession({ chatSessionId: "chat-1", currentIntent: { kind: "extract" } }),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, extras] = vi.mocked(captureException).mock.calls[0];
    expect(extras).toMatchObject({ route: "/api/chat-sessions/:id", fields: "currentIntent" });
  });
});
