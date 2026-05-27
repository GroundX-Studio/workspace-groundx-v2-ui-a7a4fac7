import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetEnsuredChatSessions } from "./chatSessions";
import { ExtractFieldApiError, extractField } from "./extractField";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetEnsuredChatSessions();
  if (typeof document !== "undefined") {
    document.cookie = "csrf_token=test-csrf-token; path=/";
  }
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("extractField", () => {
  it("POSTs to /api/extract-field with the supplied body and returns the typed envelope", async () => {
    // Stub two calls: the eager ensure-create + the extract-field POST.
    const ensure = {
      ok: true,
      status: 200,
      json: async () => ({ chatSessionId: "chat-1", ownerUserId: null, ownerAnonId: "anon-1" }),
    };
    const extract = {
      ok: true,
      status: 200,
      json: async () => ({
        value: 14.07,
        confidence: 0.92,
        citation: { documentId: "d1", page: 1, snippet: "Tax: $14.07" },
      }),
    };
    const fetchMock = vi.fn().mockResolvedValueOnce(ensure).mockResolvedValueOnce(extract);
    global.fetch = fetchMock;

    const result = await extractField({
      chatSessionId: "chat-1",
      field: { name: "total_tax", type: "NUMBER", description: "Total tax billed this period." },
    });
    expect(result).toEqual({
      value: 14.07,
      confidence: 0.92,
      citation: { documentId: "d1", page: 1, snippet: "Tax: $14.07" },
    });

    // The second call is the extract-field POST.
    const [path, init] = fetchMock.mock.calls[1];
    expect(path).toBe("/api/extract-field");
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      chatSessionId: "chat-1",
      field: { name: "total_tax", type: "NUMBER", description: "Total tax billed this period." },
    });
  });

  it("throws ExtractFieldApiError on 404 (chat session not found)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ chatSessionId: "x" }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: "chat_session_not_found" }) });
    let caught: unknown = null;
    try {
      await extractField({
        chatSessionId: "missing",
        field: { name: "x", type: "STRING", description: "y" },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ExtractFieldApiError);
    expect((caught as ExtractFieldApiError).status).toBe(404);
  });

  it("throws ExtractFieldApiError on 400 (invalid payload)", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ error: "invalid_payload" }) });
    let caught: unknown = null;
    try {
      await extractField({
        chatSessionId: "chat-1",
        field: { name: "x", type: "STRING", description: "y" },
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ExtractFieldApiError);
    expect((caught as ExtractFieldApiError).status).toBe(400);
  });
});
