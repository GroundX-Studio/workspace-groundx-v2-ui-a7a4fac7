import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { MemoryAppRepository } from "./db/memoryRepository.js";
import { decryptSecret } from "./lib/crypto.js";
import { SESSION_COOKIE } from "./middleware/session.js";
import { FakeGroundXClient, FakeLlmClient, FakePartnerClient, testEnv } from "./test/fakes.js";
import type { GroundXClient, GroundXPartnerClient, LlmClient } from "./types.js";

function setup() {
  const repository = new MemoryAppRepository();
  const partnerClient = new FakePartnerClient();
  const groundxClient = new FakeGroundXClient();
  const llmClient = new FakeLlmClient();
  const app = createApp({ env: testEnv, repository, partnerClient, groundxClient, llmClient });
  return { app, repository, partnerClient, groundxClient, llmClient };
}

describe("middleware scaffold", () => {
  it("validates required environment", () => {
    expect(() => loadEnv({ NODE_ENV: "production", PORT: "3001" } as any)).toThrow();
    expect(loadEnv({ ...testEnv, PORT: "3002" } as any).PORT).toBe(3002);
  });

  it("serves health without authentication", async () => {
    const { app } = setup();
    await request(app).get("/api/healthz").expect(200, { status: "ok" });
  });

  it("registers through GroundX Partner API and stores only session plus app metadata", async () => {
    const { app, repository, partnerClient } = setup();

    const response = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Basic ${Buffer.from("pat@example.com:secret").toString("base64")}`)
      .send({ customer: { first: "Pat", company: "Acme" } })
      .expect(200);

    expect(response.headers["set-cookie"]?.[0]).toContain(SESSION_COOKIE);
    expect(response.body).toMatchObject({ success: true, username: "gx-user", token: "token-register" });
    expect(partnerClient.calls.map((call) => call.name)).toEqual(["registerCustomer", "createApiKey"]);
    expect(repository.sessions.size).toBe(1);
    expect(repository.metadata.get("gx-user")).toEqual({ groundxUsername: "gx-user" });
    const [session] = [...repository.sessions.values()];
    expect(session.groundxUsername).toBe("gx-user");
    expect(decryptSecret(session.groundxApiKeyEnc!, testEnv.SESSION_SECRET)).toBe("groundx-api-key");
  });

  it("logs in, resolves /auth/me, and logs out by deleting the local session", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);

    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    await agent.get("/api/auth/me").expect(200).expect((res) => {
      expect(res.body).toMatchObject({ authenticated: true, username: "gx-user" });
      expect(res.body.customer).toMatchObject({ username: "gx-user" });
    });
    expect(repository.sessions.size).toBe(1);
    await agent.post("/api/auth/logout").expect(200, { success: true });
    expect(repository.sessions.size).toBe(0);
  });

  it("updates app-owned onboarding metadata for the current session", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    await repository.upsertMetadata({
      groundxUsername: "gx-user",
      uiPreferencesJson: JSON.stringify({ density: "compact" }),
    });

    await agent
      .patch("/api/me/metadata")
      .send({ onboardingState: "complete" })
      .expect(200)
      .expect((res) => {
        expect(res.body.appMetadata).toMatchObject({
          groundxUsername: "gx-user",
          onboardingState: "complete",
          uiPreferencesJson: JSON.stringify({ density: "compact" }),
        });
      });

    expect(repository.metadata.get("gx-user")).toMatchObject({
      groundxUsername: "gx-user",
      onboardingState: "complete",
      uiPreferencesJson: JSON.stringify({ density: "compact" }),
    });
  });

  it("rejects invalid app metadata updates", async () => {
    const { app } = setup();
    const agent = request.agent(app);

    await request(app)
      .patch("/api/me/metadata")
      .send({ onboardingState: "complete" })
      .expect(401, { error: "Authentication required" });

    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    await agent.patch("/api/me/metadata").send({ appRole: "admin" }).expect(400, {
      error: "Unsupported metadata field: appRole",
    });
    await agent.patch("/api/me/metadata").send({ onboardingState: true }).expect(400, {
      error: "onboardingState must be a string or null",
    });
  });

  it("uses Partner APIs for customer and customer-scoped resource families with correct server-side headers", async () => {
    const { app, partnerClient } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    const cases = [
      { method: "get", path: "/api/customer/gx-user", upstreamPath: "/customer/gx-user" },
      { method: "post", path: "/api/apikey", upstreamPath: "/apikey", customerKey: "gx-user" },
      { method: "put", path: "/api/project/123", upstreamPath: "/project/123", customerKey: "gx-user" },
      { method: "delete", path: "/api/bucket/456", upstreamPath: "/bucket/456", customerKey: "gx-user" },
      { method: "get", path: "/api/group?nextToken=abc", upstreamPath: "/group?nextToken=abc", customerKey: "gx-user" },
    ] as const;

    for (const testCase of cases) {
      await agent[testCase.method](testCase.path).send({ value: true }).expect(200).expect((res) => {
        expect(res.body).toMatchObject({ path: testCase.upstreamPath });
        if ("customerKey" in testCase) {
          expect(res.body.customerKey).toBe(testCase.customerKey);
        } else {
          expect(res.body.customerKey).toBeUndefined();
        }
      });
      const call = partnerClient.calls.at(-1);
      expect(call).toMatchObject({
        name: "forward",
        input: expect.objectContaining({
          path: testCase.upstreamPath,
        }),
      });
      const init = (call?.input as { init?: RequestInit & { customerKey?: string } })?.init;
      if ("customerKey" in testCase) {
        expect(init).toMatchObject({ customerKey: testCase.customerKey });
      } else {
        expect(init).not.toHaveProperty("customerKey");
      }
    }
  });

  it("proxies GroundX API calls using the session API key", async () => {
    const { app, groundxClient } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    await agent.post("/api/v1/search/documents?mode=semantic").send({ query: "hello" }).expect(200);
    expect(groundxClient.calls.at(-1)).toMatchObject({
      path: "/search/documents?mode=semantic",
      init: expect.objectContaining({ apiKey: "groundx-api-key", method: "POST" }),
    });
  });

  it("proxies LLM calls without accepting provider secrets from the browser", async () => {
    const { app, llmClient } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    await agent.post("/api/llm/chat/completions").send({ messages: [] }).expect(200);
    expect(llmClient.calls.at(-1)).toMatchObject({
      path: "/chat/completions",
      init: expect.not.objectContaining({
        headers: expect.any(Object),
      }),
    });
  });

  it("uses Partner API password reset endpoints", async () => {
    const { app, partnerClient } = setup();
    await request(app).post("/api/auth/password/reset").send({ email: "pat@example.com" }).expect(200);
    await request(app)
      .post("/api/auth/password/confirm")
      .send({ email: "pat@example.com", newPassword: "secret-2", code: "123456" })
      .expect(200);
    expect(partnerClient.calls.map((call) => call.name)).toEqual(["requestPasswordReset", "confirmPasswordReset"]);
  });

  it("rejects protected proxy routes without a valid session cookie", async () => {
    const { app } = setup();
    await request(app).get("/api/auth/me").expect(401, { error: "Authentication required" });
    await request(app).post("/api/customer/login").expect(401, { error: "Authentication required" });
    await request(app).get("/api/apikey").expect(401, { error: "Authentication required" });
    await request(app)
      .post("/api/v1/search/documents")
      .send({ query: "hello" })
      .expect(401, { error: "Authentication required" });
    await request(app)
      .post("/api/llm/chat/completions")
      .send({ messages: [] })
      .expect(401, { error: "Authentication required" });
  });

  it("does not send bodies on GET or HEAD proxy requests", async () => {
    const { app, groundxClient, llmClient } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    await agent.get("/api/v1/health?include=all").send({ shouldNotForward: true }).expect(200);
    await agent.get("/api/llm/models?provider=default").send({ shouldNotForward: true }).expect(200);

    expect(groundxClient.calls.at(-1)?.init.body).toBeUndefined();
    expect(groundxClient.calls.at(-1)?.path).toBe("/health?include=all");
    expect(llmClient.calls.at(-1)?.init.body).toBeUndefined();
    expect(llmClient.calls.at(-1)?.path).toBe("/models?provider=default");
  });

  it("normalizes upstream Partner, GroundX, and LLM error responses", async () => {
    class ErrorPartnerClient extends FakePartnerClient implements GroundXPartnerClient {
      async forward(): Promise<Response> {
        return Response.json({ error: "Partner failed" }, { status: 429 });
      }
    }
    class ErrorGroundXClient extends FakeGroundXClient implements GroundXClient {
      async forward(): Promise<Response> {
        return Response.json({ error: "GroundX failed" }, { status: 503 });
      }
    }
    class ErrorLlmClient extends FakeLlmClient implements LlmClient {
      async forward(): Promise<Response> {
        return Response.json({ error: "LLM failed" }, { status: 502 });
      }
    }

    const repository = new MemoryAppRepository();
    const app = createApp({
      env: testEnv,
      repository,
      partnerClient: new ErrorPartnerClient(),
      groundxClient: new ErrorGroundXClient(),
      llmClient: new ErrorLlmClient(),
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

    await agent.get("/api/apikey").expect(429, { error: "Partner failed" });
    await agent.post("/api/v1/search/documents").send({ query: "hello" }).expect(503, { error: "GroundX failed" });
    await agent.post("/api/llm/chat/completions").send({ messages: [] }).expect(502, { error: "LLM failed" });
  });
});
