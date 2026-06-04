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
    // The React runtime is split out below; the main chunk is then app code +
    // MUI/Emotion, which for a Material UI app legitimately lands around 0.5 MB
    // raw (~0.15 MB gzipped). 600 kB keeps the warning meaningful for real
    // regressions without firing on normal MUI weight.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Split only the React runtime into its own long-lived cache chunk. React
        // is a leaf dependency (app code imports it, it imports nothing back), so
        // this is cycle-safe. MUI + Emotion are deliberately left in the main
        // chunk together: separating them across chunks reorders their circular
        // module init and throws "Cannot access X before initialization" at runtime.
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },
});
