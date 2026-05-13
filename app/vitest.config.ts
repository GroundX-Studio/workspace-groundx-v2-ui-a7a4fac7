import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const srcPath = new URL("./src", import.meta.url).pathname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
