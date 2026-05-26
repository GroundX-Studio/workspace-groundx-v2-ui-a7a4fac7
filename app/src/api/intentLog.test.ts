import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
  initSentry: vi.fn(() => false),
}));
import { captureException } from "@/lib/sentry";

import { recordIntent } from "./intentLog";

const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn();
  vi.mocked(captureException).mockReset();
  // SC-01: pre-set csrf_token cookie so csrfFetch skips bootstrap GET.
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("recordIntent (UI-10b client)", () => {
  it("POSTs to /api/intent with credentials + JSON body", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 201,
    });
    await recordIntent({
      chatSessionId: "chat-1",
      source: "agent",
      intent: { kind: "openDocument", documentId: "d-1" },
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [path, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(path).toBe("/api/intent");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).credentials).toBe("include");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({
      chatSessionId: "chat-1",
      source: "agent",
      intent: { kind: "openDocument", documentId: "d-1" },
    });
  });

  it("captures to Sentry on non-OK response (best-effort, never throws)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    await expect(
      recordIntent({
        chatSessionId: "chat-1",
        source: "user",
        intent: { kind: "openDocument" },
      }),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    const [err, extras] = vi.mocked(captureException).mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect(extras).toMatchObject({
      route: "/api/intent",
      status: 500,
      intentKind: "openDocument",
    });
  });

  it("captures to Sentry on fetch throw (network error, never throws)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Failed to fetch"));
    await expect(
      recordIntent({
        chatSessionId: "chat-1",
        source: "user",
        intent: { kind: "openDocument" },
      }),
    ).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
