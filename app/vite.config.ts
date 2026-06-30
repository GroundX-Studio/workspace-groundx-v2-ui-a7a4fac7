import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));
const muiIconsEsmPath = fileURLToPath(new URL("../node_modules/@mui/icons-material/esm", import.meta.url));
const muiSystemEsmPath = fileURLToPath(new URL("../node_modules/@mui/system/esm", import.meta.url));
const muiUtilsEsmPath = fileURLToPath(new URL("../node_modules/@mui/utils/esm", import.meta.url));
const appPort = Number(process.env.VITE_DEV_PORT ?? 5173);
const middlewarePort = Number(process.env.MIDDLEWARE_DEV_PORT ?? 3001);

function muiEsmSubpathResolver(pkg: string, esmPath: string) {
  return {
    name: `${pkg}-esm-subpath-resolver`,
    enforce: "pre" as const,
    resolveId(source: string) {
      if (source === pkg) return `${esmPath}/index.js`;
      if (!source.startsWith(`${pkg}/`)) return null;

      const subpath = source.slice(pkg.length + 1);
      const filePath = `${esmPath}/${subpath}.js`;
      if (existsSync(filePath)) return filePath;

      const indexPath = `${esmPath}/${subpath}/index.js`;
      if (existsSync(indexPath)) return indexPath;

      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    muiEsmSubpathResolver("@mui/icons-material", muiIconsEsmPath),
    muiEsmSubpathResolver("@mui/system", muiSystemEsmPath),
    muiEsmSubpathResolver("@mui/utils", muiUtilsEsmPath),
    react(),
  ],
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
  optimizeDeps: {
    // Vite/esbuild can split MUI's lazy theme init across optimized chunks so
    // `@mui/material/Box` calls `createTheme_default()` before that binding is
    // initialized. Keep Material UI and its icon package raw in dev; the
    // resolver above keeps those raw MUI files on ESM-only helper subpaths.
    exclude: ["@mui/material", "@mui/icons-material"],
    include: ["hoist-non-react-statics", "prop-types", "react-is"],
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
