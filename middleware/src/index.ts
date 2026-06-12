import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { MySqlAppRepository } from "./db/mysqlRepository.js";
import { seedSampleProject } from "./db/seedSampleProject.js";
import { ScenarioRegistry } from "./scenarios/registry.js";
import { FetchGroundXClient } from "./services/groundxClient.js";
import { FetchGroundXPartnerClient } from "./services/groundxPartnerClient.js";
import { FetchLlmClient, isEmbeddingsConfigured, isLightLlmConfigured } from "./services/llmClient.js";
import { makeQuoteEmbedder } from "./services/quoteEmbedder.js";
import { logger } from "./lib/logger.js";
import { initTelemetry, shutdownTelemetry } from "./lib/telemetry.js";

const env = loadEnv();

await initTelemetry(env);

// MySQL is the ONLY runtime repository (retire-memory-repository-mode,
// 2026-06-11). `loadEnv` already failed fast above if MYSQL_* is missing —
// chat history must never silently live in process RAM. The in-memory
// repository survives only as a vitest-injected test double.
const repository = new MySqlAppRepository(env);
await repository.createSchema();

// Seed the public sample project (first projects row) so the scope→GroundX
// filter path resolves the sample doc for everyone. Idempotent; gated on a
// configured samples bucket (the only place the sample doc can live).
if (env.GROUNDX_SAMPLES_BUCKET_ID != null) {
  await seedSampleProject(repository, env.GROUNDX_SAMPLES_BUCKET_ID);
}

// CF-16: build a separate light-side client only when LLM_LIGHT_* is
// fully wired in env. Otherwise leave it undefined — chatHandler reuses
// the chat client for compression (single-LLM back-compat).
const lightLlmClient = isLightLlmConfigured(env) ? new FetchLlmClient(env, "light") : undefined;

// wire-embedding-verification: build the live quote embedder (the third
// citation-verification gate) when the EMBEDDINGS_* provider is wired.
// Always-on posture: production REQUIRES the provider (env fails fast);
// dev/test without it degrades to lexical-only verification — warn loudly
// so the weaker tier is never a silent surprise.
const quoteEmbedder = isEmbeddingsConfigured(env)
  ? makeQuoteEmbedder(new FetchLlmClient(env, "embeddings"), env.EMBEDDINGS_MODEL_ID as string)
  : undefined;
if (!quoteEmbedder) {
  logger.warn(
    "EMBEDDINGS_BASE_URL/EMBEDDINGS_MODEL_ID not configured — citation verification degrades to lexical-only (meaning-level paraphrase quotes will render as ambient)",
  );
}

// The runtime always uses the real Fetch* clients — there is no mock/dev-client
// mode (2026-06-01-retire-mock-mode). Tests inject fakes at the dependency seam.
const app = createApp({
  env,
  repository,
  partnerClient: new FetchGroundXPartnerClient(env),
  groundxClient: new FetchGroundXClient(env),
  llmClient: new FetchLlmClient(env),
  lightLlmClient,
  quoteEmbedder,
  embedThreshold: env.EMBEDDINGS_VERIFY_THRESHOLD,
  scenarioRegistry: new ScenarioRegistry(env),
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, repository: "mysql" }, "GroundX middleware scaffold listening");
  logger.info(summarizeEnvForLog(env), "Recognized env vars (keys only; values redacted for secrets)");
});

/**
 * Diagnostic snapshot of the env vars the middleware recognizes —
 * keys + a `present`/`absent` flag (and the literal value for known-
 * non-secret config like NODE_ENV /
 * LLM_SERVICE / LLM_MODEL_ID / GROUNDX_BASE_URL / MYSQL_HOST etc.).
 * Secret-bearing keys (anything matching /KEY|TOKEN|SECRET|PASSWORD/i)
 * surface only as `present: true` so the log doesn't leak values.
 * Useful for confirming from a `kubectl logs` that the K8s Secret
 * mount + the workflow's env propagation actually reached the pod.
 */
function summarizeEnvForLog(env: Record<string, unknown>) {
  const SECRET_PATTERN = /KEY|TOKEN|SECRET|PASSWORD/i;
  const recognized = [
    "NODE_ENV", "PORT", "LOG_LEVEL",
    "ALLOWED_ORIGIN",
    "GROUNDX_BASE_URL", "GROUNDX_SAMPLES_BUCKET_ID",
    "GROUNDX_PARTNER_API_KEY",
    "LLM_SERVICE", "LLM_BASE_URL", "LLM_MODEL_ID", "LLM_AUTH_HEADER_NAME", "LLM_AUTH_SCHEME", "LLM_API_KEY",
    "LLM_LIGHT_SERVICE", "LLM_LIGHT_BASE_URL", "LLM_LIGHT_MODEL_ID",
    "LLM_LIGHT_AUTH_HEADER_NAME", "LLM_LIGHT_AUTH_SCHEME", "LLM_LIGHT_API_KEY",
    "EMBEDDINGS_BASE_URL", "EMBEDDINGS_MODEL_ID", "EMBEDDINGS_API_KEY",
    "EMBEDDINGS_AUTH_HEADER_NAME", "EMBEDDINGS_AUTH_SCHEME",
    "EMBEDDINGS_VERIFY_THRESHOLD", "EMBEDDINGS_TIMEOUT_MS",
    "BYO_PAGES_LIMIT",
    "RATE_LIMIT_AUTH_PER_MIN", "RATE_LIMIT_API_PER_MIN", "RATE_LIMIT_LLM_PER_MIN",
    "METRICS_ENABLED",
    "OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_SERVICE_NAME",
    "POSTHOG_API_KEY", "POSTHOG_HOST",
    "SENTRY_DSN",
    "SSO_ENABLED", "DISABLE_AGENT_TURN_LOG",
    "SESSION_SECRET",
    "MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD",
  ];
  const summary: Record<string, unknown> = {};
  for (const key of recognized) {
    const raw = (env as Record<string, unknown>)[key];
    const present = raw != null && raw !== "";
    if (!present) {
      summary[key] = "absent";
      continue;
    }
    if (SECRET_PATTERN.test(key)) {
      summary[key] = "present";
      continue;
    }
    summary[key] = raw;
  }
  return { recognizedEnv: summary };
}

const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
  logger.info({ signal }, "Shutting down");
  await shutdownTelemetry();
  server.close(() => process.exit(0));
  // Force-exit if the HTTP server lingers (open keep-alive sockets).
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
