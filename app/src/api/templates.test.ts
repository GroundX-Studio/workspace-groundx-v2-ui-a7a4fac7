import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TemplateApiError, saveTemplate, type TemplateSaveInput } from "./templates";

const originalFetch = global.fetch;

beforeEach(() => {
  // CSRF cookie pre-set so csrfFetch skips its bootstrap GET round-trip.
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

const samplePayload: TemplateSaveInput = {
  id: "es-1",
  kind: "extract",
  name: "Utility (custom)",
  body: { categories: [] },
};

describe("saveTemplate", () => {
  it("POSTs the TemplateSaveInput to /api/templates and returns the server payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "es-1", name: "Utility (custom)", updatedAt: "2026-05-27T00:00:00Z" }),
    });
    global.fetch = fetchMock;

    const result = await saveTemplate(samplePayload);
    expect(result).toMatchObject({ id: "es-1", name: "Utility (custom)" });

    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe("/api/templates");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject(samplePayload);
    // 🔒 the client never sends an owner/timestamps (server assigns them).
    expect("ownerUsername" in body).toBe(false);
  });

  it("throws TemplateApiError on 401 (anonymous) so callers surface the sign-in nudge", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: "unauthenticated" }),
    });
    let caught: unknown = null;
    try {
      await saveTemplate(samplePayload);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TemplateApiError);
    expect((caught as TemplateApiError).status).toBe(401);
  });

  it("throws TemplateApiError on 400 (malformed payload)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "invalid_payload" }),
    });
    let caught: unknown = null;
    try {
      await saveTemplate(samplePayload);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TemplateApiError);
    expect((caught as TemplateApiError).status).toBe(400);
  });
});
