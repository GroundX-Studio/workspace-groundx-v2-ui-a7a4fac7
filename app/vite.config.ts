import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const srcPath = new URL("./src", import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
});
