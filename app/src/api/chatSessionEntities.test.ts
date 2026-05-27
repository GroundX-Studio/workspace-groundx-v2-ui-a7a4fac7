import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(() => false),
}));
import { captureException } from "@/lib/sentry";

import { upsertChatSessionEntity } from "./chatSessionEntities";
import { __markChatSessionEnsured, __resetEnsuredChatSessions } from "./chatSessions";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  vi.mocked(captureException).mockReset();
  __resetEnsuredChatSessions();
  // Pre-mark test session ids as ensured so the helper's self-trigger
  // ensure POST is a no-op; per-test fetch counts reflect only the
  // helper's PUT.
  __markChatSessionEnsured("chat-1");
  __markChatSessionEnsured("c-abc/def");
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("upsertChatSessionEntity (RT-03 client)", () => {
  it("PUTs to /api/chat-sessions/:id/entities/:entityKey with credentials + JSON body", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await upsertChatSessionEntity({
      chatSessionId: "chat-1",
      entityKey: "sample:utility",
      lastFrame: "f3",
      completedFramesJson: JSON.stringify(["f1", "f2"]),
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [path, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe("/api/chat-sessions/chat-1/entities/sample%3Autility");
    expect((init as RequestInit).method).toBe("PUT");
    expect((init as RequestInit).credentials).toBe("include");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      lastFrame: "f3",
      completedFramesJson: JSON.stringify(["f1", "f2"]),
      scanProgressJson: null,
      extractedValuesJson: null,
    });
  });

  it("URL-encodes session id + entity key so colons + slashes survive routing", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    await upsertChatSessionEntity({
      chatSessionId: "c-abc/def",
      entityKey: "sample:loan",
      lastFrame: "f2",
      completedFramesJson: "[]",
    });
    const [path] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    // / encoded → %2F, : encoded → %3A — both reach the route as
    // literal path segments instead of being split.
    expect(path).toBe("/api/chat-sessions/c-abc%2Fdef/entities/sample%3Aloan");
  });

  it("captures to Sentry on non-OK response (best-effort, never throws)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "internal" }),
    });
    await expect(
      upsertChatSessionEntity({
        chatSessionId: "chat-1",
        entityKey: "sample:utility",
        lastFrame: "f3",
        completedFramesJson: "[]",
      }),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, extras] = vi.mocked(captureException).mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(extras).toMatchObject({
      route: "/api/chat-sessions/:id/entities/:entityKey",
      status: 500,
      entityKey: "sample:utility",
    });
  });

  it("captures to Sentry on fetch throw (network error, never throws)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(
      upsertChatSessionEntity({
        chatSessionId: "chat-1",
        entityKey: "sample:utility",
        lastFrame: "f3",
        completedFramesJson: "[]",
      }),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, extras] = vi.mocked(captureException).mock.calls[0];
    expect(extras).toMatchObject({
      route: "/api/chat-sessions/:id/entities/:entityKey",
      entityKey: "sample:utility",
    });
  });
});
