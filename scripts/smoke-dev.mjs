#!/usr/bin/env node
import { spawn } from "node:child_process";

const timeoutMs = 45_000;
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

const child = spawn("npm", ["run", "dev"], {
  detached: true,
  env: {
    ...process.env,
    GROUNDX_PARTNER_API_KEY: process.env.GROUNDX_PARTNER_API_KEY ?? "smoke-partner-key",
    LLM_API_KEY: process.env.LLM_API_KEY ?? "smoke-llm-key",
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
  await waitFor("http://localhost:3001/api/healthz", "middleware");
  await waitFor("http://localhost:5173", "frontend");
  const proxied = await waitFor("http://localhost:5173/api/healthz", "frontend proxy");
  const body = await proxied.json();
  if (body.status !== "ok") throw new Error(`frontend proxy returned unexpected body: ${JSON.stringify(body)}`);
  console.log("dev smoke passed: frontend, middleware, and /api proxy are reachable.");
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
