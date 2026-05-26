import { createApp } from "./app.js";
import { loadEnv } from "./config/env.js";
import { MemoryAppRepository } from "./db/memoryRepository.js";
import { MySqlAppRepository } from "./db/mysqlRepository.js";
import { ScenarioRegistry } from "./scenarios/registry.js";
import { DevGroundXClient, DevGroundXPartnerClient, DevLlmClient } from "./services/devClients.js";
import { FetchGroundXClient } from "./services/groundxClient.js";
import { FetchGroundXPartnerClient } from "./services/groundxPartnerClient.js";
import { FetchLlmClient, isLightLlmConfigured } from "./services/llmClient.js";
import { logger } from "./lib/logger.js";
import { initTelemetry, shutdownTelemetry } from "./lib/telemetry.js";

const env = loadEnv();
const useMemoryRepository =
  env.APP_REPOSITORY_MODE === "memory" ||
  (env.APP_REPOSITORY_MODE === "auto" && env.NODE_ENV !== "production" && !env.MYSQL_HOST);
const useDevClients = env.NODE_ENV !== "production" && env.MOCK_MODE;

await initTelemetry(env);

const repository = useMemoryRepository ? new MemoryAppRepository() : new MySqlAppRepository(env);
await repository.createSchema();

// CF-16: build a separate light-side client only when LLM_LIGHT_* is
// fully wired in env. Otherwise leave it undefined — chatHandler reuses
// the chat client for compression (single-LLM back-compat).
const lightLlmClient = useDevClients
  ? undefined
  : isLightLlmConfigured(env)
    ? new FetchLlmClient(env, "light")
    : undefined;

const app = createApp({
  env,
  repository,
  partnerClient: useDevClients ? new DevGroundXPartnerClient() : new FetchGroundXPartnerClient(env),
  groundxClient: useDevClients ? new DevGroundXClient() : new FetchGroundXClient(env),
  llmClient: useDevClients ? new DevLlmClient() : new FetchLlmClient(env),
  lightLlmClient,
  scenarioRegistry: new ScenarioRegistry(env),
});

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, repository: useMemoryRepository ? "memory" : "mysql", devClients: useDevClients }, "GroundX middleware scaffold listening");
  logger.info(summarizeEnvForLog(env), "Recognized env vars (keys only; values redacted for secrets)");
});

/**
 * Diagnostic snapshot of the env vars the middleware recognizes —
 * keys + a `present`/`absent` flag (and the literal value for known-
 * non-secret config like APP_REPOSITORY_MODE / MOCK_MODE / NODE_ENV /
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
    "APP_REPOSITORY_MODE", "MOCK_MODE",
    "ALLOWED_ORIGIN",
    "GROUNDX_BASE_URL", "GROUNDX_SAMPLES_BUCKET_ID",
    "GROUNDX_PARTNER_API_KEY", "GROUNDX_ANON_API_KEY",
    "LLM_SERVICE", "LLM_BASE_URL", "LLM_MODEL_ID", "LLM_AUTH_HEADER_NAME", "LLM_AUTH_SCHEME", "LLM_API_KEY",
    "LLM_LIGHT_SERVICE", "LLM_LIGHT_BASE_URL", "LLM_LIGHT_MODEL_ID",
    "LLM_LIGHT_AUTH_HEADER_NAME", "LLM_LIGHT_AUTH_SCHEME", "LLM_LIGHT_API_KEY",
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
