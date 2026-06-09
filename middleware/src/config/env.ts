import { config as loadDotenv } from "dotenv";
import { z } from "zod";

function loadLocalDotenv(source: NodeJS.ProcessEnv): void {
  if (source !== process.env || source.NODE_ENV === "test") return;
  // Precedence is explicit runtime env > .env.local > .env. Parent processes
  // such as the harness MCP server may set dynamic ports; local files should
  // fill gaps, not clobber those deliberate overrides.
  loadDotenv({ path: ".env.local", quiet: true });
  loadDotenv({ path: ".env", quiet: true });
}

function parseBoolean(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return value;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),
  PORT: z.coerce.number().int().positive().default(3001),
  GROUNDX_DEPLOY_COMMIT_SHA: z.string().optional(),
  GROUNDX_DEPLOY_ENVIRONMENT: z.string().optional(),
  GROUNDX_DEPLOY_IMAGE_TAG: z.string().optional(),
  GROUNDX_DEPLOY_NAMESPACE: z.string().optional(),
  GROUNDX_DEPLOY_PUBLIC_HOST: z.string().optional(),
  GROUNDX_DEPLOY_RELEASE_NAME: z.string().optional(),
  ALLOWED_ORIGIN: z.string().optional(),
  APP_REPOSITORY_MODE: z.enum(["auto", "memory", "mysql"]).default("auto"),
  MYSQL_HOST: z.string().optional(),
  MYSQL_PORT: z.coerce.number().int().positive().default(3306),
  MYSQL_DATABASE: z.string().optional(),
  MYSQL_USER: z.string().optional(),
  MYSQL_PASSWORD: z.string().optional(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters").default("dev-session-secret-change-before-production"),
  // Hard timeout for every upstream fetch (GroundX search/Partner/LLM).
  // Set well above the slowest legit call (grounded LLM completion is
  // 5–15s P95) but short enough to prevent a hung backend from holding
  // a DB pool connection indefinitely.
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(30_000),
  GROUNDX_BASE_URL: z.string().url().default("https://api.groundx.ai/api/v1"),
  GROUNDX_PARTNER_API_KEY: z.string().optional(),
  // Bucket holding the onboarding sample documents. The partner API key is
  // used directly against GroundX for this bucket — no per-customer key,
  // since samples are partner-owned content read by every visitor.
  GROUNDX_SAMPLES_BUCKET_ID: z.coerce.number().int().positive().optional(),
  LLM_SERVICE: z.string().optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_AUTH_HEADER_NAME: z.string().default("Authorization"),
  LLM_AUTH_SCHEME: z.string().default("Bearer"),
  LLM_MODEL_ID: z.string().optional(),
  // CF-16: light-side LLM profile. Used for tasks where a smaller /
  // cheaper / faster model is fine — today: leaf summarization +
  // meta-compaction. All six are optional: when any of base_url /
  // api_key / model_id is unset, the chat-side LLM is reused (back-
  // compat — existing single-LLM deployments keep working). Auth
  // header + scheme fall back to the chat-side equivalents.
  LLM_LIGHT_SERVICE: z.string().optional(),
  LLM_LIGHT_BASE_URL: z.string().url().optional(),
  LLM_LIGHT_API_KEY: z.string().optional(),
  LLM_LIGHT_AUTH_HEADER_NAME: z.string().optional(),
  LLM_LIGHT_AUTH_SCHEME: z.string().optional(),
  LLM_LIGHT_MODEL_ID: z.string().optional(),
  // LLM context window in tokens. Compression triggers at 70% of this.
  // Different models have wildly different windows (Claude Sonnet=200k,
  // GPT-4o=128k, GPT-3.5=16k) so the default is the conservative lower
  // bound; production deployments MUST set this to match their model.
  // Override range: 4k floor (smallest practical) → 1M ceiling
  // (Gemini 1.5 Pro extended).
  LLM_CONTEXT_WINDOW_TOKENS: z.coerce.number().int().min(4_000).max(1_000_000).default(16_000),
  // Fraction of the context window at which level-1 leaf compaction
  // fires. 0.7 leaves room for the LLM response; 0.5 = compress
  // earlier (streaming-friendly); 0.9 = pack more (risky).
  COMPRESSION_TRIGGER_RATIO: z.coerce.number().min(0.3).max(0.95).default(0.7),
  // Approximate token budget the leaf-compaction planner targets when
  // picking the message range to fold. Larger = fewer-but-bigger leaf
  // summaries; smaller = more leaves with finer time-slice fidelity.
  COMPRESSION_TARGET_TOKENS: z.coerce.number().int().min(100).max(10_000).default(1_000),
  // Level-2 meta-compaction trigger: when the count of ACTIVE
  // summaries exceeds this, the oldest batch gets folded into a
  // super-summary. Keep this comfortably > 1 so the LLM sees plenty
  // of leaf-fidelity history before any meta fold.
  MAX_ACTIVE_SUMMARIES_BEFORE_META: z.coerce.number().int().min(3).max(50).default(10),
  // Number of OLDEST active summaries to fold in one meta-compaction
  // pass. Pick so the post-fold active count is well under
  // MAX_ACTIVE_SUMMARIES_BEFORE_META — otherwise meta fires again
  // on the next chat post (wasteful LLM call).
  META_COMPACTION_BATCH_SIZE: z.coerce.number().int().min(2).max(20).default(5),
  // Hard cap on the LLM's output tokens for summarization calls.
  // Passed as `max_tokens` in the chat.completions body. ~600 fits
  // 10-14 bullet lines; an over-eager model can otherwise write a
  // summary so long it defeats the point of the compression.
  MAX_SUMMARY_OUTPUT_TOKENS: z.coerce.number().int().min(100).max(4_000).default(600),
  // Free-tier metering ceiling for BYO uploads (pages, not docs).
  BYO_PAGES_LIMIT: z.coerce.number().int().positive().default(100),
  // Rate limits. Tunable per-deploy via env so on-prem can dial down.
  RATE_LIMIT_AUTH_PER_MIN: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_API_PER_MIN: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_LLM_PER_MIN: z.coerce.number().int().positive().default(60),
  // Metrics + telemetry — off when unset; never required in dev.
  METRICS_ENABLED: z.preprocess(parseBoolean, z.boolean()).default(true),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
  OTEL_SERVICE_NAME: z.string().default("groundx-v2-ui-middleware"),
  POSTHOG_API_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().optional(),
  SENTRY_DSN: z.string().url().optional(),
  // Feature flags decided at deploy time. Defaults keep us safe.
  SSO_ENABLED: z.preprocess(parseBoolean, z.boolean()).default(false),
  DISABLE_AGENT_TURN_LOG: z.preprocess(parseBoolean, z.boolean()).default(false),
  // SC-01 — CSRF enforcement. Default `true` (production-safe). Tests
  // flip to `false` so route-business-logic suites don't have to
  // bootstrap a CSRF token on every supertest agent; SC-01-specific
  // tests opt back into `true` to exercise the defense.
  CSRF_ENABLED: z.preprocess(parseBoolean, z.boolean()).default(true),
}).superRefine((env, ctx) => {
  const requiresMysql = env.NODE_ENV === "production" || env.APP_REPOSITORY_MODE === "mysql";
  for (const key of ["MYSQL_HOST", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD"] as const) {
    if (requiresMysql && !env[key]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: `${key} is required when using MySQL` });
    }
  }
  if (env.NODE_ENV === "production" && env.SESSION_SECRET === "dev-session-secret-change-before-production") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SESSION_SECRET"],
      message: "SESSION_SECRET must be set to a non-default value in production",
    });
  }
  if (env.NODE_ENV === "production" && !env.GROUNDX_PARTNER_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GROUNDX_PARTNER_API_KEY"],
      message: "GROUNDX_PARTNER_API_KEY is required in production",
    });
  }
  if (env.NODE_ENV === "production" && !env.LLM_API_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LLM_API_KEY"],
      message: "LLM_API_KEY is required in production",
    });
  }
  if (env.NODE_ENV === "production" && !env.LLM_SERVICE) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LLM_SERVICE"],
      message: "LLM_SERVICE is required in production",
    });
  }
  if (env.NODE_ENV === "production" && !env.LLM_MODEL_ID) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LLM_MODEL_ID"],
      message: "LLM_MODEL_ID is required in production",
    });
  }
});

export type AppEnv = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): AppEnv {
  loadLocalDotenv(source);
  return envSchema.parse(source);
}
