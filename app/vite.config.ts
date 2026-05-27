import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));
const appPort = Number(process.env.VITE_DEV_PORT ?? 5173);
const middlewarePort = Number(process.env.MIDDLEWARE_DEV_PORT ?? 3001);

export default defineConfig({
  plugins: [react()],
  server: {
    port: appPort,
    proxy: {
      "/api": {
        target: `http://localhost:${middlewarePort}`,
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
  build: {
    // OB-05 (2026-05-27) — emit sourcemaps for prod builds so Sentry
    // stack traces resolve to TS file + line, not minified js. Mode
    // "hidden" generates the .map files but DOES NOT emit the
    // `//# sourceMappingURL=` comment in the bundled .js, so source
    // maps are never publicly served alongside the production assets.
    // CI uploads them to Sentry via `sentry-cli sourcemaps upload`
    // (deploy.yml step gated on the SENTRY_AUTH_TOKEN secret).
    //
    // After upload, CI deletes the .map files from the Docker build
    // context so the runtime image never ships them. If the secret
    // is unset (e.g. first deploys before Sentry is provisioned),
    // the upload step skips and the .map files still get deleted at
    // the same point — no exposure.
    sourcemap: "hidden",
  },
});
