import type { AppEnv } from "../config/env.js";
import { ScenarioRegistry } from "../scenarios/registry.js";
import type { ScenarioConfig } from "../scenarios/types.js";
import type {
  AuthResponse,
  ConfirmPasswordInput,
  GroundXClient,
  GroundXPartnerClient,
  LoginCustomerInput,
  RegisterCustomerInput,
  LlmClient,
} from "../types.js";

export const testEnv: AppEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  PORT: 3001,
  ALLOWED_ORIGIN: "http://localhost:5173",
  APP_REPOSITORY_MODE: "memory",
  MYSQL_HOST: "localhost",
  MYSQL_PORT: 3306,
  MYSQL_DATABASE: "test",
  MYSQL_USER: "test",
  MYSQL_PASSWORD: "test",
  SESSION_SECRET: "01234567890123456789012345678901",
  UPSTREAM_TIMEOUT_MS: 30_000,
  GROUNDX_BASE_URL: "https://api.groundx.test/api/v1",
  GROUNDX_PARTNER_API_KEY: "partner-key",
  LLM_SERVICE: "openai",
  LLM_BASE_URL: "https://llm.test/v1",
  LLM_API_KEY: "llm-key",
  LLM_AUTH_HEADER_NAME: "Authorization",
  LLM_AUTH_SCHEME: "Bearer",
  LLM_MODEL_ID: "model",
  LLM_CONTEXT_WINDOW_TOKENS: 16_000,
  COMPRESSION_TRIGGER_RATIO: 0.7,
  COMPRESSION_TARGET_TOKENS: 1_000,
  MAX_ACTIVE_SUMMARIES_BEFORE_META: 10,
  META_COMPACTION_BATCH_SIZE: 5,
  MAX_SUMMARY_OUTPUT_TOKENS: 600,
  BYO_PAGES_LIMIT: 100,
  RATE_LIMIT_AUTH_PER_MIN: 20,
  RATE_LIMIT_API_PER_MIN: 120,
  RATE_LIMIT_LLM_PER_MIN: 60,
  METRICS_ENABLED: true,
  OTEL_SERVICE_NAME: "groundx-v2-ui-middleware",
  SSO_ENABLED: false,
  DISABLE_AGENT_TURN_LOG: false,
  // SC-01 — route-business-logic tests don't bootstrap a CSRF token.
  // Default-off in test keeps those suites green. SC-01-specific
  // tests pass `{ ...testEnv, CSRF_ENABLED: true }` to exercise the
  // defense end-to-end.
  CSRF_ENABLED: false,
};

export class FakePartnerClient implements GroundXPartnerClient {
  calls: Array<{ name: string; input?: unknown }> = [];

  async registerCustomer(input: RegisterCustomerInput): Promise<AuthResponse> {
    this.calls.push({ name: "registerCustomer", input });
    return { username: "gx-user", token: "token-register" };
  }

  async loginCustomer(input: LoginCustomerInput): Promise<AuthResponse> {
    this.calls.push({ name: "loginCustomer", input });
    return { username: "gx-user", token: "token-login" };
  }

  async getCustomer(username: string): Promise<{ customer: Record<string, unknown> }> {
    this.calls.push({ name: "getCustomer", input: username });
    return { customer: { username, email: "pat@example.com" } };
  }

  async requestPasswordReset(email: string): Promise<unknown> {
    this.calls.push({ name: "requestPasswordReset", input: email });
    return { message: "OK" };
  }

  async confirmPasswordReset(input: ConfirmPasswordInput): Promise<unknown> {
    this.calls.push({ name: "confirmPasswordReset", input });
    return { message: "OK" };
  }

  async createApiKey(username: string, name: string): Promise<string> {
    this.calls.push({ name: "createApiKey", input: { username, name } });
    return "groundx-api-key";
  }

  async forward(path: string, init: RequestInit & { customerKey?: string }): Promise<Response> {
    this.calls.push({ name: "forward", input: { path, init } });
    return Response.json({ path, customerKey: init.customerKey });
  }
}

export class FakeGroundXClient implements GroundXClient {
  calls: Array<{ path: string; init: RequestInit & { apiKey: string } }> = [];
  /**
   * Test seam — when a `forward` path includes one of these fragments, the
   * mapped body is returned as JSON instead of the default stub. Lets tests
   * inject e.g. an X-Ray fixture for the field-geometry endpoint.
   */
  responseByPathFragment = new Map<string, unknown>();

  async forward(path: string, init: RequestInit & { apiKey: string }): Promise<Response> {
    this.calls.push({ path, init });
    for (const [fragment, body] of this.responseByPathFragment) {
      if (path.includes(fragment)) return Response.json(body as Record<string, unknown>);
    }
    return Response.json({ path, hasApiKey: Boolean(init.apiKey) });
  }
}

export class FakeLlmClient implements LlmClient {
  calls: Array<{ path: string; init: RequestInit }> = [];

  async forward(path: string, init: RequestInit): Promise<Response> {
    this.calls.push({ path, init });
    return Response.json({ answer: "ok" });
  }
}

/**
 * In-memory ScenarioRegistry stand-in for tests. Bypasses the network layer
 * entirely; tests preload the list they want returned.
 */
export class FakeScenarioRegistry extends ScenarioRegistry {
  private data: ScenarioConfig[] = [];

  constructor() {
    super(testEnv);
  }

  setScenarios(scenarios: ScenarioConfig[]): void {
    this.data = scenarios;
  }

  async list(): Promise<ScenarioConfig[]> {
    return this.data;
  }
}

/**
 * SC-01 test helper. CSRF middleware blocks every state-changing
 * request that lacks `X-CSRF-Token`. Tests bootstrap a supertest agent
 * by calling `GET /api/csrf/token`, then set the returned token as a
 * default header on the agent so every subsequent POST/PUT/DELETE/PATCH
 * carries it without per-test boilerplate.
 *
 * Usage:
 *   import request from "supertest";
 *   import { bootstrapCsrf } from "./test/fakes.js";
 *
 *   const agent = await bootstrapCsrf(request.agent(app));
 *   await agent.post("/...").send(body); // CSRF header auto-included
 */
export async function bootstrapCsrf<T extends { get: (path: string) => Promise<unknown>; set: (header: string, value: string) => unknown }>(
  agent: T,
): Promise<T> {
  // `request.agent(app).get(...)` returns a Test (thenable). Awaiting
  // it triggers the HTTP round-trip and persists Set-Cookie on the
  // agent's jar so the cookie is available for subsequent requests.
  const res = (await agent.get("/api/csrf/token")) as { body: { token: string } };
  agent.set("X-CSRF-Token", res.body.token);
  return agent;
}
