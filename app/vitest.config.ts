import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));
const framerMotionMockPath = fileURLToPath(new URL("./src/test/framerMotionMock.tsx", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": srcPath,
      // Intercept framer-motion in tests. The real lib's `layout` + `repeat`
      // animations pin jsdom at 100% CPU; the mock keeps motion.X /
      // AnimatePresence / LayoutGroup / MotionConfig as plain passthroughs.
      "framer-motion": framerMotionMockPath,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    testTimeout: 10000,
    hookTimeout: 10000,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
