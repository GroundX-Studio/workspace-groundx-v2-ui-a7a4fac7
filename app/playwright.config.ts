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
        `PORT=${middlewarePort} MOCK_MODE=true APP_REPOSITORY_MODE=memory METRICS_ENABLED=false npm --workspace @groundx/web-ui-scaffold-middleware run start`,
      ].join(" && "),
      url: `${middlewareBaseUrl}/api/healthz`,
      reuseExistingServer: false,
      timeout: 120_000,
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
