import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { MemoryAppRepository } from "./db/memoryRepository.js";
import { decryptSecret } from "./lib/crypto.js";
import { SESSION_COOKIE } from "./middleware/session.js";
import { authorizedProjectIds } from "./services/projectAccess.js";
import { FakeGroundXClient, FakeLlmClient, FakePartnerClient, FakeScenarioRegistry, testEnv } from "./test/fakes.js";
import type { GroundXClient, GroundXPartnerClient, LlmClient } from "./types.js";

function setup(env = testEnv) {
  const repository = new MemoryAppRepository();
  const partnerClient = new FakePartnerClient();
  const groundxClient = new FakeGroundXClient();
  const llmClient = new FakeLlmClient();
  const scenarioRegistry = new FakeScenarioRegistry();
  const app = createApp({ env, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });
  return { app, repository, partnerClient, groundxClient, llmClient, scenarioRegistry };
}

describe("middleware scaffold", () => {
  it("validates required environment", () => {
    expect(() => loadEnv({ NODE_ENV: "production", PORT: "3001" } as any)).toThrow();
    expect(loadEnv({ ...testEnv, PORT: "3002" } as any).PORT).toBe(3002);
    // 2026-06-01-retire-mock-mode: the MOCK_MODE env field is gone. loadEnv
    // parses cleanly with no MOCK_MODE key, the schema exposes no MOCK_MODE
    // field, and a stray MOCK_MODE env var is simply ignored (not parsed into
    // a typed field) in every environment — including production.
    expect("MOCK_MODE" in loadEnv({ ...testEnv } as any)).toBe(false);
    expect("MOCK_MODE" in loadEnv({ ...testEnv, MOCK_MODE: "true" } as any)).toBe(false);
    // 2026-06-11 retire-memory-repository-mode: the APP_REPOSITORY_MODE env
    // field is gone — the runtime repository is ALWAYS MySQL (the in-memory
    // repository survives only as an injected test double). loadEnv exposes
    // no such field, a stray env var is ignored in every environment, and
    // MYSQL_* connection config is required in EVERY environment — a dev
    // boot without a database fails fast instead of silently running on RAM.
    expect("APP_REPOSITORY_MODE" in loadEnv({ ...testEnv } as any)).toBe(false);
    expect("APP_REPOSITORY_MODE" in loadEnv({ ...testEnv, APP_REPOSITORY_MODE: "memory" } as any)).toBe(false);
    expect(() => loadEnv({ NODE_ENV: "development", PORT: "3001" } as any)).toThrow(/MYSQL_HOST/);
    expect(() =>
      loadEnv({
        NODE_ENV: "development",
        PORT: "3001",
        SESSION_SECRET: "01234567890123456789012345678901",
      } as any),
    ).toThrow(/MYSQL_HOST/);
    expect(() => loadEnv({ ...testEnv, NODE_ENV: "production", LLM_SERVICE: undefined } as any)).toThrow(
      /LLM_SERVICE/,
    );
    expect(() => loadEnv({ ...testEnv, NODE_ENV: "production", LLM_MODEL_ID: undefined } as any)).toThrow(
      /LLM_MODEL_ID/,
    );
    // wire-embedding-verification: the embeddings provider is always-on —
    // base_url + model_id are required in production (fail fast at boot)…
    expect(() =>
      loadEnv({ ...testEnv, NODE_ENV: "production", EMBEDDINGS_BASE_URL: undefined } as any),
    ).toThrow(/EMBEDDINGS_BASE_URL/);
    expect(() =>
      loadEnv({ ...testEnv, NODE_ENV: "production", EMBEDDINGS_MODEL_ID: undefined } as any),
    ).toThrow(/EMBEDDINGS_MODEL_ID/);
    // …but the API key is NOT required (keyless self-hosted providers):
    // production boots with base_url + model_id and no key.
    expect(
      loadEnv({ ...testEnv, NODE_ENV: "production", EMBEDDINGS_API_KEY: undefined } as any)
        .EMBEDDINGS_MODEL_ID,
    ).toBe("embed-model");
    // Threshold + timeout bounds enforced; defaults applied when unset.
    expect(loadEnv({ ...testEnv } as any).EMBEDDINGS_VERIFY_THRESHOLD).toBe(0.82);
    expect(loadEnv({ ...testEnv } as any).EMBEDDINGS_TIMEOUT_MS).toBe(2000);
    expect(() => loadEnv({ ...testEnv, EMBEDDINGS_VERIFY_THRESHOLD: "0.3" } as any)).toThrow();
    expect(() => loadEnv({ ...testEnv, EMBEDDINGS_TIMEOUT_MS: "50" } as any)).toThrow();
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

  it("serves deployment provenance on health when provided", async () => {
    const { app } = setup({
      ...testEnv,
      GROUNDX_DEPLOY_COMMIT_SHA: "abc123",
      GROUNDX_DEPLOY_ENVIRONMENT: "dev",
      GROUNDX_DEPLOY_IMAGE_TAG: "project-dev",
      GROUNDX_DEPLOY_NAMESPACE: "project-dev",
      GROUNDX_DEPLOY_PUBLIC_HOST: "workspace-project-dev.groundx.ai",
      GROUNDX_DEPLOY_RELEASE_NAME: "project-dev",
    });

    await request(app).get("/api/healthz").expect(200, {
      status: "ok",
      commitSha: "abc123",
      environment: "dev",
      imageTag: "project-dev",
      namespace: "project-dev",
      publicHost: "workspace-project-dev.groundx.ai",
      releaseName: "project-dev",
    });
  });

  it("B1: the messages-hydrate route validates citations_json — drops malformed entries, strips unknown keys", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);
    const created = await agent.post("/api/onboarding/session").expect(200);
    const sid: string = created.body.sessionId;
    const now = new Date();
    await repository.upsertChatSession({
      id: "cs-b1",
      onboardingSessionId: sid,
      ownerUserId: null,
      ownerAnonId: sid,
      title: "t",
      isOnboarding: true,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    await repository.appendChatMessage({
      id: "m-b1",
      chatSessionId: "cs-b1",
      turnIndex: 1,
      role: "assistant",
      content: "answer",
      citationsJson: JSON.stringify([
        { documentId: "d1", page: 1, snippet: "ok", extraneous: "stripped" }, // valid
        { documentId: "d2" }, // malformed: missing page
        { page: 3 }, // malformed: missing documentId
        { documentId: "d4", page: "nope" }, // malformed: page wrong type
      ]),
      compressedIntoSummaryId: null,
      llmProvider: null,
      llmModelId: null,
      latencyMs: null,
      promptTokens: null,
      completionTokens: null,
      errorCode: null,
      createdAt: now,
    });

    const res = await agent.get("/api/chat-sessions/cs-b1/messages").expect(200);
    const cites = res.body.messages[0].citations;
    expect(cites).toHaveLength(1); // only the valid citation survives validation
    expect(cites[0]).toMatchObject({ documentId: "d1", page: 1, snippet: "ok" });
    expect(cites[0]).not.toHaveProperty("extraneous"); // unknown keys stripped by the schema
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

  // DBG-01 A2 (2026-05-28). The debug-overlay Reset needs to clear the
  // httpOnly session cookie, which client JS can't touch. `/api/auth/reset`
  // clears the session (+ csrf) cookies for ANY caller — anon or authed,
  // session or no session — so the next request mints a fresh anon id.
  it("DBG-01: POST /api/auth/reset clears the session for an authenticated user", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    expect(repository.sessions.size).toBe(1);
    await agent.post("/api/auth/reset").expect(200, { success: true });
    expect(repository.sessions.size).toBe(0);
    // After reset, the protected route is no longer authorized.
    await agent.get("/api/auth/me").expect(401);
  });

  it("DBG-01: POST /api/auth/reset succeeds with no session (anon first-time)", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    // No login, no onboarding session — reset must still 200 (idempotent).
    await agent.post("/api/auth/reset").expect(200, { success: true });
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

  it("POST /api/chat/messages round-trips a user + assistant turn via the live RAG path", async () => {
    const repository = new MemoryAppRepository();
    const partnerClient = new FakePartnerClient();
    // Inject fakes at the dependency seam (2026-06-01-retire-mock-mode — no mock
    // mode): GroundX returns one search hit, the LLM grounds a cited answer.
    const groundxClient = new FakeGroundXClient();
    groundxClient.responseByPathFragment.set("/search", {
      search: { results: [{ documentId: "doc-1", pageNumber: 1, text: "RAG grounds answers in retrieved snippets." }] },
    });
    const llmAnswer = [
      "RAG grounds answers in retrieved snippets.",
      "",
      "```json",
      '{"citations":[{"documentId":"doc-1","page":1,"quote":"RAG grounds answers"}]}',
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      calls: [] as Array<{ path: string; init: RequestInit }>,
      async forward(path: string, init: RequestInit) {
        (this.calls as Array<{ path: string; init: RequestInit }>).push({ path, init });
        return Response.json({ choices: [{ message: { content: llmAnswer } }] });
      },
    } as unknown as LlmClient & { calls: Array<{ path: string; init: RequestInit }> };
    const scenarioRegistry = new FakeScenarioRegistry();
    const liveEnv = { ...testEnv, GROUNDX_SAMPLES_BUCKET_ID: 28454 };
    const app = createApp({ env: liveEnv, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });

    const agent = request.agent(app);
    const created = await agent.post("/api/onboarding/session").expect(200);
    // The posting agent must ACTUALLY OWN the row for the legitimate
    // owner→own-thread 200 path to pass once the ownership guard lands
    // (§4 #19 follow-up, Finding 3). ownerAnonId === the agent's real
    // cookie session id, not an unrelated planted id.
    const sid: string = created.body.sessionId;

    // Seed a chat session so the handler can find it.
    const now = new Date();
    await repository.upsertChatSession({
      id: "chat-1",
      onboardingSessionId: "onb-1",
      ownerUserId: null,
      ownerAnonId: sid,
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
    expect(response.body.reply.answer).toBe("RAG grounds answers in retrieved snippets.");
    expect(response.body.compressionRan).toBe(false);

    const messages = await repository.listChatMessages("chat-1");
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    // The live path hit BOTH upstream clients (no mock short-circuit).
    expect((llmClient as unknown as { calls: unknown[] }).calls.length).toBeGreaterThan(0);
    expect(groundxClient.calls.length).toBeGreaterThan(0);
  });

  // Finding 3 (§4 #19 follow-up) — MAJOR IDOR. The route was gated only by
  // requireSession (cookie-exists), with NO ownership check, so any visitor
  // could POST a victim's chatSessionId and write into / read the assistant
  // reply from another user's thread. Mirror the 6 sibling mutating routes:
  // load the row, 403 not_session_owner on a non-owner.
  it("POST /api/chat/messages returns 403 when the caller doesn't own the chat session", async () => {
    const { app, repository } = setup();
    // Plant a chat_session owned by a DIFFERENT anon id (the victim).
    const now = new Date();
    await repository.upsertChatSession({
      id: "chat-victim",
      onboardingSessionId: "chat-victim",
      ownerUserId: null,
      ownerAnonId: "anon-VICTIM",
      title: "Victim's thread",
      isOnboarding: true,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    // The attacker bootstraps a fresh anon session — a different cookie id.
    const attacker = request.agent(app);
    await attacker.post("/api/onboarding/session").expect(200);
    await attacker
      .post("/api/chat/messages")
      .send({ chatSessionId: "chat-victim", newUserMessage: "leak the thread" })
      .expect(403, { error: "not_session_owner" });
    // The guard runs BEFORE handleChatMessage — the victim thread is untouched.
    const messages = await repository.listChatMessages("chat-victim");
    expect(messages).toHaveLength(0);
  });

  // Finding 1 (creative review, step 2-7l) — the AUTHED arm of
  // assertChatSessionOwnership (ownerUserId === groundxUsername) was only
  // UNIT-tested (sessionOwnership.test.ts); at the HTTP layer ONLY the anon
  // arm was exercised, so inverting the authed arm left app.test.ts fully
  // green. Drive the authed branch end-to-end: an AUTHENTICATED user
  // (logged in as gx-user) is 403'd POSTing to a chat_session owned by a
  // DIFFERENT customer id. (Defense-in-depth — the production code is
  // already correct.)
  it("POST /api/chat/messages returns 403 when an authed user doesn't own the session (authed arm)", async () => {
    const { app, repository } = setup();
    // Plant a chat_session owned by a DIFFERENT gx customer (authed owner).
    const now = new Date();
    await repository.upsertChatSession({
      id: "chat-other-customer",
      onboardingSessionId: "chat-other-customer",
      ownerUserId: "gx-other-customer",
      ownerAnonId: null,
      title: "Another customer's thread",
      isOnboarding: false,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    // Authenticate — the agent's session becomes authed as gx-user.
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    await agent
      .post("/api/chat/messages")
      .send({ chatSessionId: "chat-other-customer", newUserMessage: "leak the other customer's thread" })
      .expect(403, { error: "not_session_owner" });
    // The guard runs BEFORE handleChatMessage — the foreign thread is untouched.
    const messages = await repository.listChatMessages("chat-other-customer");
    expect(messages).toHaveLength(0);
  });

  it("GET /api/chat-sessions/:id/messages returns 403 when an authed user doesn't own the session (authed arm)", async () => {
    const { app, repository } = setup();
    const now = new Date();
    await repository.upsertChatSession({
      id: "cs-other-customer",
      onboardingSessionId: "cs-other-customer",
      ownerUserId: "gx-other-customer",
      ownerAnonId: null,
      title: "Another customer's",
      isOnboarding: false,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    await agent
      .get("/api/chat-sessions/cs-other-customer/messages")
      .expect(403, { error: "not_session_owner" });
  });

  // Finding 2 (§4 #19 follow-up) — the messages-hydrate GET 403 path (its
  // error code was reconciled chat_session_forbidden→not_session_owner in
  // #19) had NO route-level 403 test. Lock the reconciled contract.
  it("GET /api/chat-sessions/:id/messages returns 403 when the caller doesn't own the session", async () => {
    const { app, repository } = setup();
    const now = new Date();
    await repository.upsertChatSession({
      id: "cs-foreign",
      onboardingSessionId: "cs-foreign",
      ownerUserId: null,
      ownerAnonId: "anon-OWNER",
      title: "Someone else's",
      isOnboarding: true,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    });
    const intruder = request.agent(app);
    await intruder.post("/api/onboarding/session").expect(200); // a different session id
    await intruder
      .get("/api/chat-sessions/cs-foreign/messages")
      .expect(403, { error: "not_session_owner" });
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
  // Finding 6 (§4 #19 follow-up) — pre-existing sibling IDOR. The upsert was
  // gated only by requireSession; a repeat POST with a foreign id overwrote
  // owner_anon_id via ON DUPLICATE KEY UPDATE, letting an anon caller graft
  // their cookie onto a foreign row. Guard: an existing row the caller does
  // not own → 403; a true create (no row yet) still succeeds; the legitimate
  // owner re-upserting their OWN row still succeeds (idempotent retry/rehydrate).
  describe("POST /api/chat-sessions ownership (Finding 6)", () => {
    it("returns 403 when re-upserting a row owned by someone else", async () => {
      const { app, repository } = setup();
      const now = new Date();
      await repository.upsertChatSession({
        id: "chat-owned",
        onboardingSessionId: "chat-owned",
        ownerUserId: null,
        ownerAnonId: "anon-OWNER",
        title: "Owner's",
        isOnboarding: true,
        activeEntityKey: null,
        currentIntent: null,
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      });
      const attacker = request.agent(app);
      await attacker.post("/api/onboarding/session").expect(200);
      await attacker
        .post("/api/chat-sessions")
        .send({ id: "chat-owned", title: "hijacked", isOnboarding: true })
        .expect(403, { error: "not_session_owner" });
      // The row's owner is unchanged — no graft.
      const row = await repository.getChatSession("chat-owned");
      expect(row?.ownerAnonId).toBe("anon-OWNER");
    });

    it("still allows the legitimate owner to re-upsert their own row (idempotent)", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "chat-mine", title: "Mine", isOnboarding: true })
        .expect(200);
      // Repeat POST (client retry / rehydrate) — same owner, still 200.
      await agent
        .post("/api/chat-sessions")
        .send({ id: "chat-mine", title: "Mine v2", isOnboarding: true })
        .expect(200);
    });
  });

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
  describe("POST /api/templates (shared-template-lifecycle Phase 3)", () => {
    const body = {
      categories: [
        { id: "statement", type: "statement", name: "Statement", fields: [{ id: "total_tax", name: "Total tax", type: "NUMBER", description: "d" }] },
      ],
    };

    it("rejects unauthenticated requests with 401", async () => {
      const { app } = setup();
      await request(app)
        .post("/api/templates")
        .send({ id: "es-1", kind: "extract", name: "Utility", body })
        .expect(401);
    });

    it("returns 400 for malformed payload (missing fields / bad kind)", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
      await agent.post("/api/templates").send({ id: "es-1" }).expect(400, { error: "invalid_payload" });
      await agent.post("/api/templates").send({ id: "es-1", kind: "extract", name: "X" }).expect(400, { error: "invalid_payload" });
      await agent.post("/api/templates").send({ id: "es-1", kind: "bogus", name: "X", body }).expect(400, { error: "invalid_payload" });
      // whitespace-only name is rejected (the route's trim guard).
      await agent.post("/api/templates").send({ id: "es-1", kind: "extract", name: "   ", body }).expect(400, { error: "invalid_payload" });
    });

    it("persists a template scoped to the authed user (round-trip)", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

      const response = await agent
        .post("/api/templates")
        .send({ id: "es-1", kind: "extract", name: "Utility (custom)", body })
        .expect(200);
      expect(response.body).toMatchObject({ id: "es-1", name: "Utility (custom)" });

      const rows = await repository.listTemplates("gx-user", "extract");
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe("es-1");
      expect(rows[0].kind).toBe("extract");
      expect(rows[0].name).toBe("Utility (custom)");
      const parsed = JSON.parse(rows[0].bodyJson) as { categories: { id: string }[] };
      expect(parsed.categories[0].id).toBe("statement");
    });

    it("upserts on the same id (second POST overwrites name + body)", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

      await agent.post("/api/templates").send({ id: "es-1", kind: "extract", name: "v1", body: { categories: [] } }).expect(200);
      await agent
        .post("/api/templates")
        .send({ id: "es-1", kind: "extract", name: "v2", body: { categories: [{ id: "x", type: "statement", name: "X", fields: [] }] } })
        .expect(200);

      const rows = await repository.listTemplates("gx-user", "extract");
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("v2");
      const parsed = JSON.parse(rows[0].bodyJson) as { categories: { id: string }[] };
      expect(parsed.categories[0].id).toBe("x");
    });

    it("🔒 owner is the SESSION user — a client-supplied owner in the body is ignored", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

      await agent
        .post("/api/templates")
        // attacker tries to assert a different owner via the wire
        .send({ id: "es-1", kind: "extract", name: "Owned", body, ownerUsername: "attacker", groundxUsername: "attacker" })
        .expect(200);

      // Persisted under the session user (gx-user), not the injected owner.
      expect(await repository.listTemplates("gx-user", "extract")).toHaveLength(1);
      expect(await repository.listTemplates("attacker", "extract")).toHaveLength(0);
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

    it("returns a typed value envelope via the live extract path (NUMBER field)", async () => {
      const repository = new MemoryAppRepository();
      const partnerClient = new FakePartnerClient();
      // Inject fakes at the seam (2026-06-01-retire-mock-mode — no mock mode):
      // GroundX returns a snippet, the LLM extracts a typed NUMBER + citation.
      const groundxClient = new FakeGroundXClient();
      groundxClient.responseByPathFragment.set("/search", {
        search: { results: [{ documentId: "utility-bill-2026-04", pageNumber: 1, text: "Total tax: $42.00" }] },
      });
      const llmClient: LlmClient = {
        forward: async () =>
          Response.json({
            choices: [{ message: { content: '{"value": 42, "confidence": 0.9, "citation": {"documentId": "utility-bill-2026-04", "page": 1, "quote": "Total tax: $42.00"}}' } }],
          }),
      };
      const scenarioRegistry = new FakeScenarioRegistry();
      const app = createApp({ env: testEnv, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });
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

      // The contract is: shape is fixed; downstream UI renders both states.
      expect(response.body).toHaveProperty("value");
      expect(response.body).toHaveProperty("confidence");
      expect(typeof response.body.confidence).toBe("number");
      if (response.body.value !== null) {
        expect(typeof response.body.value).toBe("number");
      }
    });

    // Regression: the route used to call
    // `repository.getChatSessionEntity(...)` which doesn't exist on
    // AppRepository (only `listChatSessionEntities` does). The bug
    // was silent because no test had ever exercised the path where
    // `chatSession.activeEntityKey` was set. With the entity set,
    // the route 500'd at runtime with "is not a function".
    it("succeeds when chatSession has an active entity (regression: missing getChatSessionEntity method)", async () => {
      const repository = new MemoryAppRepository();
      const partnerClient = new FakePartnerClient();
      const groundxClient = new FakeGroundXClient();
      const llmClient = new FakeLlmClient();
      const scenarioRegistry = new FakeScenarioRegistry();
      const app = createApp({ env: testEnv, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "chat-1", title: "Onboarding", isOnboarding: true, activeEntityKey: "sample:utility" })
        .expect(200);
      // Seed the entity directly so the route's scope-derivation path
      // has something to read.
      await repository.upsertChatSessionEntity({
        chatSessionId: "chat-1",
        entityKey: "sample:utility",
        lastFrame: "f3",
        completedFramesJson: JSON.stringify(["f1", "f2"]),
        scanProgressJson: null,
        extractedValuesJson: null,
        bucketId: null,
        groupId: null,
        documentIdsJson: null,
        projectIdsJson: null,
        createdAt: new Date(),
        lastVisitedAt: new Date(),
      });
      const response = await agent
        .post("/api/extract-field")
        .send({
          chatSessionId: "chat-1",
          field: { name: "total", type: "NUMBER", description: "Total amount due." },
        })
        .expect(200);
      expect(response.body).toHaveProperty("value");
      expect(response.body).toHaveProperty("confidence");
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

describe("POST /api/widgets/smart-report/reports/render (smart-report Phase 6 — route contract, live path)", () => {
  // The samples bucket the Utility report scope sits in. A scope on this
  // bucket is a sample preview; any other bucket is BYO → gate (#10).
  const SAMPLES_BUCKET = 28454;

  // 2026-06-01-retire-mock-mode: the render route's MOCK_MODE fixture path is
  // gone — these route-contract tests now drive the LIVE render with a persisted
  // 4-section template + grounded fakes injected at the dependency seam. The
  // four sections + their cited bodies are produced by the live search → grounded
  // LLM → WF-06b verify path, not an in-code fixture.
  const UTILITY_TEMPLATE_BODY = {
    sections: [
      { id: "billing_summary", name: "billing_summary", renderAs: "PARAGRAPH", question: "Summarize the billing period and total.", variables: [] },
      { id: "charge_breakdown", name: "charge_breakdown", renderAs: "TABLE", question: "Break down the charges.", variables: [] },
      { id: "anomalies", name: "anomalies", renderAs: "BULLETS", question: "List anomalies.", variables: [] },
      { id: "recommendation", name: "recommendation", renderAs: "PARAGRAPH", question: "Recommend next steps.", variables: [] },
    ],
  };

  function groundedLlm(): LlmClient {
    const llmAnswer = [
      "The total amount due is $18,742.16.",
      "",
      "```json",
      '{"citations":[{"documentId":"utility-bill-2026-04","page":1,"quote":"total amount due is $18,742.16"}]}',
      "```",
    ].join("\n");
    return { forward: async () => Response.json({ choices: [{ message: { content: llmAnswer } }] }) };
  }

  function searchHit(): GroundXClient {
    return {
      forward: async () =>
        Response.json({ search: { results: [{ documentId: "utility-bill-2026-04", text: "total amount due is $18,742.16" }] } }),
    };
  }

  async function renderSetup() {
    const repository = new MemoryAppRepository();
    const partnerClient = new FakePartnerClient();
    const scenarioRegistry = new FakeScenarioRegistry();
    const liveEnv = { ...testEnv, GROUNDX_SAMPLES_BUCKET_ID: SAMPLES_BUCKET };
    const app = createApp({
      env: liveEnv,
      repository,
      partnerClient,
      groundxClient: searchHit(),
      llmClient: groundedLlm(),
      scenarioRegistry,
    });
    // Persist the 4-section Utility template (server source of truth).
    const now = new Date();
    await repository.saveTemplate({
      id: "rt-utility-ic-brief",
      kind: "report",
      groundxUsername: "owner",
      name: "Utility IC Brief",
      bodyJson: JSON.stringify(UTILITY_TEMPLATE_BODY),
      createdAt: now,
      updatedAt: now,
    });
    return { app, repository };
  }

  async function ownedAgent(app: ReturnType<typeof createApp>) {
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    await agent
      .post("/api/chat-sessions")
      .send({ id: "chat-1", title: "Onboarding", isOnboarding: true })
      .expect(200);
    return agent;
  }

  const utilityScope = {
    type: "bucket",
    bucketId: SAMPLES_BUCKET,
    filter: { projectId: "proj_c7701da7-0e08-482a-a496-df9dfe991613" },
  };

  function renderBody(overrides: Record<string, unknown> = {}) {
    return {
      template_id: "rt-utility-ic-brief",
      scope: utilityScope,
      variables: {},
      section_ids: null,
      chat_session_id: "chat-1",
      parent_message_id: null,
      ...overrides,
    };
  }

  it("rejects requests without a session cookie", async () => {
    const { app } = await renderSetup();
    await request(app)
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody())
      .expect(401);
  });

  it("returns 400 for a malformed payload (missing template_id / bad scope)", async () => {
    const { app } = await renderSetup();
    const agent = await ownedAgent(app);
    await agent
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody({ template_id: undefined }))
      .expect(400, { error: "invalid_payload" });
    await agent
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody({ scope: { type: "nope" } }))
      .expect(400, { error: "invalid_payload" });
  });

  it("404 when the chat session row doesn't exist; 403 when not owned", async () => {
    const { app } = await renderSetup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    // No chat-1 row created → 404.
    await agent
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody())
      .expect(404);
    // Owner-A creates chat-1; owner-B (fresh anon) can't render it → 403.
    const ownerA = await ownedAgent(app);
    void ownerA;
    const ownerB = request.agent(app);
    await ownerB.post("/api/onboarding/session").expect(200);
    await ownerB
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody())
      .expect(403);
  });

  it("returns the four ordered Utility sections (snake_case wire), preview_only", async () => {
    const { app } = await renderSetup();
    const agent = await ownedAgent(app);
    const res = await agent
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody())
      .expect(200);
    expect(res.body.status).toBe("complete");
    expect(res.body.preview_only).toBe(true);
    expect(res.body.template_id).toBe("rt-utility-ic-brief");
    expect(res.body.sections.map((s: { name: string }) => s.name)).toEqual([
      "billing_summary",
      "charge_breakdown",
      "anomalies",
      "recommendation",
    ]);
    expect(res.body.sections[0]).toHaveProperty("render_as");
    expect(res.body.sections[0]).toHaveProperty("cites");
    expect(res.body.sections[0].cites[0].documentId).toBe("utility-bill-2026-04");
  });

  it("section_ids subset scopes a re-render to those sections only", async () => {
    const { app } = await renderSetup();
    const agent = await ownedAgent(app);
    const res = await agent
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody({ section_ids: ["anomalies"] }))
      .expect(200);
    expect(res.body.sections.map((s: { name: string }) => s.name)).toEqual(["anomalies"]);
  });

  it("a BYO scope returns the gate envelope (#10), not a render", async () => {
    const { app } = await renderSetup();
    const agent = await ownedAgent(app);
    const res = await agent
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody({ scope: { type: "bucket", bucketId: 70001 } }))
      .expect(200);
    expect(res.body.gated).toBe(true);
    expect(res.body.gate).toBe("byo");
  });

  it("a multi-doc group ContentScope renders live", async () => {
    const { app, repository } = await renderSetup();
    // The group scope resolves a multi-doc set; persist a template for it.
    const now = new Date();
    await repository.saveTemplate({
      id: "rt-solar-portfolio",
      kind: "report",
      groundxUsername: "owner",
      name: "Solar Portfolio",
      bodyJson: JSON.stringify({ sections: [UTILITY_TEMPLATE_BODY.sections[0]] }),
      createdAt: now,
      updatedAt: now,
    });
    const agent = await ownedAgent(app);
    const res = await agent
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody({ template_id: "rt-solar-portfolio", scope: { type: "group", groupId: 9001 } }))
      .expect(200);
    expect(res.body.status).toBe("complete");
    expect(res.body.sections.length).toBeGreaterThan(0);
  });

  // The unresolved-variable + no-source degradations are exercised against the
  // live render path in reportRenderer.test.ts §4 (the former MOCK_MODE edge
  // fixtures are gone). This route-contract block covers auth / payload /
  // ownership / gate / ordering only.
});

describe("POST /api/widgets/smart-report/reports/render — live path (2026-06-01-live-report-render)", () => {
  const SAMPLES_BUCKET = 28454;
  const utilityScope = {
    type: "bucket",
    bucketId: SAMPLES_BUCKET,
    filter: { projectId: "proj_c7701da7-0e08-482a-a496-df9dfe991613" },
  };

  function liveSetup(llmClient: LlmClient, groundxClient: GroundXClient) {
    const repository = new MemoryAppRepository();
    const partnerClient = new FakePartnerClient();
    const scenarioRegistry = new FakeScenarioRegistry();
    // The live render path + the samples bucket. There is no MOCK_MODE.
    const liveEnv = { ...testEnv, GROUNDX_SAMPLES_BUCKET_ID: SAMPLES_BUCKET };
    const app = createApp({ env: liveEnv, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });
    return { app, repository };
  }

  async function ownedAgent(app: ReturnType<typeof createApp>) {
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    await agent
      .post("/api/chat-sessions")
      .send({ id: "chat-1", title: "Onboarding", isOnboarding: true })
      .expect(200);
    return agent;
  }

  function renderBody(overrides: Record<string, unknown> = {}) {
    return {
      template_id: "rt-persisted-1",
      scope: utilityScope,
      // The request body MUST NOT supply section questions — the live path reads
      // them from the persisted template. Even if a malicious body carried a
      // `questions` field, the route ignores it (RenderReportRequest has no such
      // field). We include a bogus one here to prove it is never used.
      questions: ["INJECTED — must be ignored"],
      variables: {},
      section_ids: null,
      chat_session_id: "chat-1",
      parent_message_id: null,
      ...overrides,
    };
  }

  it("a template_id with no persisted template returns the graceful no-template state, not an error", async () => {
    // Clients that THROW if called — proves no search/LLM ran for no-template.
    const llmClient: LlmClient = {
      forward: async () => { throw new Error("llm must not be called for no-template"); },
    };
    const groundxClient: GroundXClient = {
      forward: async () => { throw new Error("groundx must not be called for no-template"); },
    };
    const { app } = liveSetup(llmClient, groundxClient);
    const agent = await ownedAgent(app);
    const res = await agent
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody({ template_id: "does-not-exist" }))
      .expect(200);
    expect(res.body.status).toBe("complete");
    expect(res.body.sections).toEqual([]);
    expect(res.body.preview_only).toBe(true);
    expect(res.body.reason).toBe("no_template");
  });

  it("loads the persisted template from the repo (server source) and renders its sections live", async () => {
    const llmAnswer = [
      "The total amount due is $18,742.16.",
      "```json",
      '{"citations":[{"documentId":"utility-bill-2026-04","page":1,"quote":"total amount due is $18,742.16"}]}',
      "```",
    ].join("\n");
    const llmClient: LlmClient = {
      forward: async () =>
        Response.json({ choices: [{ message: { content: llmAnswer } }] }),
    };
    const groundxClient: GroundXClient = {
      forward: async () =>
        Response.json({ search: { results: [{ documentId: "utility-bill-2026-04", text: "total amount due is $18,742.16" }] } }),
    };
    const { app, repository } = liveSetup(llmClient, groundxClient);
    // Persist a REAL report template (server source of truth) — its question is
    // what the live path searches, NOT anything from the request body.
    const now = new Date();
    await repository.saveTemplate({
      id: "rt-persisted-1",
      kind: "report",
      groundxUsername: "owner",
      name: "Persisted Report",
      bodyJson: JSON.stringify({
        sections: [
          {
            id: "billing_summary",
            name: "billing_summary",
            renderAs: "PARAGRAPH",
            question: "What is the total amount due?",
            variables: [],
          },
        ],
      }),
      createdAt: now,
      updatedAt: now,
    });
    const agent = await ownedAgent(app);
    const res = await agent
      .post("/api/widgets/smart-report/reports/render")
      .send(renderBody())
      .expect(200);
    expect(res.body.status).toBe("complete");
    expect(res.body.sections.map((s: { name: string }) => s.name)).toEqual(["billing_summary"]);
    expect(res.body.sections[0].body).toBe("The total amount due is $18,742.16.");
    expect(res.body.sections[0].cites[0].documentId).toBe("utility-bill-2026-04");
    // The verified citation carries a WF-06b tier.
    expect(["exact", "paraphrase", "ambient"]).toContain(res.body.sections[0].cites[0].tier);
  });
});

describe("POST /api/widgets/smart-report/reports (smart-report Phase 6 — Save)", () => {
  function saveSetup() {
    const repository = new MemoryAppRepository();
    const partnerClient = new FakePartnerClient();
    const groundxClient = new FakeGroundXClient();
    const llmClient = new FakeLlmClient();
    const scenarioRegistry = new FakeScenarioRegistry();
    const app = createApp({ env: testEnv, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });
    return { app, repository };
  }

  const template = {
    id: "rt-utility-ic-brief",
    name: "Utility IC Brief",
    format: "ic-brief",
    sections: [
      {
        id: "billing_summary",
        name: "billing_summary",
        renderAs: "PARAGRAPH",
        question: "Summarize the billing period and total.",
        variables: [],
        instructions: "Cite the total",
      },
    ],
  };

  it("401 for an anonymous caller (Save is sign-in gated)", async () => {
    const { app } = saveSetup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    await agent
      .post("/api/widgets/smart-report/reports")
      .send({ template })
      .expect(401);
  });

  it("persists the report template for a signed-in member via the shared saveTemplate API", async () => {
    const { app, repository } = saveSetup();
    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .set("Authorization", `Basic ${Buffer.from("pat@example.com:secret").toString("base64")}`)
      .send({ customer: { first: "Pat" } })
      .expect(200);
    const res = await agent
      .post("/api/widgets/smart-report/reports")
      .send({ template })
      .expect(200);
    expect(res.body.id).toBe("rt-utility-ic-brief");
    const saved = await repository.getTemplate("rt-utility-ic-brief");
    expect(saved).toBeTruthy();
    expect(saved!.kind).toBe("report");
    expect(saved!.name).toBe("Utility IC Brief");
  });

  it("400 for a malformed template body", async () => {
    const { app } = saveSetup();
    const agent = request.agent(app);
    await agent
      .post("/api/auth/register")
      .set("Authorization", `Basic ${Buffer.from("pat@example.com:secret").toString("base64")}`)
      .send({ customer: { first: "Pat" } })
      .expect(200);
    await agent
      .post("/api/widgets/smart-report/reports")
      .send({ template: { id: "x" } })
      .expect(400, { error: "invalid_payload" });
  });
});

// 2026-06-01-authed-project-create-grant — the first production writer of a
// `user` grant: an authed customer creates a project (→ owner grant) and shares
// it with another GroundX username (→ viewer/editor grant). The round-trip into
// the RBAC read path is asserted via authorizedProjectIds.
describe("authed project-create + share grant", () => {
  async function loginGxUser(app: import("express").Express) {
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    return agent; // FakePartnerClient logs in as "gx-user"
  }

  it("POST /api/projects creates a project + an owner grant the creator can read", async () => {
    const { app, repository } = setup();
    const agent = await loginGxUser(app);

    const res = await agent.post("/api/projects").send({ name: "Q1 Filings", bucketId: 42 }).expect(201);
    const projectId: string = res.body.project.projectId;
    expect(projectId).toMatch(/^proj_/);
    expect(res.body.project).toMatchObject({ name: "Q1 Filings", bucketId: 42, isSample: false, role: "owner" });

    // Persisted: project row + owner user-grant.
    expect(await repository.getProject(projectId)).toMatchObject({ ownerUsername: "gx-user", isSample: false });
    const grants = await repository.listGrantsForPrincipal("gx-user");
    expect(grants).toContainEqual(
      expect.objectContaining({ projectId, principalType: "user", principalUsername: "gx-user", role: "owner" }),
    );
    // RBAC read round-trip.
    expect(await authorizedProjectIds(repository, "gx-user")).toContain(projectId);
    expect(await authorizedProjectIds(repository, "someone-else")).not.toContain(projectId);
  });

  it("POST /api/projects is sign-in gated (401 for anon) and 400 for a bad body", async () => {
    const { app } = setup();
    await request(app).post("/api/projects").send({ name: "X", bucketId: 1 }).expect(401);

    const agent = await loginGxUser(app);
    await agent.post("/api/projects").send({ name: "", bucketId: 1 }).expect(400, { error: "invalid_payload" });
    await agent.post("/api/projects").send({ name: "X" }).expect(400, { error: "invalid_payload" });
    await agent.post("/api/projects").send({ name: "X", bucketId: -3 }).expect(400, { error: "invalid_payload" });
  });

  it("POST /api/projects/:id/grants — owner shares; the sharee's read set gains it", async () => {
    const { app, repository, partnerClient } = setup();
    const agent = await loginGxUser(app);
    const projectId: string = (await agent.post("/api/projects").send({ name: "P", bucketId: 7 }).expect(201)).body
      .project.projectId;

    const res = await agent
      .post(`/api/projects/${projectId}/grants`)
      .send({ principalUsername: "gx-other", role: "viewer" })
      .expect(201);
    expect(res.body.grant).toMatchObject({ projectId, principalUsername: "gx-other", role: "viewer" });

    // Target existence was validated via the Partner API.
    expect(partnerClient.calls.some((c) => c.name === "getCustomer" && c.input === "gx-other")).toBe(true);
    // RBAC read round-trip for the sharee.
    expect(await authorizedProjectIds(repository, "gx-other")).toContain(projectId);
  });

  it("share is owner-only (403), rejects self-share (400), unknown project (404), unknown target (404)", async () => {
    const { app, repository, partnerClient } = setup();
    const agent = await loginGxUser(app); // "gx-user"

    // A project owned by someone else → gx-user is not the owner → 403.
    const now = new Date();
    await repository.insertProject({
      projectId: "proj_foreign",
      bucketId: 1,
      name: "Foreign",
      ownerUsername: "owner-x",
      isSample: false,
      createdAt: now,
      updatedAt: now,
    });
    await repository.insertProjectGrant({
      projectId: "proj_foreign",
      principalType: "user",
      principalUsername: "owner-x",
      role: "owner",
      createdAt: now,
    });
    await agent
      .post("/api/projects/proj_foreign/grants")
      .send({ principalUsername: "gx-other", role: "viewer" })
      .expect(403, { error: "not_project_owner" });

    // Owned project for the remaining cases.
    const projectId: string = (await agent.post("/api/projects").send({ name: "P", bucketId: 7 }).expect(201)).body
      .project.projectId;

    await agent
      .post(`/api/projects/${projectId}/grants`)
      .send({ principalUsername: "gx-user", role: "viewer" })
      .expect(400, { error: "cannot_share_with_self" });

    await agent
      .post("/api/projects/proj_missing/grants")
      .send({ principalUsername: "gx-other", role: "viewer" })
      .expect(404, { error: "project_not_found" });

    partnerClient.missingCustomers.add("ghost");
    await agent
      .post(`/api/projects/${projectId}/grants`)
      .send({ principalUsername: "ghost", role: "editor" })
      .expect(404, { error: "principal_not_found" });

    // A bad role is a 400.
    await agent
      .post(`/api/projects/${projectId}/grants`)
      .send({ principalUsername: "gx-other", role: "admin" })
      .expect(400, { error: "invalid_payload" });
  });
});
