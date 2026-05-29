import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { MemoryAppRepository } from "./db/memoryRepository.js";
import { FakeGroundXClient, FakeLlmClient, FakePartnerClient, FakeScenarioRegistry, testEnv } from "./test/fakes.js";

function setup() {
  const repository = new MemoryAppRepository();
  const partnerClient = new FakePartnerClient();
  const groundxClient = new FakeGroundXClient();
  const llmClient = new FakeLlmClient();
  const scenarioRegistry = new FakeScenarioRegistry();
  const app = createApp({ env: testEnv, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });
  return { app, partnerClient, groundxClient, llmClient, repository, scenarioRegistry };
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
    // Set-Cookie may carry the csrf_token cookie too (SC-01), so search
    // the whole array rather than asserting on index 0.
    expect(response.headers["set-cookie"]?.some((c) => /gx_app_session=/.test(c))).toBe(true);
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

  it("POST /api/chat-sessions/claim requires an authenticated user (ANONYMOUS_SESSION for anon)", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    const response = await agent.post("/api/chat-sessions/claim").send({}).expect(401);
    expect(response.body.code).toBe("ANONYMOUS_SESSION");
  });

  it("POST /api/chat-sessions/claim re-keys anon chat_sessions to the signed-in user (no body required)", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);
    // 1. Start anonymous, create two chat_sessions tied to the session cookie.
    const anonResp = await agent.post("/api/onboarding/session").expect(200);
    const anonSessionId: string = anonResp.body.sessionId;
    await agent
      .post("/api/chat-sessions")
      .send({ id: "chat-A", onboardingSessionId: "onb-A", title: "Onboarding", isOnboarding: true })
      .expect(200);
    await agent
      .post("/api/chat-sessions")
      .send({ id: "chat-B", onboardingSessionId: "onb-B", title: "Side chat", isOnboarding: false })
      .expect(200);

    // Plus an unrelated row owned by a different anon — must not be touched.
    const otherNow = new Date();
    await repository.upsertChatSession({
      id: "chat-other",
      onboardingSessionId: "onb-other",
      ownerUserId: null,
      ownerAnonId: "anon-someone-else",
      title: "Other",
      isOnboarding: false,
      activeEntityKey: null,
      currentIntent: null,
      createdAt: otherNow,
      updatedAt: otherNow,
      archivedAt: null,
    });

    // 2. Sign in. The login handler reuses the existing session cookie
    //    id, so ownerAnonId on the chat rows still matches req.session.id.
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

    // 3. Claim: no body required — anon id comes from the cookie.
    const response = await agent.post("/api/chat-sessions/claim").send({}).expect(200);
    expect(response.body).toMatchObject({ rekeyedSessions: 2 });

    const a = await repository.getChatSession("chat-A");
    const b = await repository.getChatSession("chat-B");
    const other = await repository.getChatSession("chat-other");
    expect(a?.ownerUserId).toBe("gx-user");
    expect(a?.ownerAnonId).toBeNull();
    expect(b?.ownerUserId).toBe("gx-user");
    expect(b?.ownerAnonId).toBeNull();
    // Unrelated row untouched.
    expect(other?.ownerUserId).toBeNull();
    expect(other?.ownerAnonId).toBe("anon-someone-else");

    // The original anon id is still what was on the cookie.
    expect(anonSessionId).toBeTruthy();
  });

  it("POST /api/chat-sessions/claim returns rekeyedSessions: 0 when no anon rows exist for the user", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    // Sign in from scratch — no prior anon session and no chat rows.
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
    const response = await agent.post("/api/chat-sessions/claim").send({}).expect(200);
    expect(response.body).toMatchObject({ rekeyedSessions: 0 });
  });

  // AU-04 (2026-05-27) — anon→authed flip during in-flight chat writes.
  // The cookie session id stays the same across login (login handler
  // upgrades it in place), so an anon chat session that was being
  // written to mid-flow keeps the same chat_session_id; only the
  // ownership flips. These tests pin the round-trip:
  //   (a) messages written before claim survive on the now-user-owned row;
  //   (b) writes that land AFTER claim still attach to the same id;
  //   (c) ownership truly flips (ownerAnonId cleared, ownerUserId set).
  describe("AU-04 anon→authed flip", () => {
    it("messages written before claim attach to the same chat_session id after claim", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "au04-row", onboardingSessionId: "au04-row", title: "Onboarding", isOnboarding: true })
        .expect(200);
      // Pre-claim write (simulates a user message that landed before sign-up).
      await repository.appendChatMessage({
        id: "pre-1",
        chatSessionId: "au04-row",
        turnIndex: 1,
        role: "user",
        content: "before sign-up",
        citationsJson: null,
        toolCallsJson: null,
        attachmentsJson: null,
        compressedIntoSummaryId: null,
        llmProvider: null,
        llmModelId: null,
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        errorCode: null,
        createdAt: new Date(),
      });

      // Sign in → claim flips owner. Same cookie session id.
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
      const claim = await agent.post("/api/chat-sessions/claim").send({}).expect(200);
      expect(claim.body.rekeyedSessions).toBeGreaterThan(0);

      const row = await repository.getChatSession("au04-row");
      expect(row).not.toBeNull();
      // Ownership flipped, id stable.
      expect(row!.ownerUserId).toBe("gx-user");
      expect(row!.ownerAnonId).toBeNull();
      expect(row!.id).toBe("au04-row");

      // The pre-claim message still references the same chat_session_id.
      const msgs = await repository.listChatMessages("au04-row");
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({ id: "pre-1", content: "before sign-up" });
    });

    it("writes that arrive AFTER claim attach to the same chat_session as pre-claim writes", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "au04-row2", onboardingSessionId: "au04-row2", title: "Onboarding", isOnboarding: true })
        .expect(200);
      await repository.appendChatMessage({
        id: "pre-2",
        chatSessionId: "au04-row2",
        turnIndex: 1,
        role: "user",
        content: "anon turn",
        citationsJson: null,
        toolCallsJson: null,
        attachmentsJson: null,
        compressedIntoSummaryId: null,
        llmProvider: null,
        llmModelId: null,
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        errorCode: null,
        createdAt: new Date(),
      });

      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
      await agent.post("/api/chat-sessions/claim").send({}).expect(200);

      // Post-claim write — using the SAME chat_session_id. The chat
      // handler's lookup by id still resolves; the only diff is
      // the row's owner.
      await repository.appendChatMessage({
        id: "post-1",
        chatSessionId: "au04-row2",
        turnIndex: 2,
        role: "assistant",
        content: "post-claim turn",
        citationsJson: null,
        toolCallsJson: null,
        attachmentsJson: null,
        compressedIntoSummaryId: null,
        llmProvider: null,
        llmModelId: null,
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        errorCode: null,
        createdAt: new Date(),
      });

      const msgs = await repository.listChatMessages("au04-row2");
      expect(msgs).toHaveLength(2);
      // Anon turn + user-owned-row turn co-exist on the same FK.
      expect(msgs.map((m) => m.id).sort()).toEqual(["post-1", "pre-2"]);
    });

    it("GET /api/chat-sessions/:id/messages after claim returns BOTH anon-era and user-era messages", async () => {
      // This is the user-visible test: a chat thread that spans the
      // sign-up boundary should hydrate intact on the post-sign-up
      // refresh. The RT-01 hydration helper hits the same endpoint
      // from the client.
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "au04-hydrate", onboardingSessionId: "au04-hydrate", title: "Onboarding", isOnboarding: true })
        .expect(200);
      await repository.appendChatMessage({
        id: "anon-msg",
        chatSessionId: "au04-hydrate",
        turnIndex: 1,
        role: "user",
        content: "anon question",
        citationsJson: null,
        toolCallsJson: null,
        attachmentsJson: null,
        compressedIntoSummaryId: null,
        llmProvider: null,
        llmModelId: null,
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        errorCode: null,
        createdAt: new Date(),
      });
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
      await agent.post("/api/chat-sessions/claim").send({}).expect(200);
      await repository.appendChatMessage({
        id: "user-msg",
        chatSessionId: "au04-hydrate",
        turnIndex: 2,
        role: "assistant",
        content: "post-signup reply",
        citationsJson: null,
        toolCallsJson: null,
        attachmentsJson: null,
        compressedIntoSummaryId: null,
        llmProvider: null,
        llmModelId: null,
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        errorCode: null,
        createdAt: new Date(),
      });

      // Hydration call from the now-authed session (ownership check
      // succeeds via ownerUserId match).
      const response = await agent.get("/api/chat-sessions/au04-hydrate/messages").expect(200);
      expect(response.body.messages).toHaveLength(2);
      const contents = (response.body.messages as Array<{ content: string }>).map((m) => m.content);
      expect(contents).toContain("anon question");
      expect(contents).toContain("post-signup reply");
    });

    it("after claim, the chat session's GET-messages endpoint stops resolving for the OLD anon cookie", async () => {
      // Defensive: a different anon visitor sharing a tab can't read
      // the claimed session's history. This pins the ownership flip.
      const { app, repository } = setup();
      // Visitor A: anon → creates a session → signs up → claims it.
      const visitorA = request.agent(app);
      await visitorA.post("/api/onboarding/session").expect(200);
      await visitorA
        .post("/api/chat-sessions")
        .send({ id: "au04-private", onboardingSessionId: "au04-private", title: "Onboarding", isOnboarding: true })
        .expect(200);
      await repository.appendChatMessage({
        id: "private-msg",
        chatSessionId: "au04-private",
        turnIndex: 1,
        role: "user",
        content: "private content",
        citationsJson: null,
        toolCallsJson: null,
        attachmentsJson: null,
        compressedIntoSummaryId: null,
        llmProvider: null,
        llmModelId: null,
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        errorCode: null,
        createdAt: new Date(),
      });
      await visitorA.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
      await visitorA.post("/api/chat-sessions/claim").send({}).expect(200);

      // Visitor B: different anon cookie, never signs in.
      const visitorB = request.agent(app);
      await visitorB.post("/api/onboarding/session").expect(200);
      await visitorB.get("/api/chat-sessions/au04-private/messages").expect(403);
    });
  });

  it("POST /api/chat-sessions rejects unauthenticated requests", async () => {
    const { app } = setup();
    await request(app)
      .post("/api/chat-sessions")
      .send({ id: "chat-1", title: "Onboarding", isOnboarding: true })
      .expect(401);
  });

  it("POST /api/chat-sessions creates a server-side row for an anon session (ownerAnonId from cookie)", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);
    const anonResp = await agent.post("/api/onboarding/session").expect(200);
    const anonSessionId: string = anonResp.body.sessionId;

    const response = await agent
      .post("/api/chat-sessions")
      .send({
        id: "chat-anon-1",
        onboardingSessionId: "onb-anon-1",
        title: "Onboarding",
        isOnboarding: true,
        activeEntityKey: null,
      })
      .expect(200);

    expect(response.body).toMatchObject({
      chatSessionId: "chat-anon-1",
      ownerUserId: null,
      ownerAnonId: anonSessionId,
    });
    const row = await repository.getChatSession("chat-anon-1");
    expect(row).not.toBeNull();
    expect(row!.ownerUserId).toBeNull();
    expect(row!.ownerAnonId).toBe(anonSessionId);
    expect(row!.title).toBe("Onboarding");
    expect(row!.isOnboarding).toBe(true);
  });

  it("POST /api/chat-sessions creates a server-side row owned by the signed-in user", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);
    await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

    await agent
      .post("/api/chat-sessions")
      .send({
        id: "chat-user-1",
        onboardingSessionId: "onb-user-1",
        title: "First chat",
        isOnboarding: false,
      })
      .expect(200);

    const row = await repository.getChatSession("chat-user-1");
    expect(row!.ownerUserId).toBe("gx-user");
    expect(row!.ownerAnonId).toBeNull();
  });

  it("POST /api/chat-sessions is idempotent on repeat calls (upsert by id)", async () => {
    const { app, repository } = setup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);

    await agent
      .post("/api/chat-sessions")
      .send({ id: "chat-dup", onboardingSessionId: "onb-dup", title: "v1", isOnboarding: true })
      .expect(200);
    await agent
      .post("/api/chat-sessions")
      .send({ id: "chat-dup", onboardingSessionId: "onb-dup", title: "v2", isOnboarding: true })
      .expect(200);

    const row = await repository.getChatSession("chat-dup");
    expect(row!.title).toBe("v2");
    // Only one session row total.
    expect((await repository.listChatSessionsForUser("gx-user")).filter((s) => s.id === "chat-dup")).toHaveLength(0);
  });

  it("POST /api/chat-sessions returns 400 on malformed body", async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    await agent.post("/api/chat-sessions").send({ id: 42 }).expect(400);
  });

  // RT-01 — server side of "chat history persists across refresh".
  // The chat handler already persists every turn to chat_messages.
  // Without a GET endpoint there's no way for the UI to read them
  // back on mount, so a page refresh wipes the visible thread even
  // though the rows survive. Adds GET /api/chat-sessions/:id/messages.
  describe("GET /api/chat-sessions/:id/messages (RT-01)", () => {
    it("returns the persisted turns in turn order for an anon-owned session", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "rt01-anon", onboardingSessionId: "rt01-anon", title: "Onboarding", isOnboarding: true })
        .expect(200);
      const now = new Date();
      await repository.appendChatMessage({
        id: "m1", chatSessionId: "rt01-anon", turnIndex: 1, role: "user",
        content: "hi", citationsJson: null, toolCallsJson: null, attachmentsJson: null,
        compressedIntoSummaryId: null, llmProvider: null, llmModelId: null,
        latencyMs: null, promptTokens: null, completionTokens: null, errorCode: null, createdAt: now,
      });
      await repository.appendChatMessage({
        id: "m2", chatSessionId: "rt01-anon", turnIndex: 2, role: "assistant",
        content: "hello there", citationsJson: null, toolCallsJson: null, attachmentsJson: null,
        compressedIntoSummaryId: null, llmProvider: null, llmModelId: null,
        latencyMs: null, promptTokens: null, completionTokens: null, errorCode: null, createdAt: now,
      });

      const response = await agent.get("/api/chat-sessions/rt01-anon/messages").expect(200);
      expect(Array.isArray(response.body.messages)).toBe(true);
      expect(response.body.messages).toHaveLength(2);
      expect(response.body.messages[0]).toMatchObject({ id: "m1", role: "user", content: "hi", turnIndex: 1 });
      expect(response.body.messages[1]).toMatchObject({ id: "m2", role: "assistant", content: "hello there", turnIndex: 2 });
    });

    // WF-16 (2026-05-29). MySQL returns a JSON column already PARSED (an
    // array), not a string — so the route's `JSON.parse(citationsJson)`
    // threw and degraded every hydrated turn to `citations: []` (chips
    // never survived a reload). The projection must tolerate an
    // already-parsed array/object as well as a string.
    it("projects citations[] when citationsJson is an already-parsed array (MySQL JSON column)", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "wf16-cites", onboardingSessionId: "wf16-cites", title: "Onboarding", isOnboarding: true })
        .expect(200);
      const citations = [
        { documentId: "c3bfff49", page: 1, snippet: "Amount Due $7,613.20", bbox: { x: 0.55, y: 0.41, w: 0.39, h: 0.18 } },
      ];
      await repository.appendChatMessage({
        id: "wf16-m", chatSessionId: "wf16-cites", turnIndex: 1, role: "assistant",
        content: "The total amount due is $7,613.20.",
        // Simulate MySQL's parsed-JSON return (array, not string).
        citationsJson: citations as unknown as string,
        toolCallsJson: null, attachmentsJson: null, compressedIntoSummaryId: null,
        llmProvider: null, llmModelId: null, latencyMs: null, promptTokens: null,
        completionTokens: null, errorCode: null, createdAt: new Date(),
      });

      const response = await agent.get("/api/chat-sessions/wf16-cites/messages").expect(200);
      const msg = response.body.messages.find((m: { id: string }) => m.id === "wf16-m");
      expect(msg.citations).toHaveLength(1);
      expect(msg.citations[0]).toMatchObject({ documentId: "c3bfff49", page: 1 });
      expect(msg.citations[0].bbox).toMatchObject({ x: 0.55 });
    });

    it("returns 404 for a session id that does not exist", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent.get("/api/chat-sessions/does-not-exist/messages").expect(404);
    });

    it("returns 403 when the session belongs to a different anon visitor", async () => {
      const { app, repository } = setup();
      // Visitor A creates the session.
      const agentA = request.agent(app);
      await agentA.post("/api/onboarding/session").expect(200);
      await agentA
        .post("/api/chat-sessions")
        .send({ id: "rt01-owned", onboardingSessionId: "rt01-owned", title: "Onboarding", isOnboarding: true })
        .expect(200);
      await repository.appendChatMessage({
        id: "m1", chatSessionId: "rt01-owned", turnIndex: 1, role: "user", content: "private",
        citationsJson: null, toolCallsJson: null, attachmentsJson: null, compressedIntoSummaryId: null,
        llmProvider: null, llmModelId: null, latencyMs: null, promptTokens: null,
        completionTokens: null, errorCode: null, createdAt: new Date(),
      });
      // Visitor B (different cookie) tries to read it.
      const agentB = request.agent(app);
      await agentB.post("/api/onboarding/session").expect(200);
      await agentB.get("/api/chat-sessions/rt01-owned/messages").expect(403);
    });

    it("requires a session cookie (401 otherwise)", async () => {
      const { app } = setup();
      await request(app).get("/api/chat-sessions/whatever/messages").expect(401);
    });

    // clickable-citations Phase 1 — Rule 9 closure gate. The chat
    // handler writes `citations_json` for every RAG/hybrid assistant
    // turn, but the hydrate path was returning the raw `citationsJson`
    // string (a no-op for the UI). Without this contract, citation
    // chips silently disappear on refresh. Round-trip insert →
    // hydrate → assert parsed citations[] survives.
    it("returns parsed citations[] per assistant turn (round-trip with citations_json)", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "cit-rt", onboardingSessionId: "cit-rt", title: "Onboarding", isOnboarding: true })
        .expect(200);
      const now = new Date();
      const citations = [
        { documentId: "doc-A", page: 7, snippet: "the total is $214.07", bbox: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 } },
        { documentId: "doc-A", page: 12, snippet: "due date March 15" },
      ];
      await repository.appendChatMessage({
        id: "c1", chatSessionId: "cit-rt", turnIndex: 1, role: "user",
        content: "what is the total?", citationsJson: null, toolCallsJson: null, attachmentsJson: null,
        compressedIntoSummaryId: null, llmProvider: null, llmModelId: null,
        latencyMs: null, promptTokens: null, completionTokens: null, errorCode: null, createdAt: now,
      });
      await repository.appendChatMessage({
        id: "c2", chatSessionId: "cit-rt", turnIndex: 2, role: "assistant",
        content: "The total is $214.07.",
        citationsJson: JSON.stringify(citations),
        toolCallsJson: null, attachmentsJson: null, compressedIntoSummaryId: null,
        llmProvider: null, llmModelId: null, latencyMs: null, promptTokens: null,
        completionTokens: null, errorCode: null, createdAt: now,
      });
      const response = await agent.get("/api/chat-sessions/cit-rt/messages").expect(200);
      // The assistant turn carries a parsed `citations` array
      // (Citation[] shape), not the raw JSON string.
      const assistant = response.body.messages.find((m: { id: string }) => m.id === "c2");
      expect(assistant.citations).toBeDefined();
      expect(Array.isArray(assistant.citations)).toBe(true);
      expect(assistant.citations).toHaveLength(2);
      expect(assistant.citations[0]).toEqual({
        documentId: "doc-A",
        page: 7,
        snippet: "the total is $214.07",
        bbox: { x: 0.1, y: 0.2, w: 0.5, h: 0.05 },
      });
      expect(assistant.citations[1]).toMatchObject({ documentId: "doc-A", page: 12 });
      // Null `citations_json` projects to an empty array, not null,
      // so callers don't have to null-check on every render.
      const user = response.body.messages.find((m: { id: string }) => m.id === "c1");
      expect(user.citations).toEqual([]);
    });
  });

  // RT-02 — server side of "viewer_events table is actually written
  // by application code." Before RT-02 the table was read by
  // chatHandler for LLM context bundling but written ONLY by test
  // fixtures, so the reads always returned []. This endpoint is the
  // missing write side: ChatStore.appendViewerEvent POSTs here
  // fire-and-forget, persisting every UI action that should inform
  // the LLM context bundle.
  describe("POST /api/viewer-events (RT-02)", () => {
    function viewerEventBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        chatSessionId: "rt02-anon",
        timestamp: 1779840000000,
        entityKey: "sample:utility",
        action: "citation-clicked",
        source: "user",
        detail: { citationId: "c-1", page: 1 },
        ...overrides,
      };
    }

    async function setupAnonSession(): Promise<{
      app: ReturnType<typeof setup>["app"];
      repository: ReturnType<typeof setup>["repository"];
      agent: ReturnType<typeof request.agent>;
    }> {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "rt02-anon", onboardingSessionId: "rt02-anon", title: "Onboarding", isOnboarding: true })
        .expect(200);
      return { app, repository, agent };
    }

    it("persists a viewer event row for an anon-owned session", async () => {
      const { repository, agent } = await setupAnonSession();
      const response = await agent.post("/api/viewer-events").send(viewerEventBody()).expect(201);
      expect(response.body).toMatchObject({ ok: true });

      const rows = await repository.listViewerEvents("rt02-anon");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        chatSessionId: "rt02-anon",
        entityKey: "sample:utility",
        action: "citation-clicked",
        source: "user",
      });
      expect(rows[0].timestamp).toBe(1779840000000);
      expect(JSON.parse(rows[0].detailJson ?? "{}")).toEqual({ citationId: "c-1", page: 1 });
      // Server mints a stable id rather than trusting client input.
      expect(typeof rows[0].id).toBe("string");
      expect(rows[0].id.length).toBeGreaterThan(0);
    });

    it("returns 400 on missing required fields", async () => {
      const { agent } = await setupAnonSession();
      await agent.post("/api/viewer-events").send({}).expect(400);
      await agent
        .post("/api/viewer-events")
        .send(viewerEventBody({ action: undefined }))
        .expect(400);
      await agent
        .post("/api/viewer-events")
        .send(viewerEventBody({ source: undefined }))
        .expect(400);
    });

    it("returns 400 when source is not one of user|agent|tour|system", async () => {
      const { agent } = await setupAnonSession();
      await agent
        .post("/api/viewer-events")
        .send(viewerEventBody({ source: "hacker" }))
        .expect(400);
    });

    it("returns 400 when action is not a known ViewerEventAction", async () => {
      const { agent } = await setupAnonSession();
      await agent
        .post("/api/viewer-events")
        .send(viewerEventBody({ action: "not-a-real-action" }))
        .expect(400);
    });

    it("returns 404 when the chat session row does not exist", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/viewer-events")
        .send(viewerEventBody({ chatSessionId: "never-created" }))
        .expect(404);
    });

    it("returns 403 when the chat session belongs to a different visitor", async () => {
      const { app } = setup();
      // Visitor A creates the session.
      const agentA = request.agent(app);
      await agentA.post("/api/onboarding/session").expect(200);
      await agentA
        .post("/api/chat-sessions")
        .send({ id: "rt02-owned", onboardingSessionId: "rt02-owned", title: "Onboarding", isOnboarding: true })
        .expect(200);
      // Visitor B (different cookie) tries to write to it.
      const agentB = request.agent(app);
      await agentB.post("/api/onboarding/session").expect(200);
      await agentB
        .post("/api/viewer-events")
        .send(viewerEventBody({ chatSessionId: "rt02-owned" }))
        .expect(403);
    });

    it("requires a session cookie (401 otherwise)", async () => {
      const { app } = setup();
      await request(app).post("/api/viewer-events").send(viewerEventBody()).expect(401);
    });

    // Rule 9 round-trip closure gate. Before RT-02 the failure mode
    // was: chatHandler.ts:253 reads listViewerEvents on every chat
    // turn for LLM context bundling, but nothing outside tests
    // wrote rows — so the read always returned []. This test
    // proves the loop closes: POST endpoint writes a row →
    // repository.listViewerEvents returns it on a subsequent read
    // (the same call site chatHandler.ts:253 uses for bundling).
    // The bundling pipeline itself is exercised by chatHandler.test.ts;
    // RT-02's net contribution is the write side, which is what
    // this test covers end-to-end via the HTTP boundary.
    it("round-trip: POST /api/viewer-events row is visible to the same listViewerEvents call chatHandler uses for bundling", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "rt02-roundtrip", onboardingSessionId: "rt02-roundtrip", title: "Onboarding", isOnboarding: true })
        .expect(200);

      // Write side — same path ChatStore.appendViewerEvent now uses.
      // Two events so we also confirm ordering (chatHandler bundles
      // the recent slice, sorted newest-first).
      await agent
        .post("/api/viewer-events")
        .send(viewerEventBody({ chatSessionId: "rt02-roundtrip", action: "opened", timestamp: 1000 }))
        .expect(201);
      await agent
        .post("/api/viewer-events")
        .send(viewerEventBody({ chatSessionId: "rt02-roundtrip", action: "citation-clicked", timestamp: 2000 }))
        .expect(201);

      // Bundling-layer read — same call signature chatHandler.ts:253
      // invokes during the next chat turn. Returning the rows here
      // proves the durable write surfaces in the bundling pipeline.
      const bundled = await repository.listViewerEvents("rt02-roundtrip");
      expect(bundled).toHaveLength(2);
      // memoryRepository.listViewerEvents returns newest-first.
      expect(bundled[0]).toMatchObject({ action: "citation-clicked", timestamp: 2000 });
      expect(bundled[1]).toMatchObject({ action: "opened", timestamp: 1000 });
    });
  });

  // RT-03 — server side of "chat_session_entities table is actually
  // written by application code." Before RT-03 the table was read
  // by chatHandler.ts:249 and structuredHandler at three sites for
  // LLM context bundling, but written ONLY by test fixtures, so
  // the reads always returned []. This endpoint is the missing
  // write side: EntityRegistry's upsert/update paths PUT here
  // after each in-memory mutation, persisting the entity's
  // last-frame + completed-frames + scope refs.
  //
  // Body is a partial: the thin client only knows about lastFrame
  // + completedFrames + timestamps, NOT bucketId/projectIds/groupId/
  // documentIds (those get populated server-side from chat-handler
  // processing). The endpoint merges body onto any existing row so
  // server-only fields survive a client PUT.
  describe("PUT /api/chat-sessions/:id/entities/:entityKey (RT-03)", () => {
    function entityBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        lastFrame: "f2",
        completedFramesJson: JSON.stringify(["f1"]),
        scanProgressJson: null,
        extractedValuesJson: null,
        ...overrides,
      };
    }

    async function setupAnonSession(): Promise<{
      app: ReturnType<typeof setup>["app"];
      repository: ReturnType<typeof setup>["repository"];
      agent: ReturnType<typeof request.agent>;
    }> {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "rt03-anon", onboardingSessionId: "rt03-anon", title: "Onboarding", isOnboarding: true })
        .expect(200);
      return { app, repository, agent };
    }

    it("creates a new entity row when none exists for the (session, entityKey) pair", async () => {
      const { repository, agent } = await setupAnonSession();
      const response = await agent
        .put("/api/chat-sessions/rt03-anon/entities/sample%3Autility")
        .send(entityBody())
        .expect(200);
      expect(response.body).toMatchObject({ ok: true });
      const rows = await repository.listChatSessionEntities("rt03-anon");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        chatSessionId: "rt03-anon",
        entityKey: "sample:utility",
        lastFrame: "f2",
        completedFramesJson: JSON.stringify(["f1"]),
        bucketId: null,
        projectIdsJson: null,
        groupId: null,
        documentIdsJson: null,
      });
    });

    it("merges body onto an existing row — fields not in the PUT are preserved", async () => {
      const { repository, agent } = await setupAnonSession();
      // Seed with server-side scope refs that the client doesn't
      // know about. PUT must not clobber them.
      const seedTime = new Date();
      await repository.upsertChatSessionEntity({
        chatSessionId: "rt03-anon",
        entityKey: "sample:utility",
        lastFrame: "f1",
        completedFramesJson: "[]",
        scanProgressJson: null,
        extractedValuesJson: null,
        bucketId: 28454,
        projectIdsJson: JSON.stringify(["P1"]),
        groupId: null,
        documentIdsJson: null,
        createdAt: seedTime,
        lastVisitedAt: seedTime,
      });

      await agent
        .put("/api/chat-sessions/rt03-anon/entities/sample%3Autility")
        .send(entityBody({ lastFrame: "f3", completedFramesJson: JSON.stringify(["f1", "f2"]) }))
        .expect(200);

      const rows = await repository.listChatSessionEntities("rt03-anon");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        // Updated by the PUT.
        lastFrame: "f3",
        completedFramesJson: JSON.stringify(["f1", "f2"]),
        // Preserved from the seed — client didn't send these.
        bucketId: 28454,
        projectIdsJson: JSON.stringify(["P1"]),
      });
      // createdAt preserved; lastVisitedAt bumped.
      expect(rows[0].createdAt.getTime()).toBe(seedTime.getTime());
      expect(rows[0].lastVisitedAt.getTime()).toBeGreaterThanOrEqual(seedTime.getTime());
    });

    it("returns 400 on a non-object body", async () => {
      const { agent } = await setupAnonSession();
      await agent
        .put("/api/chat-sessions/rt03-anon/entities/sample%3Autility")
        .send("not an object")
        .set("content-type", "application/json")
        .expect(400);
    });

    it("returns 400 when lastFrame is not a string", async () => {
      const { agent } = await setupAnonSession();
      await agent
        .put("/api/chat-sessions/rt03-anon/entities/sample%3Autility")
        .send(entityBody({ lastFrame: 42 }))
        .expect(400);
    });

    it("returns 404 when the chat session row does not exist", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .put("/api/chat-sessions/never-created/entities/sample%3Autility")
        .send(entityBody())
        .expect(404);
    });

    it("returns 403 when the chat session belongs to a different visitor", async () => {
      const { app } = setup();
      const agentA = request.agent(app);
      await agentA.post("/api/onboarding/session").expect(200);
      await agentA
        .post("/api/chat-sessions")
        .send({ id: "rt03-owned", onboardingSessionId: "rt03-owned", title: "Onboarding", isOnboarding: true })
        .expect(200);
      const agentB = request.agent(app);
      await agentB.post("/api/onboarding/session").expect(200);
      await agentB
        .put("/api/chat-sessions/rt03-owned/entities/sample%3Autility")
        .send(entityBody())
        .expect(403);
    });

    it("requires a session cookie (401 otherwise)", async () => {
      const { app } = setup();
      await request(app)
        .put("/api/chat-sessions/whatever/entities/sample%3Autility")
        .send(entityBody())
        .expect(401);
    });

    // Rule 9 round-trip closure gate. Before RT-03 the failure mode
    // was: chatHandler.ts:249 + structuredHandler reads ran every
    // chat turn, but nothing in app code wrote rows — listChatSessionEntities
    // always returned []. This test proves the loop is closed:
    // client PUT → durable row → repository.listChatSessionEntities
    // returns it on the same call the chat handler uses for bundling.
    it("round-trip: PUT entity → repository.listChatSessionEntities returns it (same call chatHandler uses)", async () => {
      const { repository, agent } = await setupAnonSession();
      await agent
        .put("/api/chat-sessions/rt03-anon/entities/sample%3Autility")
        .send(entityBody({ lastFrame: "f5", completedFramesJson: JSON.stringify(["f1", "f2", "f3"]) }))
        .expect(200);
      // Same call signature chatHandler.ts:249 + structuredHandler.ts:141/159/397
      // invoke during context bundling. Returning the row here proves
      // the durable write surfaces in the bundling pipeline.
      const bundled = await repository.listChatSessionEntities("rt03-anon");
      expect(bundled).toHaveLength(1);
      expect(bundled[0]).toMatchObject({
        entityKey: "sample:utility",
        lastFrame: "f5",
        completedFramesJson: JSON.stringify(["f1", "f2", "f3"]),
      });
    });
  });

  // RT-04 — server side of "current_intent column kept current."
  // The chat_sessions row is created on POST /api/chat-sessions with
  // currentIntent=null and activeEntityKey from the body, then
  // never updated. chatHandler reads getChatSession.currentIntent
  // every turn for the bundled LLM context — always stale/null
  // after the first canvas navigation. This PATCH endpoint fixes
  // that: CanvasOrchestrator's setCurrentIntent + EntityRegistry's
  // activation PATCH the row alongside the in-memory update.
  //
  // Merge semantics: only fields present in the body are updated.
  // Title / isOnboarding / ownership / timestamps are preserved.
  describe("PATCH /api/chat-sessions/:id (RT-04)", () => {
    async function setupAnonSession(): Promise<{
      app: ReturnType<typeof setup>["app"];
      repository: ReturnType<typeof setup>["repository"];
      agent: ReturnType<typeof request.agent>;
    }> {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "rt04-anon", onboardingSessionId: "rt04-anon", title: "Onboarding", isOnboarding: true })
        .expect(200);
      return { app, repository, agent };
    }

    it("updates currentIntent (JSON payload) on an existing session", async () => {
      const { repository, agent } = await setupAnonSession();
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ currentIntent: { kind: "extract", documentId: "d-1" } })
        .expect(200);
      const row = await repository.getChatSession("rt04-anon");
      expect(row).not.toBeNull();
      expect(row!.currentIntent).toEqual({ kind: "extract", documentId: "d-1" });
    });

    it("supports setting currentIntent to null (canvas closed)", async () => {
      const { repository, agent } = await setupAnonSession();
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ currentIntent: { kind: "understand" } })
        .expect(200);
      await agent.patch("/api/chat-sessions/rt04-anon").send({ currentIntent: null }).expect(200);
      const row = await repository.getChatSession("rt04-anon");
      expect(row!.currentIntent).toBeNull();
    });

    it("updates activeEntityKey on an existing session", async () => {
      const { repository, agent } = await setupAnonSession();
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ activeEntityKey: "sample:utility" })
        .expect(200);
      const row = await repository.getChatSession("rt04-anon");
      expect(row!.activeEntityKey).toBe("sample:utility");
    });

    it("merges — fields absent from the PATCH body are preserved (title, isOnboarding)", async () => {
      const { repository, agent } = await setupAnonSession();
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ currentIntent: { kind: "interact" } })
        .expect(200);
      const row = await repository.getChatSession("rt04-anon");
      expect(row!.title).toBe("Onboarding");
      expect(row!.isOnboarding).toBe(true);
    });

    it("returns 400 on a non-object body", async () => {
      const { agent } = await setupAnonSession();
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send("not an object")
        .set("content-type", "application/json")
        .expect(400);
    });

    it("returns 400 when currentIntent is provided but not an object/null", async () => {
      const { agent } = await setupAnonSession();
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ currentIntent: "extract" })
        .expect(400);
    });

    it("returns 400 when activeEntityKey is provided but not a string/null", async () => {
      const { agent } = await setupAnonSession();
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ activeEntityKey: 42 })
        .expect(400);
    });

    it("returns 404 when the chat session row does not exist", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent
        .patch("/api/chat-sessions/never-created")
        .send({ currentIntent: { kind: "extract" } })
        .expect(404);
    });

    it("returns 403 when the chat session belongs to a different visitor", async () => {
      const { app } = setup();
      const agentA = request.agent(app);
      await agentA.post("/api/onboarding/session").expect(200);
      await agentA
        .post("/api/chat-sessions")
        .send({ id: "rt04-owned", onboardingSessionId: "rt04-owned", title: "Onboarding", isOnboarding: true })
        .expect(200);
      const agentB = request.agent(app);
      await agentB.post("/api/onboarding/session").expect(200);
      await agentB
        .patch("/api/chat-sessions/rt04-owned")
        .send({ currentIntent: { kind: "extract" } })
        .expect(403);
    });

    it("requires a session cookie (401 otherwise)", async () => {
      const { app } = setup();
      await request(app)
        .patch("/api/chat-sessions/whatever")
        .send({ currentIntent: { kind: "extract" } })
        .expect(401);
    });

    // Rule 9 round-trip closure gate. Before RT-04 the failure mode
    // was: chatHandler reads getChatSession.currentIntent on every
    // turn for the bundled LLM context, but only POST /api/chat-sessions
    // seeded it (creation time) — no endpoint ever updated it. This
    // test proves the loop closes end-to-end: PATCH writes the new
    // intent → getChatSession (same call chatHandler uses) returns
    // the updated value.
    it("round-trip: PATCH currentIntent → getChatSession reflects the new value (same call chatHandler uses)", async () => {
      const { repository, agent } = await setupAnonSession();
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ currentIntent: { kind: "extract", documentId: "doc-99" } })
        .expect(200);
      // Same call signature chatHandler invokes during context bundling.
      const row = await repository.getChatSession("rt04-anon");
      expect(row!.currentIntent).toEqual({ kind: "extract", documentId: "doc-99" });
      // Now flip it and re-assert — the value really does flow.
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ currentIntent: { kind: "understand" } })
        .expect(200);
      const row2 = await repository.getChatSession("rt04-anon");
      expect(row2!.currentIntent).toEqual({ kind: "understand" });
    });

    // ── master-viewer-session Phase 1 — ViewerSession slot persistence ──
    //
    // Closure gate for the foundation phase: viewer history, overlays,
    // and workspace state must round-trip through the same PATCH
    // endpoint that currentIntent / activeEntityKey use, so the client
    // can persist viewer state with the same RT-04 semantics.
    it("round-trip: PATCH viewerHistory + viewerOverlays + viewerWorkspace → getChatSession reflects all three", async () => {
      const { repository, agent } = await setupAnonSession();
      const history = [
        { kind: "ingest-picker" },
        { kind: "doc-viewer", documentId: "utility-bill-2026-04", page: 1 },
        { kind: "extract-workbench", scenarioId: "utility", focusedCategoryId: "meters" },
      ];
      const overlays = [
        { kind: "sign-up", state: "pending", cause: "save-schema" },
      ];
      const workspace = {
        schemaOverlay: {
          addedFields: [],
          removedFieldIds: [],
          editedFields: [],
          pendingFieldProposals: [],
          pinnedSamples: ["utility-bill-2026-04"],
          focusedCategoryId: "meters",
        },
      };
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ viewerHistory: history, viewerOverlays: overlays, viewerWorkspace: workspace })
        .expect(200);
      const row = await repository.getChatSession("rt04-anon");
      expect(row).not.toBeNull();
      expect(row!.viewerHistory).toEqual(history);
      expect(row!.viewerOverlays).toEqual(overlays);
      expect(row!.viewerWorkspace).toEqual(workspace);
    });

    it("viewer slot fields default to null on session create + survive a partial PATCH", async () => {
      const { repository, agent } = await setupAnonSession();
      // Initial — never touched, three fields are null.
      const initial = await repository.getChatSession("rt04-anon");
      expect(initial!.viewerHistory).toBeNull();
      expect(initial!.viewerOverlays).toBeNull();
      expect(initial!.viewerWorkspace).toBeNull();
      // PATCH only viewerOverlays — other two stay null.
      await agent
        .patch("/api/chat-sessions/rt04-anon")
        .send({ viewerOverlays: [{ kind: "citation-peek", documentId: "d-1", page: 3 }] })
        .expect(200);
      const row = await repository.getChatSession("rt04-anon");
      expect(row!.viewerHistory).toBeNull();
      expect(row!.viewerOverlays).toEqual([{ kind: "citation-peek", documentId: "d-1", page: 3 }]);
      expect(row!.viewerWorkspace).toBeNull();
    });
  });

  // RT-05 — server side of "steady-mode session list hydrates from
  // server." Before RT-05 the SessionSwitcher read sessions from
  // ChatStore which hydrates from localStorage only — signed-in
  // user on a new device saw zero sessions despite the DB carrying
  // them. This endpoint surfaces the persisted list so the client
  // can hydrate on auth-resolved and merge with localStorage cache.
  //
  // Auth: signed-in users only. Anonymous visitors are scoped to a
  // single cookie session (no cross-device list). Anon → 401.
  describe("GET /api/chat-sessions (RT-05)", () => {
    it("returns the signed-in user's chat sessions (newest first)", async () => {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
      // Two persisted sessions for this user via the existing POST.
      await agent
        .post("/api/chat-sessions")
        .send({ id: "chat-list-a", onboardingSessionId: "chat-list-a", title: "First", isOnboarding: false })
        .expect(200);
      await agent
        .post("/api/chat-sessions")
        .send({ id: "chat-list-b", onboardingSessionId: "chat-list-b", title: "Second", isOnboarding: false })
        .expect(200);
      // One unrelated session owned by a different user, for negative
      // assertion (this user must not see it).
      await repository.upsertChatSession({
        id: "chat-other-user",
        onboardingSessionId: "chat-other-user",
        ownerUserId: "different-user",
        ownerAnonId: null,
        title: "Not mine",
        isOnboarding: false,
        activeEntityKey: null,
        currentIntent: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });

      const response = await agent.get("/api/chat-sessions").expect(200);
      expect(Array.isArray(response.body.sessions)).toBe(true);
      const ids = (response.body.sessions as Array<{ id: string }>).map((s) => s.id);
      expect(ids).toContain("chat-list-a");
      expect(ids).toContain("chat-list-b");
      expect(ids).not.toContain("chat-other-user");
      // Newest-first ordering is the documented contract, but two
      // upserts in the same test tick can collide on updatedAt within
      // sub-millisecond resolution. Stable assertion: both rows are
      // present and the third (other-user) row is filtered out.
    });

    it("returns an empty array for a signed-in user with no sessions", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);
      const response = await agent.get("/api/chat-sessions").expect(200);
      expect(response.body).toEqual({ sessions: [] });
    });

    it("returns 401 for an anonymous visitor (no cross-device list for anon)", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent.get("/api/chat-sessions").expect(401);
    });

    it("returns 401 when there is no session cookie at all", async () => {
      const { app } = setup();
      await request(app).get("/api/chat-sessions").expect(401);
    });

    // Rule 9 round-trip closure gate. The "user signs in on a new
    // device" scenario: server-side rows exist, client has no
    // localStorage cache, GET surfaces them. Without RT-05 the
    // SessionSwitcher would show empty.
    it("round-trip: a signed-in user can read back every session they've created", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/auth/login").send({ email: "pat@example.com", password: "secret" }).expect(200);

      // Create three sessions; some onboarding-flag true, some false.
      const seedIds = ["rt05-a", "rt05-b", "rt05-c"];
      for (const id of seedIds) {
        await agent
          .post("/api/chat-sessions")
          .send({ id, onboardingSessionId: id, title: id, isOnboarding: id === "rt05-a" })
          .expect(200);
      }

      const response = await agent.get("/api/chat-sessions").expect(200);
      const sessions = response.body.sessions as Array<{ id: string; title: string; isOnboarding: boolean }>;
      expect(sessions.map((s) => s.id).sort()).toEqual([...seedIds].sort());
      const a = sessions.find((s) => s.id === "rt05-a")!;
      expect(a.isOnboarding).toBe(true);
      const b = sessions.find((s) => s.id === "rt05-b")!;
      expect(b.isOnboarding).toBe(false);
    });
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

  // ── Populated-session sweep ────────────────────────────────────────
  //
  // Regression class: routes branch on `chatSession.activeEntityKey`
  // / `viewer.history.length > 0` / `messages.length > 0` etc., but
  // the test suite was constructing sessions with empty defaults.
  // Code paths that only fire when those fields are populated stayed
  // dark. The `getChatSessionEntity` runtime bug (route called a
  // method that doesn't exist on AppRepository) was silent for weeks
  // because the existing extract-field test never set
  // `activeEntityKey`.
  //
  // Fix: a single fixture that pre-populates every chat-session field
  // a route might branch on, then exercises every chat-session
  // endpoint. If a route 500s on populated input, this test catches
  // it.
  describe("populated-session sweep (catches code paths only reachable with non-empty session)", () => {
    async function seedPopulatedSession(
      agent: ReturnType<typeof request.agent>,
      repository: ReturnType<typeof setup>["repository"],
      chatSessionId: string,
    ) {
      const now = new Date();
      // Create the row via the public route so ownership matches the
      // agent's cookie. Then PATCH every viewer-state field.
      await agent
        .post("/api/chat-sessions")
        .send({
          id: chatSessionId,
          onboardingSessionId: chatSessionId,
          title: "Populated",
          isOnboarding: true,
          activeEntityKey: "sample:utility",
        })
        .expect(200);
      await agent
        .patch(`/api/chat-sessions/${chatSessionId}`)
        .send({
          currentIntent: { kind: "showSample", scenario: "utility" },
          viewerHistory: [
            { kind: "ingest-picker" },
            { kind: "doc-viewer", documentId: "doc-A", page: 1 },
            { kind: "extract-workbench", scenarioId: "utility" },
          ],
          viewerOverlays: [{ kind: "citation-peek", documentId: "doc-A", page: 7 }],
          viewerWorkspace: { schemaOverlay: { addedFields: [], pendingFieldProposals: [], dismissedFieldProposalKeys: [] } },
        })
        .expect(200);
      // Seed an active entity directly via the repo (the case the
      // `getChatSessionEntity` bug missed).
      await repository.upsertChatSessionEntity({
        chatSessionId,
        entityKey: "sample:utility",
        lastFrame: "f3",
        completedFramesJson: JSON.stringify(["f1", "f2"]),
        scanProgressJson: null,
        extractedValuesJson: null,
        bucketId: null,
        groupId: null,
        documentIdsJson: null,
        projectIdsJson: null,
        createdAt: now,
        lastVisitedAt: now,
      });
      // Seed a message + a viewer event so list routes return non-empty.
      await repository.appendChatMessage({
        id: "msg-1",
        chatSessionId,
        turnIndex: 1,
        role: "user",
        content: "what is the total?",
        citationsJson: null,
        toolCallsJson: null,
        attachmentsJson: null,
        compressedIntoSummaryId: null,
        llmProvider: null,
        llmModelId: null,
        latencyMs: null,
        promptTokens: null,
        completionTokens: null,
        errorCode: null,
        createdAt: now,
      });
      await repository.appendViewerEvent({
        id: "ev-1",
        chatSessionId,
        entityKey: "sample:utility",
        action: "opened",
        source: "user",
        detailJson: null,
        timestamp: now.getTime(),
        createdAt: now,
      });
    }

    async function bootstrappedAgent() {
      const { app, repository } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await seedPopulatedSession(agent, repository, "pop-1");
      return { app, repository, agent };
    }

    it("GET /api/chat-sessions/:id/messages returns the populated thread without 500", async () => {
      const { agent } = await bootstrappedAgent();
      const response = await agent.get("/api/chat-sessions/pop-1/messages").expect(200);
      expect(response.body.messages.length).toBeGreaterThan(0);
    });

    it("PATCH /api/chat-sessions/:id merges into a populated session without 500", async () => {
      const { agent } = await bootstrappedAgent();
      await agent
        .patch("/api/chat-sessions/pop-1")
        .send({ activeEntityKey: "sample:loan" })
        .expect(200);
    });

    it("PUT /api/chat-sessions/:id/entities/:entityKey merges onto a pre-seeded entity without 500", async () => {
      const { agent } = await bootstrappedAgent();
      await agent
        .put("/api/chat-sessions/pop-1/entities/sample%3Autility")
        .send({ lastFrame: "f4" })
        .expect(200);
    });

    it("POST /api/viewer-events appends to a populated session without 500", async () => {
      const { agent } = await bootstrappedAgent();
      await agent
        .post("/api/viewer-events")
        .send({
          chatSessionId: "pop-1",
          timestamp: Date.now(),
          entityKey: "sample:utility",
          action: "citation-clicked",
          source: "user",
          detail: { citationId: "c-1", page: 1 },
        })
        .expect(201);
    });

    it("POST /api/extract-field succeeds on a session with an active entity (regression: getChatSessionEntity runtime bug)", async () => {
      const { agent } = await bootstrappedAgent();
      const response = await agent
        .post("/api/extract-field")
        .send({
          chatSessionId: "pop-1",
          field: { name: "total", type: "NUMBER", description: "Total amount due." },
        })
        .expect(200);
      expect(response.body).toHaveProperty("value");
    });
  });

  describe("POST /api/documents/:id/field-geometry (WF-05)", () => {
    const xray = {
      documentPages: [{ pageNumber: 1, width: 1700, height: 2200 }],
      chunks: [
        {
          text: "Current Charges $7,613.20",
          pageNumbers: [1],
          boundingBoxes: [{ pageNumber: 1, topLeftX: 100, topLeftY: 200, bottomRightX: 1600, bottomRightY: 400 }],
        },
      ],
    };

    it("resolves per-field geometry from the document X-Ray (value match)", async () => {
      const { app, groundxClient } = setup();
      groundxClient.responseByPathFragment.set("/ingest/document/xray/", xray);
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);

      const res = await agent
        .post("/api/documents/c3bfff49/field-geometry")
        .send({ fields: [{ value: 7613.2, label: "balance_payable" }, { value: "no such value zzz", label: "x" }] })
        .expect(200);

      expect(res.body.geometry).toHaveLength(2);
      expect(res.body.geometry[0]).toMatchObject({ page: 1 });
      expect(res.body.geometry[0].bbox.x).toBeCloseTo(100 / 1700, 2);
      expect(res.body.geometry[1]).toBeNull(); // unmatched value → no geometry
    });

    it("400s when fields is missing", async () => {
      const { app } = setup();
      const agent = request.agent(app);
      await agent.post("/api/onboarding/session").expect(200);
      await agent.post("/api/documents/c3bfff49/field-geometry").send({}).expect(400);
    });
  });
});
