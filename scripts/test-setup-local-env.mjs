#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const envPaths = [resolve(".env.local"), resolve("middleware/.env.local")];
const backups = envPaths.map((path) => `${path}.test-backup`);

function restore() {
  for (const [index, envPath] of envPaths.entries()) {
    rmSync(envPath, { force: true });
    if (existsSync(backups[index])) renameSync(backups[index], envPath);
  }
}

if (backups.some((backupPath) => existsSync(backupPath))) {
  throw new Error("Refusing to run because a .env.local test backup already exists.");
}

for (const [index, envPath] of envPaths.entries()) {
  if (existsSync(envPath)) renameSync(envPath, backups[index]);
}

try {
  const missing = spawnSync("node", ["scripts/setup-local-env.mjs", "--force"], {
    env: { ...process.env, PARTNER_API_KEY: "test-partner-key", LLM_SERVICE: "openai", LLM_MODEL_ID: "gpt-test", LLM_API_KEY: "", OPENAI_API_KEY: "", ANTHROPIC_API_KEY: "" },
    encoding: "utf8",
  });
  if (missing.status === 0) {
    throw new Error("setup-local-env should fail when LLM_API_KEY is missing.");
  }
  if (!missing.stderr.includes("LLM_API_KEY is required")) {
    throw new Error("setup-local-env missing-key error did not mention LLM_API_KEY.");
  }

  const missingService = spawnSync("node", ["scripts/setup-local-env.mjs", "--force"], {
    env: { ...process.env, PARTNER_API_KEY: "test-partner-key", LLM_SERVICE: "", LLM_MODEL_ID: "gpt-test", LLM_API_KEY: "test-llm-key" },
    encoding: "utf8",
  });
  if (missingService.status === 0) {
    throw new Error("setup-local-env should fail when LLM_SERVICE is missing.");
  }
  if (!missingService.stderr.includes("LLM_SERVICE is required")) {
    throw new Error("setup-local-env missing-service error did not mention LLM_SERVICE.");
  }

  const missingModel = spawnSync("node", ["scripts/setup-local-env.mjs", "--force"], {
    env: { ...process.env, PARTNER_API_KEY: "test-partner-key", LLM_SERVICE: "openai", LLM_MODEL_ID: "", LLM_API_KEY: "test-llm-key" },
    encoding: "utf8",
  });
  if (missingModel.status === 0) {
    throw new Error("setup-local-env should fail when LLM_MODEL_ID is missing.");
  }
  if (!missingModel.stderr.includes("LLM_MODEL_ID is required")) {
    throw new Error("setup-local-env missing-model error did not mention LLM_MODEL_ID.");
  }

  const success = spawnSync("node", ["scripts/setup-local-env.mjs", "--force"], {
    env: {
      ...process.env,
      PARTNER_API_KEY: "test-partner-key",
      LLM_SERVICE: "openai",
      LLM_MODEL_ID: "gpt-test",
      LLM_API_KEY: "test-llm-key",
    },
    encoding: "utf8",
  });
  if (success.status !== 0) {
    throw new Error(`setup-local-env failed with both keys:\n${success.stdout}\n${success.stderr}`);
  }

  for (const envPath of envPaths) {
    const written = readFileSync(envPath, "utf8");
    for (const required of [
      "GROUNDX_PARTNER_API_KEY=test-partner-key",
      "LLM_SERVICE=openai",
      "LLM_MODEL_ID=gpt-test",
      "LLM_API_KEY=test-llm-key",
      // GROUNDX_SAMPLES_BUCKET_ID is required for the onboarding
      // RAG flow — without it the chat router can't search the
      // samples bucket and every reply is "I don't have any snippets."
      // Setup writes the canonical dev value (28454) unless the user
      // overrides via env or an existing .env.local entry.
      "GROUNDX_SAMPLES_BUCKET_ID=28454",
    ]) {
      if (!written.includes(required)) throw new Error(`${envPath} missing ${required}`);
    }
    // 2026-06-01-retire-mock-mode: setup must NOT write a MOCK_MODE flag (the
    // runtime has no mock mode — it always uses the real GroundX / LLM clients).
    if (written.includes("MOCK_MODE")) throw new Error(`${envPath} must not contain MOCK_MODE`);
  }

  const aliasSuccess = spawnSync("node", ["scripts/setup-local-env.mjs", "--force"], {
    env: {
      ...process.env,
      PARTNER_API_KEY: "test-partner-key",
      LLM_SERVICE: "anthropic",
      LLM_MODEL_ID: "claude-test",
      LLM_API_KEY: "",
      ANTHROPIC_API_KEY: "test-anthropic-key",
    },
    encoding: "utf8",
  });
  if (aliasSuccess.status !== 0) {
    throw new Error(`setup-local-env failed to use service-specific LLM key alias:\n${aliasSuccess.stdout}\n${aliasSuccess.stderr}`);
  }
  const aliasWritten = readFileSync(resolve("middleware/.env.local"), "utf8");
  if (!aliasWritten.includes("LLM_API_KEY=test-anthropic-key")) {
    throw new Error("setup-local-env did not use ANTHROPIC_API_KEY when LLM_SERVICE=anthropic.");
  }

  console.log("setup-local-env contract passed.");
} finally {
  restore();
}
