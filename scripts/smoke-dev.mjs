#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const timeoutMs = Number.parseInt(process.env.SMOKE_TIMEOUT_MS ?? "30000", 10);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error("SMOKE_TIMEOUT_MS must be a positive integer when provided.");
}
const startedAt = Date.now();

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
    GROUNDX_PARTNER_API_KEY: process.env.GROUNDX_PARTNER_API_KEY ?? "smoke-partner-key",
    LLM_SERVICE: process.env.LLM_SERVICE ?? "openai",
    LLM_MODEL_ID: process.env.LLM_MODEL_ID ?? "smoke-model",
    LLM_API_KEY: process.env.LLM_API_KEY ?? "smoke-llm-key",
    MOCK_MODE: "true",
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

  const login = await expectJson(
    `${frontendUrl}/api/auth/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "smoke@example.com", password: "dev-password" }),
    },
    (json) => {
      assert(json.success === true, `login did not succeed: ${JSON.stringify(json)}`);
      assert(json.username === "smoke@example.com", `login returned unexpected username: ${JSON.stringify(json)}`);
    },
  );
  const cookie = login.response.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, "login did not set a session cookie");

  const authHeaders = { cookie, "content-type": "application/json" };
  await expectJson(`${frontendUrl}/api/project`, { headers: authHeaders }, (json) => {
    assert(json.mode === "development", `project route did not use mock mode: ${JSON.stringify(json)}`);
    assert(json.projects?.some?.((project) => project.projectId === "demo-project"), `missing demo project: ${JSON.stringify(json)}`);
  });
  await expectJson(`${frontendUrl}/api/bucket`, { headers: authHeaders }, (json) => {
    assert(json.buckets?.some?.((bucket) => bucket.bucketId === "demo-bucket"), `missing demo bucket: ${JSON.stringify(json)}`);
  });
  await expectJson(`${frontendUrl}/api/group`, { headers: authHeaders }, (json) => {
    assert(json.groups?.some?.((group) => group.groupId === "demo-group"), `missing demo group: ${JSON.stringify(json)}`);
  });
  await expectJson(`${frontendUrl}/api/apikey`, { headers: authHeaders }, (json) => {
    assert(json.apiKeys?.some?.((apiKey) => apiKey.apiKey === "dev-groundx-api-key"), `missing dev API key: ${JSON.stringify(json)}`);
  });
  await expectJson(
    `${frontendUrl}/api/v1/search/demo-bucket`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ query: "workspace preview" }),
    },
    (json) => {
      assert(json.mode === "development", `search route did not use mock mode: ${JSON.stringify(json)}`);
      assert(json.query === "workspace preview", `search route did not echo query: ${JSON.stringify(json)}`);
      assert(json.search?.results?.some?.((result) => result.documentId === "demo-doc-1"), `missing search result: ${JSON.stringify(json)}`);
    },
  );
  await expectJson(`${frontendUrl}/api/v1/document/demo-doc-1/xray`, { headers: authHeaders }, (json) => {
    assert(json.document?.documentId === "demo-doc-1", `missing xray document: ${JSON.stringify(json)}`);
    assert(json.document.pages?.[0]?.elements?.some?.((element) => element.type === "heading"), `missing xray heading: ${JSON.stringify(json)}`);
  });
  await expectJson(
    `${frontendUrl}/api/llm/chat/completions`,
    {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ messages: [{ role: "user", content: "Summarize this." }] }),
    },
    (json) => {
      assert(json.object === "chat.completion", `LLM route did not return chat shape: ${JSON.stringify(json)}`);
      assert(json.requestMessageCount === 1, `LLM route did not count messages: ${JSON.stringify(json)}`);
    },
  );

  console.log("dev smoke passed: repository=memory, mockMode=true, frontend, middleware, /api proxy, auth, mock Partner, mock GroundX, X-Ray, and mock LLM are reachable.");
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
