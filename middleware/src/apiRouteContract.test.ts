import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { MemoryAppRepository } from "./db/memoryRepository.js";
import { FakeGroundXClient, FakeLlmClient, FakePartnerClient, testEnv } from "./test/fakes.js";

function setup() {
  const repository = new MemoryAppRepository();
  const partnerClient = new FakePartnerClient();
  const groundxClient = new FakeGroundXClient();
  const llmClient = new FakeLlmClient();
  const app = createApp({ env: testEnv, repository, partnerClient, groundxClient, llmClient });
  return { app, partnerClient, groundxClient, llmClient, repository };
}

type Method = "get" | "post" | "put" | "patch" | "delete";

const publicAuthCases: Array<{ name: string; method: Method; path: string; partnerCall: string; body?: unknown; auth?: string }> = [
  {
    name: "register",
    method: "post",
    path: "/api/auth/register",
    partnerCall: "registerCustomer",
    body: { customer: { first: "Pat" } },
    auth: "pat@example.com:secret",
  },
  {
    name: "login",
    method: "post",
    path: "/api/auth/login",
    partnerCall: "loginCustomer",
    body: { email: "pat@example.com", password: "secret" },
  },
  {
    name: "password reset",
    method: "post",
    path: "/api/auth/password/reset",
    partnerCall: "requestPasswordReset",
    body: { email: "pat@example.com" },
  },
  {
    name: "password confirm",
    method: "post",
    path: "/api/auth/password/confirm",
    partnerCall: "confirmPasswordReset",
    body: { email: "pat@example.com", newPassword: "secret", code: "123456" },
  },
];

const appOwnedCases: Array<{ name: string; method: Method; path: string; body?: unknown }> = [
  { name: "auth me", method: "get", path: "/api/auth/me" },
  { name: "metadata update", method: "patch", path: "/api/me/metadata", body: { onboardingState: "complete" } },
  { name: "logout", method: "post", path: "/api/auth/logout" },
];

const groundxProxyCases: Array<{ name: string; method: Method; browserPath: string; upstreamPath: string; body?: unknown }> = [
  { name: "API key list", method: "get", browserPath: "/api/v1/apikey", upstreamPath: "/apikey" },
  { name: "API key create", method: "post", browserPath: "/api/v1/apikey", upstreamPath: "/apikey", body: { name: "app" } },
  { name: "API key update", method: "put", browserPath: "/api/v1/apikey/gx-key", upstreamPath: "/apikey/gx-key", body: { name: "renamed" } },
  { name: "API key delete", method: "delete", browserPath: "/api/v1/apikey/gx-key", upstreamPath: "/apikey/gx-key" },
  { name: "bucket list", method: "get", browserPath: "/api/v1/bucket?n=10", upstreamPath: "/bucket?n=10" },
  { name: "bucket create", method: "post", browserPath: "/api/v1/bucket", upstreamPath: "/bucket", body: { name: "docs" } },
  { name: "bucket get", method: "get", browserPath: "/api/v1/bucket/7", upstreamPath: "/bucket/7" },
  { name: "bucket update", method: "put", browserPath: "/api/v1/bucket/7", upstreamPath: "/bucket/7", body: { newName: "renamed" } },
  { name: "bucket delete", method: "delete", browserPath: "/api/v1/bucket/7", upstreamPath: "/bucket/7" },
  { name: "customer get", method: "get", browserPath: "/api/v1/customer", upstreamPath: "/customer" },
  { name: "ingest copy", method: "post", browserPath: "/api/v1/ingest/copy", upstreamPath: "/ingest/copy", body: { documentIds: ["doc"], bucketId: 7 } },
  {
    name: "remote ingest",
    method: "post",
    browserPath: "/api/v1/ingest/documents/remote",
    upstreamPath: "/ingest/documents/remote",
    body: { documents: [{ bucketId: 7, sourceUrl: "https://example.com/a.pdf" }] },
  },
  { name: "local ingest", method: "post", browserPath: "/api/v1/ingest/documents/local", upstreamPath: "/ingest/documents/local", body: {} },
  {
    name: "website ingest",
    method: "post",
    browserPath: "/api/v1/ingest/documents/website",
    upstreamPath: "/ingest/documents/website",
    body: { websites: [{ bucketId: 7, sourceUrl: "https://example.com" }] },
  },
  { name: "document list", method: "get", browserPath: "/api/v1/ingest/documents", upstreamPath: "/ingest/documents" },
  { name: "document update", method: "put", browserPath: "/api/v1/ingest/documents", upstreamPath: "/ingest/documents", body: { documents: [] } },
  { name: "documents delete", method: "delete", browserPath: "/api/v1/ingest/documents", upstreamPath: "/ingest/documents", body: { documentIds: ["doc"] } },
  { name: "document lookup", method: "get", browserPath: "/api/v1/ingest/documents/doc", upstreamPath: "/ingest/documents/doc" },
  { name: "document get", method: "get", browserPath: "/api/v1/ingest/document/doc", upstreamPath: "/ingest/document/doc" },
  { name: "document delete", method: "delete", browserPath: "/api/v1/ingest/document/doc", upstreamPath: "/ingest/document/doc" },
  { name: "document extract", method: "get", browserPath: "/api/v1/ingest/document/extract/doc", upstreamPath: "/ingest/document/extract/doc" },
  { name: "document xray", method: "get", browserPath: "/api/v1/ingest/document/xray/doc", upstreamPath: "/ingest/document/xray/doc" },
  { name: "ingest status", method: "get", browserPath: "/api/v1/ingest/proc", upstreamPath: "/ingest/proc" },
  { name: "ingest cancel", method: "delete", browserPath: "/api/v1/ingest/proc", upstreamPath: "/ingest/proc" },
  { name: "process list", method: "get", browserPath: "/api/v1/ingest", upstreamPath: "/ingest" },
  { name: "group list", method: "get", browserPath: "/api/v1/group?n=10", upstreamPath: "/group?n=10" },
  { name: "group create", method: "post", browserPath: "/api/v1/group", upstreamPath: "/group", body: { name: "docs" } },
  { name: "group get", method: "get", browserPath: "/api/v1/group/7", upstreamPath: "/group/7" },
  { name: "group update", method: "put", browserPath: "/api/v1/group/7", upstreamPath: "/group/7", body: { newName: "renamed" } },
  { name: "group delete", method: "delete", browserPath: "/api/v1/group/7", upstreamPath: "/group/7" },
  { name: "group add bucket", method: "post", browserPath: "/api/v1/group/7/bucket/8", upstreamPath: "/group/7/bucket/8" },
  { name: "group remove bucket", method: "delete", browserPath: "/api/v1/group/7/bucket/8", upstreamPath: "/group/7/bucket/8" },
  { name: "health list", method: "get", browserPath: "/api/v1/health", upstreamPath: "/health" },
  { name: "health service", method: "get", browserPath: "/api/v1/health/search", upstreamPath: "/health/search" },
  { name: "search content", method: "post", browserPath: "/api/v1/search/7?n=5", upstreamPath: "/search/7?n=5", body: { query: "hello" } },
  { name: "search documents", method: "post", browserPath: "/api/v1/search/documents", upstreamPath: "/search/documents", body: { documentIds: ["doc"], query: "hello" } },
  { name: "workflow list", method: "get", browserPath: "/api/v1/workflow", upstreamPath: "/workflow" },
  { name: "workflow create", method: "post", browserPath: "/api/v1/workflow", upstreamPath: "/workflow", body: { name: "wf" } },
  { name: "workflow get", method: "get", browserPath: "/api/v1/workflow/wf", upstreamPath: "/workflow/wf" },
  { name: "workflow update", method: "put", browserPath: "/api/v1/workflow/wf", upstreamPath: "/workflow/wf", body: { name: "wf2" } },
  { name: "workflow delete", method: "delete", browserPath: "/api/v1/workflow/wf", upstreamPath: "/workflow/wf" },
  { name: "account workflow get", method: "get", browserPath: "/api/v1/workflow/relationship", upstreamPath: "/workflow/relationship" },
  { name: "account workflow assign", method: "post", browserPath: "/api/v1/workflow/relationship", upstreamPath: "/workflow/relationship", body: { workflowId: "wf" } },
  { name: "account workflow remove", method: "delete", browserPath: "/api/v1/workflow/relationship", upstreamPath: "/workflow/relationship" },
  { name: "resource workflow assign", method: "post", browserPath: "/api/v1/workflow/relationship/7", upstreamPath: "/workflow/relationship/7", body: { workflowId: "wf" } },
  { name: "resource workflow remove", method: "delete", browserPath: "/api/v1/workflow/relationship/7", upstreamPath: "/workflow/relationship/7" },
];

const partnerProxyCases: Array<{ name: string; method: Method; browserPath: string; upstreamPath: string; body?: unknown; customerKey?: string }> = [
  { name: "customer get", method: "get", browserPath: "/api/customer/gx-user", upstreamPath: "/customer/gx-user" },
  { name: "customer delete", method: "delete", browserPath: "/api/customer/gx-user", upstreamPath: "/customer/gx-user" },
  { name: "API key list", method: "get", browserPath: "/api/apikey", upstreamPath: "/apikey", customerKey: "gx-user" },
  { name: "API key create", method: "post", browserPath: "/api/apikey", upstreamPath: "/apikey", body: { apiKey: { name: "app" } }, customerKey: "gx-user" },
  { name: "API key update", method: "put", browserPath: "/api/apikey/key", upstreamPath: "/apikey/key", body: { apiKey: { name: "renamed" } }, customerKey: "gx-user" },
  { name: "API key delete", method: "delete", browserPath: "/api/apikey/key", upstreamPath: "/apikey/key", customerKey: "gx-user" },
  { name: "bucket list", method: "get", browserPath: "/api/bucket", upstreamPath: "/bucket", customerKey: "gx-user" },
  { name: "bucket create", method: "post", browserPath: "/api/bucket", upstreamPath: "/bucket", body: { bucket: { name: "docs" } }, customerKey: "gx-user" },
  { name: "bucket get", method: "get", browserPath: "/api/bucket/7", upstreamPath: "/bucket/7", customerKey: "gx-user" },
  { name: "bucket update", method: "put", browserPath: "/api/bucket/7", upstreamPath: "/bucket/7", body: { bucket: { name: "renamed" } }, customerKey: "gx-user" },
  { name: "bucket delete", method: "delete", browserPath: "/api/bucket/7", upstreamPath: "/bucket/7", customerKey: "gx-user" },
  { name: "bucket transfer", method: "post", browserPath: "/api/bucket/transfer/7", upstreamPath: "/bucket/transfer/7", customerKey: "gx-user" },
  { name: "group list", method: "get", browserPath: "/api/group", upstreamPath: "/group", customerKey: "gx-user" },
  { name: "group create", method: "post", browserPath: "/api/group", upstreamPath: "/group", body: { group: { name: "docs" } }, customerKey: "gx-user" },
  { name: "group get", method: "get", browserPath: "/api/group/7", upstreamPath: "/group/7", customerKey: "gx-user" },
  { name: "group update", method: "put", browserPath: "/api/group/7", upstreamPath: "/group/7", body: { group: { name: "renamed" } }, customerKey: "gx-user" },
  { name: "group delete", method: "delete", browserPath: "/api/group/7", upstreamPath: "/group/7", customerKey: "gx-user" },
  { name: "project list", method: "get", browserPath: "/api/project", upstreamPath: "/project", customerKey: "gx-user" },
  { name: "project create", method: "post", browserPath: "/api/project", upstreamPath: "/project", body: { project: { name: "app" } }, customerKey: "gx-user" },
  { name: "project update", method: "put", browserPath: "/api/project/7", upstreamPath: "/project/7", body: { project: { name: "renamed" } }, customerKey: "gx-user" },
  { name: "project attach bucket", method: "post", browserPath: "/api/project/kit/7", upstreamPath: "/project/kit/7", body: { project: { bucketId: 8 } }, customerKey: "gx-user" },
  { name: "project detach bucket", method: "delete", browserPath: "/api/project/kit/7", upstreamPath: "/project/kit/7", body: { project: { bucketId: 8 } }, customerKey: "gx-user" },
];

const llmProxyCases = [
  { name: "chat completions", method: "post" as const, browserPath: "/api/llm/chat/completions", upstreamPath: "/chat/completions", body: { messages: [] } },
  { name: "models", method: "get" as const, browserPath: "/api/llm/models?provider=default", upstreamPath: "/models?provider=default" },
];

function send(agent: request.SuperAgentTest, method: Method, path: string, body?: unknown) {
  const req = agent[method](path);
  if (body !== undefined) return req.send(body);
  return req;
}

describe("middleware API route contract", () => {
  it("issues an anonymous onboarding session without auth, scoped to onboarding", async () => {
    const { app } = setup();
    const response = await request(app).post("/api/onboarding/session").expect(200);
    expect(response.body).toMatchObject({ anonymous: true });
    expect(typeof response.body.sessionId).toBe("string");
    expect(response.body.sessionId.length).toBeGreaterThan(0);
    // Cookie is set so subsequent requests resolve as the same anon session.
    expect(response.headers["set-cookie"]?.[0]).toMatch(/gx_app_session=/);
  });

  it("idempotent: a second call within the same cookie returns the same session id (no duplicate row)", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);
    const first = await agent.post("/api/onboarding/session").expect(200);
    const second = await agent.post("/api/onboarding/session").expect(200);
    expect(second.body.sessionId).toBe(first.body.sessionId);
    expect(second.body.anonymous).toBe(true);
    // The repository must hold exactly one session row — a regression that
    // creates a second row while returning the first id would still pass
    // the equality assertion above without this size check.
    expect(repository.sessions.size).toBe(1);
  });

  it("Partner resource proxy returns ANONYMOUS_SESSION when session is unauthenticated", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    // The anon session cookie is now set; without a register/login the
    // Partner resource endpoints (apikey, bucket, group, project, customer)
    // must reject with the stable ANONYMOUS_SESSION code so the app can
    // route the user into the F6 gate.
    const response = await agent.get("/api/apikey").expect(401);
    expect(response.body).toMatchObject({ error: "Sign-in required", code: "ANONYMOUS_SESSION" });
  });

  it("authenticated /api/auth/me returns ANONYMOUS_SESSION when anon", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    const response = await agent.get("/api/auth/me").expect(401);
    expect(response.body.code).toBe("ANONYMOUS_SESSION");
  });

  it("PATCH /api/me/metadata returns ANONYMOUS_SESSION when anon", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    const response = await agent.patch("/api/me/metadata").send({ onboardingState: "x" }).expect(401);
    expect(response.body.code).toBe("ANONYMOUS_SESSION");
  });

  it("serves Prometheus metrics when METRICS_ENABLED", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/metrics").expect(200);
    expect(response.headers["content-type"]).toMatch(/text\/plain/);
    expect(response.text).toContain("http_requests_total");
  });

  it("sets security headers from helmet (CSP, Referrer-Policy, no x-powered-by)", async () => {
    const { app } = setup();
    const response = await request(app).get("/api/healthz").expect(200);
    expect(response.headers["content-security-policy"]).toMatch(/default-src 'self'/);
    expect(response.headers["content-security-policy"]).toMatch(/frame-src .*calendly\.com/);
    expect(response.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });


  it.each(publicAuthCases)("handles public auth route: $name", async ({ auth, body, method, partnerCall, path }) => {
    const { app, partnerClient } = setup();
    let req = request(app)[method](path);
    if (auth) req = req.set("Authorization", `Basic ${Buffer.from(auth).toString("base64")}`);
    if (body !== undefined) req = req.send(body);

    await req.expect(200);

    expect(partnerClient.calls.map((call) => call.name)).toContain(partnerCall);
  });

  it.each(appOwnedCases)("handles app-owned route: $name", async ({ body, method, path }) => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

    await send(agent, method, path, body).expect(200);
  });

  it.each(groundxProxyCases)("forwards GroundX route without local /api/v1 prefix: $name", async ({ body, browserPath, method, upstreamPath }) => {
    const { app, groundxClient } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

    await send(agent, method, browserPath, body).expect(200);

    expect(groundxClient.calls.at(-1)).toMatchObject({
      path: upstreamPath,
      init: expect.objectContaining({ method: method.toUpperCase(), apiKey: "groundx-api-key" }),
    });
  });

  it.each(partnerProxyCases)("forwards Partner route without local /api prefix: $name", async ({ body, browserPath, customerKey, method, upstreamPath }) => {
    const { app, partnerClient } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

    await send(agent, method, browserPath, body).expect(200);

    const call = partnerClient.calls.at(-1);
    expect(call).toMatchObject({
      name: "forward",
      input: expect.objectContaining({
        path: upstreamPath,
        init: expect.objectContaining({ method: method.toUpperCase() }),
      }),
    });
    const init = (call?.input as { init?: RequestInit & { customerKey?: string } })?.init;
    if (customerKey) {
      expect(init).toMatchObject({ customerKey });
    } else {
      expect(init).not.toHaveProperty("customerKey");
    }
  });

  it.each(llmProxyCases)("forwards LLM route without local /api/llm prefix: $name", async ({ body, browserPath, method, upstreamPath }) => {
    const { app, llmClient } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

    await send(agent, method, browserPath, body).expect(200);

    expect(llmClient.calls.at(-1)).toMatchObject({
      path: upstreamPath,
      init: expect.objectContaining({ method: method.toUpperCase() }),
    });
  });
});
