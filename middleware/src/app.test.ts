import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { MemoryAppRepository } from "./db/memoryRepository.js";
import { decryptSecret } from "./lib/crypto.js";
import { SESSION_COOKIE } from "./middleware/session.js";
import { FakeGroundXClient, FakeLlmClient, FakePartnerClient, FakeScenarioRegistry, testEnv } from "./test/fakes.js";
import type { GroundXClient, GroundXPartnerClient, LlmClient } from "./types.js";

function setup() {
  const repository = new MemoryAppRepository();
  const partnerClient = new FakePartnerClient();
  const groundxClient = new FakeGroundXClient();
  const llmClient = new FakeLlmClient();
  const scenarioRegistry = new FakeScenarioRegistry();
  const app = createApp({ env: testEnv, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });
  return { app, repository, partnerClient, groundxClient, llmClient, scenarioRegistry };
}

describe("middleware scaffold", () => {
  it("validates required environment", () => {
    expect(() => loadEnv({ NODE_ENV: "production", PORT: "3001" } as any)).toThrow();
    const defaultDevEnv = loadEnv({ NODE_ENV: "development", PORT: "3001" } as any);
    expect(defaultDevEnv.APP_REPOSITORY_MODE).toBe("auto");
    expect(defaultDevEnv.MYSQL_HOST).toBeUndefined();
    expect(loadEnv({ ...testEnv, PORT: "3002" } as any).PORT).toBe(3002);
    expect(loadEnv({ ...testEnv, MOCK_MODE: "true" } as any).MOCK_MODE).toBe(true);
    expect(loadEnv({ ...testEnv, MOCK_MODE: " YES " } as any).MOCK_MODE).toBe(true);
    expect(loadEnv({ ...testEnv, MOCK_MODE: "false" } as any).MOCK_MODE).toBe(false);
    expect(() =>
      loadEnv({
        NODE_ENV: "development",
        PORT: "3001",
        APP_REPOSITORY_MODE: "mysql",
        SESSION_SECRET: "01234567890123456789012345678901",
      } as any),
    ).toThrow(/MYSQL_HOST/);
    expect(() => loadEnv({ ...testEnv, NODE_ENV: "production", MOCK_MODE: "true" } as any)).toThrow(
      /MOCK_MODE/,
    );
    expect(() => loadEnv({ ...testEnv, NODE_ENV: "production", LLM_SERVICE: undefined } as any)).toThrow(
      /LLM_SERVICE/,
    );
    expect(() => loadEnv({ ...testEnv, NODE_ENV: "production", LLM_MODEL_ID: undefined } as any)).toThrow(
      /LLM_MODEL_ID/,
    );
    // SESSION_SECRET must be overridden in production — the dev default
    // gives signable session cookies and would be forgeable.
    expect(() =>
      loadEnv({
        ...testEnv,
        NODE_ENV: "production",
        SESSION_SECRET: "dev-session-secret-change-before-production",
      } as any),
    ).toThrow(/SESSION_SECRET/);
    // UPSTREAM_TIMEOUT_MS is configurable and bounded.
    expect(loadEnv({ ...testEnv, UPSTREAM_TIMEOUT_MS: "5000" } as any).UPSTREAM_TIMEOUT_MS).toBe(5_000);
    expect(() => loadEnv({ ...testEnv, UPSTREAM_TIMEOUT_MS: "500" } as any)).toThrow(/UPSTREAM_TIMEOUT_MS/);
  });

  it("serves health without authentication", async () => {
    const { app } = setup();
    await request(app).get("/api/healthz").expect(200, { status: "ok" });
  });

  it("skips request logging for kube-probe and Prometheus endpoints", async () => {
    // Direct unit test on the helper; the pino-http wiring is a
    // one-liner that delegates to it.
    const { shouldSkipRequestLog } = await import("./app.js");
    expect(shouldSkipRequestLog("/api/healthz")).toBe(true);
    expect(shouldSkipRequestLog("/api/healthz?ts=123")).toBe(true);
    expect(shouldSkipRequestLog("/api/metrics")).toBe(true);
    expect(shouldSkipRequestLog("/api/metrics?format=json")).toBe(true);
    // Everything else still logs.
    expect(shouldSkipRequestLog("/api/auth/login")).toBe(false);
    expect(shouldSkipRequestLog("/api/scenarios")).toBe(false);
    expect(shouldSkipRequestLog("/api/healthz/something")).toBe(false); // not the probe itself
    expect(shouldSkipRequestLog(undefined)).toBe(false);
  });

  it("registers through GroundX Partner API and stores only session plus app metadata", async () => {
    const { app, repository, partnerClient } = setup();

    const response = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Basic ${Buffer.from("pat@example.com:secret").toString("base64")}`)
      .send({ customer: { first: "Pat", company: "Acme" } })
      .expect(200);

    expect(
      response.headers["set-cookie"]?.some((c) => c.includes(SESSION_COOKIE)),
    ).toBe(true);
    expect(response.body).toMatchObject({ success: true, username: "gx-user", token: "token-register" });
    expect(partnerClient.calls.map((call) => call.name)).toEqual(["registerCustomer", "createApiKey"]);
    expect(repository.sessions.size).toBe(1);
    expect(repository.metadata.get("gx-user")).toEqual({ groundxUsername: "gx-user" });
    const [session] = [...repository.sessions.values()];
    expect(session.groundxUsername).toBe("gx-user");
    expect(decryptSecret(session.groundxApiKeyEnc!, testEnv.SESSION_SECRET)).toBe("groundx-api-key");
  });

  it.each([
    ["login", "/api/auth/login", { email: "pat@example.com", password: "secret" }],
    ["register", "/api/auth/register", { email: "pat@example.com", password: "secret", customer: { first: "Pat" } }],
  ] as const)("promotes an anonymous onboarding session in place on %s", async (_name, path, body) => {
    const { app, repository } = setup();
    const agent = request.agent(app);

    const anonymous = await agent.post("/api/onboarding/session").expect(200);
    const anonymousSessionId = anonymous.body.sessionId;
    expect(repository.sessions.size).toBe(1);
    expect(repository.sessions.get(anonymousSessionId)?.groundxUsername).toBe("");

    await agent.post(path).send(body).expect(200);

    expect(repository.sessions.size).toBe(1);
    const promoted = repository.sessions.get(anonymousSessionId);
    expect(promoted).toBeDefined();
    expect(promoted?.groundxUsername).toBe("gx-user");
    expect(decryptSecret(promoted!.groundxApiKeyEnc!, testEnv.SESSION_SECRET)).toBe("groundx-api-key");
    await agent.get("/api/auth/me").expect(200).expect((res) => {
      expect(res.body).toMatchObject({ authenticated: true, username: "gx-user" });
    });
  });

  it("accepts Basic auth credentials when auth request bodies are absent or malformed", async () => {
    const { app, partnerClient } = setup();

    await request(app)
      .post("/api/auth/login")
      .set("Authorization", `Basic ${Buffer.from("pat@example.com:secret").toString("base64")}`)
      .set("Content-Type", "text/plain")
      .send("not-json")
      .expect(200);

    await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Basic ${Buffer.from("pat@example.com:secret").toString("base64")}`)
      .set("Content-Type", "text/plain")
      .send("not-json")
      .expect(200);

    expect(partnerClient.calls.map((call) => call.name)).toEqual([
      "loginCustomer",
      "createApiKey",
      "registerCustomer",
      "createApiKey",
    ]);
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
      scenarioRegistry: new FakeScenarioRegistry(),
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

    await agent.get("/api/apikey").expect(429, { error: "Partner failed" });
    await agent.post("/api/v1/search/documents").send({ query: "hello" }).expect(503, { error: "GroundX failed" });
    await agent.post("/api/llm/chat/completions").send({ messages: [] }).expect(502, { error: "LLM failed" });
  });

  it("POST /api/chat/messages rejects requests without a session cookie", async () => {
    const { app } = setup();
    await request(app)
      .post("/api/chat/messages")
      .send({ chatSessionId: "chat-1", newUserMessage: "hello" })
      .expect(401);
  });

  it("POST /api/chat/messages returns 400 for malformed payload", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    void repository; // ensure the in-memory session was created

    await agent
      .post("/api/chat/messages")
      .send({ newUserMessage: "no session id" })
      .expect(400, { error: "invalid_payload" });
  });

  it("POST /api/chat/messages returns 404 when the chat session is unknown", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);

    const response = await agent
      .post("/api/chat/messages")
      .send({ chatSessionId: "does-not-exist", newUserMessage: "hello" })
      .expect(404);
    expect(response.body.error).toMatch(/chat_session_not_found/);
  });

  it("POST /api/chat/messages round-trips a user + assistant turn in mock mode", async () => {
    const repository = new MemoryAppRepository();
    const partnerClient = new FakePartnerClient();
    const groundxClient = new FakeGroundXClient();
    const llmClient = new FakeLlmClient();
    const scenarioRegistry = new FakeScenarioRegistry();
    const mockEnv = { ...testEnv, MOCK_MODE: true };
    const app = createApp({ env: mockEnv, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });

    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);

    // Seed a chat session so the handler can find it.
    const now = new Date();
    await repository.upsertChatSession({
      id: "chat-1",
      onboardingSessionId: "onb-1",
      ownerUserId: null,
      ownerAnonId: "anon-1",
      title: "Onboarding",
      isOnboarding: true,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });

    const response = await agent
      .post("/api/chat/messages")
      .send({ chatSessionId: "chat-1", newUserMessage: "What is RAG?" })
      .expect(200);

    expect(response.body.userMessageId).toEqual(expect.any(String));
    expect(response.body.assistantMessageId).toEqual(expect.any(String));
    expect(response.body.reply.mode).toBe("rag");
    expect(response.body.reply.answer).toMatch(/Mock RAG/);
    expect(response.body.compressionRan).toBe(false);

    const messages = await repository.listChatMessages("chat-1");
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    // Mock mode must not have hit any upstream client.
    expect(llmClient.calls).toHaveLength(0);
    expect(groundxClient.calls).toHaveLength(0);
  });

  it("returns safe upstream status context for direct Partner auth failures", async () => {
    class LoginErrorPartnerClient extends FakePartnerClient implements GroundXPartnerClient {
      async loginCustomer(): Promise<never> {
        const { upstreamError } = await import("./services/http.js");
        throw await upstreamError(Response.json({ message: "Invalid customer credentials" }, { status: 401 }), "GroundX login failed");
      }
    }

    const repository = new MemoryAppRepository();
    const app = createApp({
      env: testEnv,
      repository,
      partnerClient: new LoginErrorPartnerClient(),
      groundxClient: new FakeGroundXClient(),
      llmClient: new FakeLlmClient(),
      scenarioRegistry: new FakeScenarioRegistry(),
    });

    await request(app).post("/api/auth/login").send({ email: "pat@example.com", password: "bad" }).expect(401, {
      error: "GroundX login failed: Invalid customer credentials",
      upstreamStatus: 401,
    });
  });

  // UI-10b — intent_log POST route.
  describe("POST /api/intent (UI-10b)", () => {
    async function setupOwnedSession() {
      const { app, repository } = setup();
      const agent = request.agent(app);
      // Anonymous bootstrap mints a server-side session row.
      const anon = await agent.post("/api/onboarding/session").expect(200);
      const anonSessionId = anon.body.sessionId;
      // Create the chat_session row owned by this anon session.
      await agent
        .post("/api/chat-sessions")
        .send({ id: "chat-1", title: "Onboarding", isOnboarding: true })
        .expect(200);
      return { app, agent, repository, anonSessionId };
    }

    it("appends a row when the caller owns the chat session (anon, then list reads back)", async () => {
      const { agent, repository } = await setupOwnedSession();
      await agent
        .post("/api/intent")
        .send({
          chatSessionId: "chat-1",
          source: "agent",
          intent: { kind: "openDocument", documentId: "d-1", page: 3 },
        })
        .expect(201, { ok: true });
      const rows = await repository.listIntentLog("chat-1");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        chatSessionId: "chat-1",
        source: "agent",
        intentKind: "openDocument",
      });
      const parsed = JSON.parse(rows[0].intentJson);
      expect(parsed).toEqual({ kind: "openDocument", documentId: "d-1", page: 3 });
    });

    it("rejects invalid payload shapes with 400", async () => {
      const { agent } = await setupOwnedSession();
      // missing intent
      await agent
        .post("/api/intent")
        .send({ chatSessionId: "chat-1", source: "user" })
        .expect(400, { error: "invalid_payload" });
      // bad source
      await agent
        .post("/api/intent")
        .send({ chatSessionId: "chat-1", source: "alien", intent: { kind: "openDocument" } })
        .expect(400, { error: "invalid_payload" });
      // intent without kind
      await agent
        .post("/api/intent")
        .send({ chatSessionId: "chat-1", source: "user", intent: { foo: "bar" } })
        .expect(400, { error: "invalid_payload" });
    });

    it("404 when chat_session_id doesn't exist", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/intent")
        .send({ chatSessionId: "missing", source: "user", intent: { kind: "openDocument" } })
        .expect(404, { error: "chat_session_not_found" });
    });

    it("403 when caller doesn't own the chat session", async () => {
      const { app, repository } = setup();
      // Plant a chat_session owned by a DIFFERENT anon id.
      const now = new Date();
      await repository.upsertChatSession({
        id: "chat-other",
        onboardingSessionId: "chat-other",
        ownerUserId: null,
        ownerAnonId: "anon-OTHER",
        title: "Someone else's",
        isOnboarding: true,
        activeEntityKey: null,
        currentIntent: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200); // mints a different session
      await agent
        .post("/api/intent")
        .send({ chatSessionId: "chat-other", source: "user", intent: { kind: "openDocument" } })
        .expect(403, { error: "not_session_owner" });
    });

    it("requires a session (401 when no cookie)", async () => {
      const { app } = setup();
      await request(app)
        .post("/api/intent")
        .send({ chatSessionId: "chat-1", source: "user", intent: { kind: "openDocument" } })
        .expect(401);
    });
  });

  // UI-01 Phase 2d — Save template. The frontend POSTs the active
  // session's pendingSchemaOverlay (merged onto the manifest schema)
  // so the user can pin a named version of the schema. Gated on auth
  // because anonymous sessions don't have a `groundxUsername` to key
  // the row by; the frontend surfaces a sign-in nudge when 401 comes
  // back.
  describe("POST /api/extraction-schemas (UI-01 Phase 2d)", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const { app } = setup();
      await request(app)
        .post("/api/extraction-schemas")
        .send({ id: "es-1", name: "Utility", schema: { categories: [] } })
        .expect(401);
    });

    it("returns 400 for malformed payload (missing required fields)", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
      await agent
        .post("/api/extraction-schemas")
        .send({ id: "es-1" })
        .expect(400, { error: "invalid_payload" });
      await agent
        .post("/api/extraction-schemas")
        .send({ id: "es-1", name: "X" })
        .expect(400, { error: "invalid_payload" });
    });

    it("persists a saved schema scoped to the authed user (round-trip)", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

      const schema = {
        name: "Utility",
        categories: [
          { id: "statement", type: "statement", name: "Statement", fields: [{ id: "total_tax", name: "Total tax", type: "NUMBER", description: "d" }] },
        ],
      };
      const response = await agent
        .post("/api/extraction-schemas")
        .send({ id: "es-1", name: "Utility (custom)", schema })
        .expect(200);
      expect(response.body).toMatchObject({ id: "es-1", name: "Utility (custom)" });

      // Round-trip: the row is visible to the same authed user via the
      // repository read path.
      const rows = await repository.listExtractionSchemasForUser("gx-user");
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("es-1");
      expect(rows[0].name).toBe("Utility (custom)");
      const parsed = JSON.parse(rows[0].schemaJson) as { categories: { id: string }[] };
      expect(parsed.categories[0].id).toBe("statement");
    });

    it("upserts on the same id (second POST overwrites name + schema)", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

      await agent
        .post("/api/extraction-schemas")
        .send({ id: "es-1", name: "v1", schema: { categories: [] } })
        .expect(200);
      await agent
        .post("/api/extraction-schemas")
        .send({ id: "es-1", name: "v2", schema: { categories: [{ id: "x", type: "statement", name: "X", fields: [] }] } })
        .expect(200);

      const rows = await repository.listExtractionSchemasForUser("gx-user");
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("v2");
      const parsed = JSON.parse(rows[0].schemaJson) as { categories: { id: string }[] };
      expect(parsed.categories[0].id).toBe("x");
    });
  });

  // UI-01 Phase 2c — focused per-field extraction. When the user
  // Accepts a propose-card, the chat surface fires this endpoint so
  // the new field has a real value (not a manifest placeholder).
  describe("POST /api/extract-field (UI-01 Phase 2c)", () => {
    it("rejects requests without a session cookie", async () => {
      const { app } = setup();
      await request(app)
        .post("/api/extract-field")
        .send({ chatSessionId: "chat-1", field: { name: "x", type: "STRING", description: "y" } })
        .expect(401);
    });

    it("returns 400 for malformed payload (missing chatSessionId or field)", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/extract-field")
        .send({ field: { name: "x", type: "STRING", description: "y" } })
        .expect(400, { error: "invalid_payload" });
      await agent
        .post("/api/extract-field")
        .send({ chatSessionId: "chat-1" })
        .expect(400, { error: "invalid_payload" });
      await agent
        .post("/api/extract-field")
        .send({ chatSessionId: "chat-1", field: { name: "x", type: "OBJECT", description: "y" } })
        .expect(400, { error: "invalid_payload" });
    });

    it("returns 404 when the chat session row doesn't exist", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      const response = await agent
        .post("/api/extract-field")
        .send({
          chatSessionId: "does-not-exist",
          field: { name: "x", type: "STRING", description: "y" },
        })
        .expect(404);
      expect(response.body.error).toMatch(/chat_session_not_found/);
    });

    it("returns a typed value envelope in mock mode (NUMBER field)", async () => {
      const repository = new MemoryAppRepository();
      const partnerClient = new FakePartnerClient();
      const groundxClient = new FakeGroundXClient();
      const llmClient = new FakeLlmClient();
      const scenarioRegistry = new FakeScenarioRegistry();
      const mockEnv = { ...testEnv, MOCK_MODE: true };
      const app = createApp({ env: mockEnv, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });
      const agent = request.agent(app);
      // Anon bootstrap mints the server session — POST /api/chat-sessions
      // then sets `ownerAnonId = session.id` so the ownership check
      // accepts the same agent's later call.
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "chat-1", title: "Onboarding", isOnboarding: true })
        .expect(200);

      const response = await agent
        .post("/api/extract-field")
        .send({
          chatSessionId: "chat-1",
          field: { name: "total_tax", type: "NUMBER", description: "Total tax billed this period." },
        })
        .expect(200);

      // value can be a number (mock plausible) OR null (couldn't infer).
      // The contract is: shape is fixed; downstream UI renders both states.
      expect(response.body).toHaveProperty("value");
      expect(response.body).toHaveProperty("confidence");
      expect(typeof response.body.confidence).toBe("number");
      if (response.body.value !== null) {
        expect(typeof response.body.value).toBe("number");
      }
    });

    it("403 when caller doesn't own the chat session", async () => {
      const { app, repository } = setup();
      // Owner-A bootstrap + creates chat-1.
      const ownerA = request.agent(app);
      await ownerA.post("/api/onboarding/session").expect(200);
      await ownerA
        .post("/api/chat-sessions")
        .send({ id: "chat-1", title: "A", isOnboarding: true })
        .expect(200);
      void repository;
      // Owner-B bootstraps a fresh anon session — doesn't own chat-1.
      const ownerB = request.agent(app);
      await ownerB.post("/api/onboarding/session").expect(200);
      await ownerB
        .post("/api/extract-field")
        .send({
          chatSessionId: "chat-1",
          field: { name: "x", type: "STRING", description: "y" },
        })
        .expect(403);
    });
  });
});
