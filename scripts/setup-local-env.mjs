#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rootEnvPath = resolve(root, ".env.local");
const middlewareEnvPath = resolve(root, "middleware/.env.local");
const force = process.argv.includes("--force");

function readEnvFile(path, values) {
  if (!existsSync(path) || force) return;
  const current = readFileSync(path, "utf8");
  for (const line of current.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
}

function readExistingEnv() {
  const values = new Map();
  readEnvFile(rootEnvPath, values);
  readEnvFile(middlewareEnvPath, values);
  return values;
}

async function promptSecret(label) {
  if (!process.stdin.isTTY) return "";

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const value = await rl.question(`${label}: `);
    return value.trim();
  } finally {
    rl.close();
  }
}

async function readPartnerApiKey(existing) {
  if (process.env.PARTNER_API_KEY) return process.env.PARTNER_API_KEY.trim();
  if (existing.get("GROUNDX_PARTNER_API_KEY")) return existing.get("GROUNDX_PARTNER_API_KEY");
  return promptSecret("Partner API key for local middleware proxying");
}

async function readLlmApiKey(existing, llmService) {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY.trim();
  if (existing.get("LLM_API_KEY")) return existing.get("LLM_API_KEY");
  const normalizedService = llmService.trim().toLowerCase();
  if (normalizedService === "openai" && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY.trim();
  if (normalizedService === "anthropic" && process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY.trim();
  return promptSecret("LLM API key for local middleware completions");
}

async function readLlmService(existing) {
  if (process.env.LLM_SERVICE) return process.env.LLM_SERVICE.trim();
  if (existing.get("LLM_SERVICE")) return existing.get("LLM_SERVICE");
  return promptSecret("LLM service/provider for local middleware completions");
}

async function readLlmModelId(existing) {
  if (process.env.LLM_MODEL_ID) return process.env.LLM_MODEL_ID.trim();
  if (existing.get("LLM_MODEL_ID")) return existing.get("LLM_MODEL_ID");
  return promptSecret("LLM model ID for local middleware completions");
}

// GROUNDX_SAMPLES_BUCKET_ID — required for the onboarding sample
// flow. The chat router's `deriveRagContentScope` falls back to
// this env var when the active entity has no scope refs. Without
// it, scope becomes `{kind:"unknown"}` and GroundX search no-ops →
// every chat reply degenerates to "I don't have any snippets."
// Default to 28454 (the canonical dev/staging samples bucket) so
// new clones work out of the box; override via env or by editing
// an existing .env.local for other deployments.
function readSamplesBucketId(existing) {
  if (process.env.GROUNDX_SAMPLES_BUCKET_ID) return process.env.GROUNDX_SAMPLES_BUCKET_ID.trim();
  if (existing.get("GROUNDX_SAMPLES_BUCKET_ID")) return existing.get("GROUNDX_SAMPLES_BUCKET_ID");
  return "28454";
}

const existing = readExistingEnv();
const partnerApiKey = await readPartnerApiKey(existing);
if (!partnerApiKey) {
  console.error("PARTNER_API_KEY is required to configure the scaffolded middleware for real GroundX calls.");
  console.error("Run: PARTNER_API_KEY=... LLM_SERVICE=... LLM_MODEL_ID=... LLM_API_KEY=... npm run setup:env");
  process.exit(1);
}

const llmService = await readLlmService(existing);
if (!llmService) {
  console.error("LLM_SERVICE is required to configure the scaffolded middleware for real completions.");
  console.error("Run: PARTNER_API_KEY=... LLM_SERVICE=... LLM_MODEL_ID=... LLM_API_KEY=... npm run setup:env");
  process.exit(1);
}

const llmModelId = await readLlmModelId(existing);
if (!llmModelId) {
  console.error("LLM_MODEL_ID is required to configure the scaffolded middleware for real completions.");
  console.error("Run: PARTNER_API_KEY=... LLM_SERVICE=... LLM_MODEL_ID=... LLM_API_KEY=... npm run setup:env");
  process.exit(1);
}

const llmApiKey = await readLlmApiKey(existing, llmService);
if (!llmApiKey) {
  console.error("LLM_API_KEY is required to configure the scaffolded middleware for real completions.");
  console.error("If LLM_SERVICE=openai, OPENAI_API_KEY may be used. If LLM_SERVICE=anthropic, ANTHROPIC_API_KEY may be used.");
  console.error("Run: PARTNER_API_KEY=... LLM_SERVICE=... LLM_MODEL_ID=... LLM_API_KEY=... npm run setup:env");
  process.exit(1);
}

const samplesBucketId = readSamplesBucketId(existing);

const envLines = [
    "NODE_ENV=development",
    "PORT=3001",
    "LOG_LEVEL=info",
    "ALLOWED_ORIGIN=http://localhost:5173",
    "MOCK_MODE=true",
    "APP_REPOSITORY_MODE=memory",
    `SESSION_SECRET=${randomBytes(32).toString("hex")}`,
    "GROUNDX_BASE_URL=https://api.groundx.ai/api/v1",
    `GROUNDX_PARTNER_API_KEY=${partnerApiKey}`,
    "GROUNDX_ANON_API_KEY=",
    // Required for onboarding RAG — see readSamplesBucketId().
    `GROUNDX_SAMPLES_BUCKET_ID=${samplesBucketId}`,
    `LLM_SERVICE=${llmService}`,
    "LLM_BASE_URL=https://api.openai.com/v1",
    `LLM_API_KEY=${llmApiKey}`,
    "LLM_AUTH_HEADER_NAME=Authorization",
    "LLM_AUTH_SCHEME=Bearer",
    `LLM_MODEL_ID=${llmModelId}`,
    "",
  ].join("\n");

mkdirSync(dirname(middlewareEnvPath), { recursive: true });
writeFileSync(rootEnvPath, envLines, { mode: 0o600 });
writeFileSync(middlewareEnvPath, envLines, { mode: 0o600 });

console.log("Wrote .env.local and middleware/.env.local for local development. Both files are ignored by git.");
