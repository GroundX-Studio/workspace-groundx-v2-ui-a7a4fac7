#!/usr/bin/env node
// Dev boot smoke (2026-06-01-retire-mock-mode).
//
// The middleware has NO mock mode — it always uses the real GroundX / LLM
// clients. This smoke therefore verifies the parts of the local-dev boot that
// do NOT require live upstreams: both servers come up, the Vite → middleware
// /api proxy works, metrics are exposed, an anonymous onboarding session mints,
// and the CSRF token endpoint responds. The upstream-dependent flow (login,
// project/bucket/search/xray/llm proxies) is exercised ONLY when a REAL GroundX
// Partner key is supplied via GROUNDX_PARTNER_API_KEY; otherwise it is skipped
// LOUDLY with an explicit message (never silently passed).
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const timeoutMs = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "30000", 10);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error("SMOKE_TIMEOUT_MS must be a positive integer when provided.");
}
const startedAt = Date.now();

// A real GroundX Partner key (not the CI placeholder) gates the live-upstream
// flow. The CI "Dev smoke" step does not provide one, so that flow is skipped
// explicitly rather than run against real GroundX with a bogus key.
const partnerKey = process.env.GROUNDX_PARTNER_API_KEY ?? "";
const hasRealGroundxKey = partnerKey.length > 0 && partnerKey !== "smoke-partner-key";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(url, label) {
  let lastError = "";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = `${response.status} ${response.statusText}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await sleep(500);
  }
  throw new Error(`${label} did not become ready at ${url}: ${lastError}`);
}

async function expectJson(url, init, validate) {
  const response = await fetch(url, init);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url} returned ${response.status}: ${JSON.stringify(body)}`);
  }
  validate(body, response);
  return { body, response };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

const middlewarePort = await freePort();
const frontendPort = await freePort();
const middlewareUrl = `http://localhost:${middlewarePort}`;
const frontendUrl = `http://localhost:${frontendPort}`;

const child = spawn("npm", ["run", "dev"], {
  detached: true,
  env: {
    ...process.env,
    PORT: String(middlewarePort),
    ALLOWED_ORIGIN: frontendUrl,
    VITE_DEV_PORT: String(frontendPort),
    MIDDLEWARE_DEV_PORT: String(middlewarePort),
    GROUNDX_PARTNER_API_KEY: partnerKey || "smoke-partner-key",
    LLM_SERVICE: process.env.LLM_SERVICE ?? "openai",
    LLM_MODEL_ID: process.env.LLM_MODEL_ID ?? "smoke-model",
    LLM_API_KEY: process.env.LLM_API_KEY ?? "smoke-llm-key",
    APP_REPOSITORY_MODE: "memory",
    MYSQL_HOST: "mysql.invalid.local",
    MYSQL_DATABASE: "smoke_should_not_be_used",
    MYSQL_USER: "smoke_should_not_be_used",
    MYSQL_PASSWORD: "smoke_should_not_be_used",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
child.stdout.on("data", (chunk) => {
  output += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  output += chunk.toString();
});

try {
  await waitFor(`${middlewareUrl}/api/healthz`, "middleware");
  await waitFor(frontendUrl, "frontend");
  const proxied = await waitFor(`${frontendUrl}/api/healthz`, "frontend proxy");
  const body = await proxied.json();
  if (body.status !== "ok") throw new Error(`frontend proxy returned unexpected body: ${JSON.stringify(body)}`);

  await expectJson(
    `${frontendUrl}/api/onboarding/session`,
    { method: "POST", headers: { "content-type": "application/json" } },
    (json) => {
      assert(json.anonymous === true, `anonymous onboarding session not flagged: ${JSON.stringify(json)}`);
      assert(typeof json.sessionId === "string" && json.sessionId.length > 0, `missing sessionId: ${JSON.stringify(json)}`);
    },
  );

  const metrics = await fetch(`${middlewareUrl}/api/metrics`);
  if (!metrics.ok) throw new Error(`/api/metrics not reachable: ${metrics.status}`);
  const metricsText = await metrics.text();
  if (!metricsText.includes("http_requests_total")) {
    throw new Error("metrics output missing http_requests_total counter");
  }

  // The CSRF token endpoint mints a token (no upstream dependency). This proves
  // the security middleware + session cookie plumbing boots correctly.
  const csrf = await expectJson(`${frontendUrl}/api/csrf/token`, undefined, (json) => {
    assert(typeof json.token === "string" && json.token.length > 0, `missing csrf token: ${JSON.stringify(json)}`);
  });
  void csrf;

  if (!hasRealGroundxKey) {
    console.log(
      "dev smoke passed (boot path): repository=memory, frontend, middleware, /api proxy, metrics, " +
        "anonymous onboarding session, and CSRF token are reachable.\n" +
        "SKIPPED the live-upstream flow (login / project / bucket / search / xray / llm): no real " +
        "GROUNDX_PARTNER_API_KEY supplied (the runtime has no mock mode, so these require real GroundX). " +
        "Set GROUNDX_PARTNER_API_KEY to a real key to exercise them.",
    );
  } else {
    // A real key is present — exercise the authenticated upstream flow against
    // the live GroundX backend.
    const login = await expectJson(
      `${frontendUrl}/api/auth/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: process.env.SMOKE_EMAIL ?? "smoke@example.com", password: process.env.SMOKE_PASSWORD ?? "dev-password" }),
      },
      (json) => {
        assert(json.success === true, `login did not succeed: ${JSON.stringify(json)}`);
      },
    );
    const setCookies = login.response.headers.getSetCookie?.() ?? [];
    const cookiePairs = setCookies.map((c) => c.split(";")[0]);
    const cookie = cookiePairs.join("; ");
    assert(/gx_app_session=/.test(cookie), "login did not set the session cookie");
    const csrfPair = cookiePairs.find((c) => c.startsWith("csrf_token="));
    const csrfToken = csrfPair ? csrfPair.slice("csrf_token=".length) : "";
    assert(csrfToken, "login did not set a csrf_token cookie");
    const authHeaders = { cookie, "content-type": "application/json", "x-csrf-token": csrfToken };
    // The authed read proxies just need to reach GroundX and return 2xx.
    await expectJson(`${frontendUrl}/api/project`, { headers: authHeaders }, () => {});
    await expectJson(`${frontendUrl}/api/bucket`, { headers: authHeaders }, () => {});
    console.log(
      "dev smoke passed (live path): boot path + authenticated GroundX upstream flow (login, project, bucket) reachable.",
    );
  }
} catch (error) {
  console.error(output);
  throw error;
} finally {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}
