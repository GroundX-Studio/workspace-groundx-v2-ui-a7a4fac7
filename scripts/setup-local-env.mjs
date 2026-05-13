#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = resolve(root, "middleware/.env.local");
const force = process.argv.includes("--force");

function readExistingEnv() {
  if (!existsSync(envPath) || force) return new Map();
  const values = new Map();
  const current = readFileSync(envPath, "utf8");
  for (const line of current.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
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

async function readLlmApiKey(existing) {
  if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY.trim();
  if (existing.get("LLM_API_KEY")) return existing.get("LLM_API_KEY");
  return promptSecret("LLM API key for local middleware completions");
}

const existing = readExistingEnv();
const partnerApiKey = await readPartnerApiKey(existing);
if (!partnerApiKey) {
  console.error("PARTNER_API_KEY is required to configure the scaffolded middleware for real GroundX calls.");
  console.error("Run: PARTNER_API_KEY=... LLM_API_KEY=... npm run setup:env");
  process.exit(1);
}

const llmApiKey = await readLlmApiKey(existing);
if (!llmApiKey) {
  console.error("LLM_API_KEY is required to configure the scaffolded middleware for real completions.");
  console.error("Run: PARTNER_API_KEY=... LLM_API_KEY=... npm run setup:env");
  process.exit(1);
}
const llmModelId = process.env.LLM_MODEL_ID?.trim() || existing.get("LLM_MODEL_ID") || "";

mkdirSync(dirname(envPath), { recursive: true });
writeFileSync(
  envPath,
  [
    "NODE_ENV=development",
    "PORT=3001",
    "LOG_LEVEL=info",
    "ALLOWED_ORIGIN=http://localhost:5173",
    "APP_REPOSITORY_MODE=memory",
    `SESSION_SECRET=${randomBytes(32).toString("hex")}`,
    "GROUNDX_BASE_URL=https://api.groundx.ai/api/v1",
    `GROUNDX_PARTNER_API_KEY=${partnerApiKey}`,
    "GROUNDX_ANON_API_KEY=",
    "LLM_BASE_URL=https://api.openai.com/v1",
    `LLM_API_KEY=${llmApiKey}`,
    "LLM_AUTH_HEADER_NAME=Authorization",
    "LLM_AUTH_SCHEME=Bearer",
    `LLM_MODEL_ID=${llmModelId}`,
    "",
  ].join("\n"),
  { mode: 0o600 },
);

console.log("Wrote middleware/.env.local for local development. The file is ignored by git.");
