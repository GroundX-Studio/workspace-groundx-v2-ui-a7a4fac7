import { defineConfig } from "@playwright/test";

const appPort = Number(process.env.PLAYWRIGHT_APP_PORT ?? 4173);
const middlewarePort = Number(process.env.PLAYWRIGHT_MIDDLEWARE_PORT ?? 3001);
const appBaseUrl = `http://127.0.0.1:${appPort}`;
const middlewareBaseUrl = `http://127.0.0.1:${middlewarePort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: appBaseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: [
        "npm --workspace @groundx/web-ui-scaffold-middleware run build",
        // The middleware boots in REAL mode against the live GroundX backend —
        // there is no MOCK_MODE (2026-06-01-retire-mock-mode). The deterministic
        // e2e data is the seeded sample doc c3bfff49 in bucket 28454, which is
        // stable. The Partner key + GroundX base URL come from the environment
        // (a CI secret in CI; .env.local locally). The repository is MySQL —
        // the ONLY runtime repository (retire-memory-repository-mode,
        // 2026-06-11): MYSQL_* comes from .env.local locally (the dev RDS) or
        // a CI-provided database; the suite asserts live-stable structural
        // invariants, never row-level fixture state, so a shared DB is fine.
        `PORT=${middlewarePort} METRICS_ENABLED=false npm --workspace @groundx/web-ui-scaffold-middleware run start`,
      ].join(" && "),
      url: `${middlewareBaseUrl}/api/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        // Pass the real GroundX credentials through to the middleware. Sourced
        // from a CI secret (see .github/workflows/ci.yml, `dev` environment) or
        // from .env.local locally. The middleware's loadEnv also reads .env.local
        // directly, so a missing value here just falls back to that file.
        ...(process.env.GROUNDX_PARTNER_API_KEY
          ? { GROUNDX_PARTNER_API_KEY: process.env.GROUNDX_PARTNER_API_KEY }
          : {}),
        ...(process.env.GROUNDX_BASE_URL ? { GROUNDX_BASE_URL: process.env.GROUNDX_BASE_URL } : {}),
        ...(process.env.GROUNDX_SAMPLES_BUCKET_ID
          ? { GROUNDX_SAMPLES_BUCKET_ID: process.env.GROUNDX_SAMPLES_BUCKET_ID }
          : { GROUNDX_SAMPLES_BUCKET_ID: "28454" }),
        ...(process.env.LLM_SERVICE ? { LLM_SERVICE: process.env.LLM_SERVICE } : {}),
        ...(process.env.LLM_BASE_URL ? { LLM_BASE_URL: process.env.LLM_BASE_URL } : {}),
        ...(process.env.LLM_API_KEY ? { LLM_API_KEY: process.env.LLM_API_KEY } : {}),
        ...(process.env.LLM_MODEL_ID ? { LLM_MODEL_ID: process.env.LLM_MODEL_ID } : {}),
      },
    },
    {
      command: [
        `MIDDLEWARE_DEV_PORT=${middlewarePort} npm run build`,
        `MIDDLEWARE_DEV_PORT=${middlewarePort} npm run preview -- --host 127.0.0.1 --port ${appPort}`,
      ].join(" && "),
      url: appBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet", use: { viewport: { width: 820, height: 1180 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
