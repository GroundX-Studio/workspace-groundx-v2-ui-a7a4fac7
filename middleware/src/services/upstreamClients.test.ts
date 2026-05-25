import { afterEach, describe, expect, it, vi } from "vitest";

import { FetchGroundXClient } from "./groundxClient.js";
import { FetchGroundXPartnerClient } from "./groundxPartnerClient.js";
import { FetchLlmClient } from "./llmClient.js";
import { testEnv } from "../test/fakes.js";

const fetchMock = vi.fn();

globalThis.fetch = fetchMock as typeof fetch;

function headersForCall(callIndex = 0) {
  return fetchMock.mock.calls[callIndex]?.[1]?.headers as Headers;
}

describe("upstream fetch clients", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("GroundX client attaches only the server-side GroundX API key", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true }));
    const client = new FetchGroundXClient(testEnv);

    await client.forward("/search/documents", {
      method: "POST",
      body: JSON.stringify({ query: "hello" }),
      apiKey: "customer-groundx-key",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groundx.test/api/v1/search/documents",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "hello" }),
      })
    );
    const headers = headersForCall();
    expect(headers.get("X-API-Key")).toBe("customer-groundx-key");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept")).toBe("application/json");
  });

  it("Partner client attaches Partner API key, Basic auth, and customer key only server-side", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ username: "gx-user", token: "token" }));
    fetchMock.mockResolvedValueOnce(Response.json({ apiKeys: [{ apiKey: "gx-key" }] }));
    const client = new FetchGroundXPartnerClient(testEnv);

    await client.loginCustomer({ email: "pat@example.com", password: "secret" });
    await client.createApiKey("gx-user", "app-session");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.groundx.test/api/v1/customer/login",
      expect.objectContaining({
        method: "POST",
      })
    );
    const loginHeaders = headersForCall(0);
    expect(loginHeaders.get("X-API-Key")).toBe("partner-key");
    expect(loginHeaders.get("Authorization")).toBe(`Basic ${Buffer.from("pat@example.com:secret").toString("base64")}`);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.groundx.test/api/v1/apikey",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ apiKey: { name: "app-session" } }),
      })
    );
    const apiKeyHeaders = headersForCall(1);
    expect(apiKeyHeaders.get("X-API-Key")).toBe("partner-key");
    expect(apiKeyHeaders.get("X-Customer-Key")).toBe("gx-user");
  });

  it("Partner client normalizes failed auth responses into status-bearing errors", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: "Nope" }, { status: 401 }));
    const client = new FetchGroundXPartnerClient(testEnv);

    await expect(client.loginCustomer({ email: "pat@example.com", password: "bad" })).rejects.toMatchObject({
      message: "GroundX login failed: Nope",
      status: 401,
      upstreamStatus: 401,
    });
  });

  it("LLM client keeps provider credentials server-side and supports custom auth settings", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ answer: "ok" }));
    const client = new FetchLlmClient({
      ...testEnv,
      LLM_AUTH_HEADER_NAME: "X-Provider-Key",
      LLM_AUTH_SCHEME: "",
      LLM_API_KEY: "provider-secret",
    });

    await client.forward("/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://llm.test/v1/chat/completions",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ messages: [] }) })
    );
    expect(headersForCall().get("X-Provider-Key")).toBe("provider-secret");
  });

  it("LLM client returns a 503 response when provider credentials are absent", async () => {
    const client = new FetchLlmClient({ ...testEnv, LLM_BASE_URL: undefined, LLM_API_KEY: undefined });

    const response = await client.forward("/chat/completions", { method: "POST" });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "LLM provider is not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchWithTimeout", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    vi.useRealTimers();
  });

  it("returns the response when fetch resolves before the timeout fires", async () => {
    const { fetchWithTimeout } = await import("./http.js");
    global.fetch = vi.fn(async () => new Response("ok", { status: 200 }));
    const res = await fetchWithTimeout("https://x.test/", { method: "GET" }, { timeoutMs: 1_000 });
    expect(res.status).toBe(200);
  });

  it("throws UpstreamTimeoutError when fetch never resolves within the timeout", async () => {
    const { fetchWithTimeout, UpstreamTimeoutError } = await import("./http.js");
    // Simulate a hung upstream — fetch resolves only when signal aborts.
    global.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    await expect(
      fetchWithTimeout("https://hang.test/", { method: "GET" }, { timeoutMs: 50, label: "llm" }),
    ).rejects.toBeInstanceOf(UpstreamTimeoutError);
  });

  it("propagates an external AbortError (does not relabel as timeout)", async () => {
    const { fetchWithTimeout } = await import("./http.js");
    global.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    const controller = new AbortController();
    const promise = fetchWithTimeout(
      "https://hang.test/",
      { method: "GET", signal: controller.signal },
      { timeoutMs: 60_000 },
    );
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
  });

  it("clients (groundx / llm / partner) propagate UpstreamTimeoutError up to the caller", async () => {
    const { UpstreamTimeoutError } = await import("./http.js");
    // Make fetch hang so the configured timeout fires.
    global.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );
    const tightEnv = { ...testEnv, UPSTREAM_TIMEOUT_MS: 30 };
    await expect(
      new FetchGroundXClient(tightEnv).forward("/search/x", { method: "POST", apiKey: "k" }),
    ).rejects.toBeInstanceOf(UpstreamTimeoutError);
    await expect(
      new FetchLlmClient(tightEnv).forward("/chat/completions", { method: "POST" }),
    ).rejects.toBeInstanceOf(UpstreamTimeoutError);
  });
});
