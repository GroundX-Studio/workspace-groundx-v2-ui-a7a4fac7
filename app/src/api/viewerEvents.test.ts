import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(() => false),
}));
import { captureException } from "@/lib/sentry";

import { __markChatSessionEnsured, __resetEnsuredChatSessions } from "./chatSessions";
import { recordViewerEvent } from "./viewerEvents";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  vi.mocked(captureException).mockReset();
  __resetEnsuredChatSessions();
  // Pre-mark the test session id as ensured so the helper's
  // self-trigger ensure POST is a no-op. Per-test fetch counts then
  // reflect only the helper's own POST.
  __markChatSessionEnsured("chat-1");
  __markChatSessionEnsured("chat-2");
  __markChatSessionEnsured("chat-3");
  __markChatSessionEnsured("chat-r");
  __markChatSessionEnsured("chat-missing");
  __markChatSessionEnsured("chat-other");
  __markChatSessionEnsured("chat-noauth");
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("recordViewerEvent (RT-02 client)", () => {
  it("POSTs to /api/viewer-events with credentials + JSON body", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 201,
    });
    await recordViewerEvent({
      chatSessionId: "chat-1",
      timestamp: 1779840000000,
      entityKey: "sample:utility",
      action: "citation-clicked",
      source: "user",
      detail: { citationId: "c-1", page: 2 },
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [path, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe("/api/viewer-events");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).credentials).toBe("include");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      chatSessionId: "chat-1",
      timestamp: 1779840000000,
      entityKey: "sample:utility",
      action: "citation-clicked",
      source: "user",
      detail: { citationId: "c-1", page: 2 },
    });
  });

  it("captures to Sentry on non-OK response (best-effort, never throws)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    await expect(
      recordViewerEvent({
        chatSessionId: "chat-1",
        timestamp: 0,
        entityKey: null,
        action: "frame-advanced",
        source: "agent",
      }),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, extras] = vi.mocked(captureException).mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(extras).toMatchObject({
      route: "/api/viewer-events",
      status: 500,
      action: "frame-advanced",
    });
  });

  it("captures to Sentry on fetch throw (network error, never throws)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(
      recordViewerEvent({
        chatSessionId: "chat-1",
        timestamp: 0,
        entityKey: null,
        action: "opened",
        source: "user",
      }),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [, extras] = vi.mocked(captureException).mock.calls[0];
    expect(extras).toMatchObject({ route: "/api/viewer-events", action: "opened" });
  });
});
