// OPS-05 — initial ESLint flat config (frontend).
//
// Why this exists: before this file, `npx eslint src` errored with
// "no config found." The project shipped TypeScript + React without a
// lint config. This file is the bootstrap. It deliberately starts on
// the warn side for most rules so we don't drown a 600+ test repo in
// new red lines on day one — the next-iteration pass tightens.
//
// Scope: frontend only. The middleware package ships its own
// `eslint.config.js` so each workspace can keep an honest globals
// list and ignore set.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  {
    // Files outside src/ (vite.config.ts, the test setup harness)
    // aren't expected to lint clean against the React surface yet.
    ignores: ["dist/**", "node_modules/**", "**/*.d.ts", "e2e/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2022 },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // React hooks rules of life. Warn for now — there are sites
      // that already lean on `useEffect` patterns the strict rule
      // would flag.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // We use `_unused` and `_err` deliberately in some signatures.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // The codebase has `as unknown as T` in test mocks deliberately;
      // demote to warn so the type-escape audit (cf. discovery
      // checklist) is its own concern.
      "@typescript-eslint/no-explicit-any": "warn",
      // `interface GroundXRequestOptions extends RequestOptions {}` is a
      // deliberate naming pattern in api/common.ts so each API surface
      // has its own option type even when shapes overlap. Demote to warn.
      "@typescript-eslint/no-empty-object-type": "warn",
    },
  },
  {
    // Test files relax a few rules — mocks need `any` + unused params.
    files: ["src/**/*.test.{ts,tsx}", "src/test/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
