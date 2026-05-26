import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { MemoryAppRepository } from "../db/memoryRepository.js";
import {
  FakeGroundXClient,
  FakeLlmClient,
  FakePartnerClient,
  FakeScenarioRegistry,
  testEnv,
  bootstrapCsrf,
} from "../test/fakes.js";

/**
 * SC-01 closure tests — CSRF middleware on, validates every state-
 * changing route. Uses a per-test app instance with `CSRF_ENABLED:
 * true` to exercise the production defense.
 */

function setupEnforced() {
  const env = { ...testEnv, CSRF_ENABLED: true };
  const repository = new MemoryAppRepository();
  const partnerClient = new FakePartnerClient();
  const groundxClient = new FakeGroundXClient();
  const llmClient = new FakeLlmClient();
  const scenarioRegistry = new FakeScenarioRegistry();
  const app = createApp({ env, repository, partnerClient, groundxClient, llmClient, scenarioRegistry });
  return { app, repository };
}

describe("csrfMiddleware (SC-01) — CSRF_ENABLED=true", () => {
  it("GET /api/csrf/token returns a token AND sets the csrf_token cookie", async () => {
    const { app } = setupEnforced();
    const res = await request(app).get("/api/csrf/token").expect(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.token.length).toBeGreaterThanOrEqual(32);
    expect(res.headers["set-cookie"]?.some((c) => /csrf_token=/.test(c))).toBe(true);
  });

  it("rejects POST /api/chat/messages without an X-CSRF-Token header (403)", async () => {
    // Closure test from the backlog: cross-site form POST without the
    // token is rejected. Use a bare request (no cookie agent) so the
    // server sees no csrf header.
    const { app } = setupEnforced();
    const agent = request.agent(app);
    // First bootstrap the cookie via GET (so the cookie exists) but
    // do NOT add the header — simulating a cross-site attacker who
    // got the cookie via SameSite=lax but can't read it.
    await agent.get("/api/csrf/token").expect(200);
    await agent
      .post("/api/chat/messages")
      .send({ chatSessionId: "x", newUserMessage: "hi" })
      .expect(403, { error: "csrf_token_missing" });
  });

  it("rejects POST with a mismatched X-CSRF-Token (403)", async () => {
    const { app } = setupEnforced();
    const agent = request.agent(app);
    await agent.get("/api/csrf/token").expect(200);
    await agent
      .post("/api/chat/messages")
      .set("X-CSRF-Token", "not-the-real-token")
      .send({ chatSessionId: "x", newUserMessage: "hi" })
      .expect(403, { error: "csrf_token_mismatch" });
  });

  it("accepts POST with a matching X-CSRF-Token (passes CSRF; route business logic takes over)", async () => {
    const { app } = setupEnforced();
    // Bootstrap anon session FIRST (POST /api/onboarding/session is
    // CSRF-exempt; needed so subsequent POSTs have a session cookie).
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    // Now bootstrap CSRF, get the token, and send a state-changing
    // request that requires session + CSRF.
    const csrf = await bootstrapCsrf(agent);
    // The chat-sessions ensure-create route requires a session
    // (which we have) + CSRF (which we just set). Should pass.
    const res = await csrf
      .post("/api/chat-sessions")
      .send({ id: "chat-1", title: "Onboarding", isOnboarding: true });
    expect(res.status).toBe(200);
    expect(res.body.chatSessionId).toBe("chat-1");
  });

  it("CSRF-exempt bootstrap paths (POST /api/onboarding/session) don't require the header", async () => {
    const { app } = setupEnforced();
    // Bare request, no GET first, no header. The bootstrap path must
    // still accept the POST — otherwise no client could ever start.
    await request(app).post("/api/onboarding/session").expect(200);
  });

  it("CSRF-exempt POST /api/auth/login doesn't require the header (pre-cookie bootstrap)", async () => {
    const { app } = setupEnforced();
    await request(app)
      .post("/api/auth/login")
      .send({ email: "pat@example.com", password: "secret" })
      .expect(200);
  });

  it("safe methods (GET) are skipped by the validator", async () => {
    const { app } = setupEnforced();
    // /api/healthz is GET. Should pass without any CSRF setup.
    await request(app).get("/api/healthz").expect(200, { status: "ok" });
  });

  it("the issued cookie is NOT HttpOnly (client JS needs to read it)", async () => {
    const { app } = setupEnforced();
    const res = await request(app).get("/api/csrf/token").expect(200);
    const csrfCookie = res.headers["set-cookie"]?.find((c) => /csrf_token=/.test(c));
    expect(csrfCookie).toBeDefined();
    expect(csrfCookie!.toLowerCase()).not.toContain("httponly");
  });

  it("tokens are at least 32 bytes (64 hex chars) of randomness", async () => {
    const { app } = setupEnforced();
    const r1 = await request(app).get("/api/csrf/token").expect(200);
    const r2 = await request(app).get("/api/csrf/token").expect(200);
    expect(r1.body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(r2.body.token).toMatch(/^[0-9a-f]{64}$/);
    // Two distinct requests (no shared cookie) get distinct tokens.
    expect(r1.body.token).not.toBe(r2.body.token);
  });
});

describe("csrfMiddleware — CSRF_ENABLED=false (test/dev default)", () => {
  it("cookie is still issued so /api/csrf/token works for opt-in tests", async () => {
    const env = { ...testEnv, CSRF_ENABLED: false };
    const app = createApp({
      env,
      repository: new MemoryAppRepository(),
      partnerClient: new FakePartnerClient(),
      groundxClient: new FakeGroundXClient(),
      llmClient: new FakeLlmClient(),
      scenarioRegistry: new FakeScenarioRegistry(),
    });
    const res = await request(app).get("/api/csrf/token").expect(200);
    expect(typeof res.body.token).toBe("string");
  });

  it("state-changing POSTs without token are NOT rejected (enforcement off)", async () => {
    const env = { ...testEnv, CSRF_ENABLED: false };
    const app = createApp({
      env,
      repository: new MemoryAppRepository(),
      partnerClient: new FakePartnerClient(),
      groundxClient: new FakeGroundXClient(),
      llmClient: new FakeLlmClient(),
      scenarioRegistry: new FakeScenarioRegistry(),
    });
    const agent = request.agent(app);
    await agent.post("/api/onboarding/session").expect(200);
    // /api/me/metadata is a PATCH; with CSRF off it should reach the
    // route, which will then reject for its own reasons (or accept).
    // The point: 403 csrf_token_missing should NOT fire here.
    const res = await agent.patch("/api/me/metadata").send({ onboardingState: { foo: "bar" } });
    expect(res.status).not.toBe(403);
  });
});
