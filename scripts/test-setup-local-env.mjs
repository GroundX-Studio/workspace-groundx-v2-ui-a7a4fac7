#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve("middleware/.env.local");
const backupPath = resolve("middleware/.env.local.test-backup");

function restore() {
  rmSync(envPath, { force: true });
  if (existsSync(backupPath)) renameSync(backupPath, envPath);
}

if (existsSync(backupPath)) {
  throw new Error("Refusing to run because middleware/.env.local.test-backup already exists.");
}

if (existsSync(envPath)) renameSync(envPath, backupPath);

try {
  const missing = spawnSync("node", ["scripts/setup-local-env.mjs", "--force"], {
    env: { ...process.env, PARTNER_API_KEY: "test-partner-key", LLM_API_KEY: "" },
    encoding: "utf8",
  });
  if (missing.status === 0) {
    throw new Error("setup-local-env should fail when LLM_API_KEY is missing.");
  }
  if (!missing.stderr.includes("LLM_API_KEY is required")) {
    throw new Error("setup-local-env missing-key error did not mention LLM_API_KEY.");
  }

  const success = spawnSync("node", ["scripts/setup-local-env.mjs", "--force"], {
    env: { ...process.env, PARTNER_API_KEY: "test-partner-key", LLM_API_KEY: "test-llm-key" },
    encoding: "utf8",
  });
  if (success.status !== 0) {
    throw new Error(`setup-local-env failed with both keys:\n${success.stdout}\n${success.stderr}`);
  }

  const written = readFileSync(envPath, "utf8");
  for (const required of [
    "GROUNDX_PARTNER_API_KEY=test-partner-key",
    "LLM_API_KEY=test-llm-key",
    "APP_REPOSITORY_MODE=memory",
  ]) {
    if (!written.includes(required)) throw new Error(`middleware/.env.local missing ${required}`);
  }

  console.log("setup-local-env contract passed.");
} finally {
  restore();
}
