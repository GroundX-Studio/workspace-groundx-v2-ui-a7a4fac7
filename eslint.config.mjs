// Flat ESLint config for the GroundX web UI scaffold (ESLint 9 + typescript-eslint 8).
//
// Philosophy: bug-catching rules are errors; stylistic / fast-refresh rules are
// warnings so `eslint .` gates on real problems without forcing a churn sweep
// across the existing scaffold. ESLint here lints for correctness, not layout —
// the recommended configs carry no formatting rules, so adopting a formatter
// (e.g. Prettier) later is a separate, non-conflicting decision.
//
// Scopes: app/src is browser + React; middleware + scripts are Node; test files
// add Node globals on top of their area.

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.config.{js,cjs,mjs,ts}",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Project-wide TypeScript rule tuning.
  {
    rules: {
      // tsc (strict) already proves identifiers are defined; no-undef double-checks
      // with no type awareness and false-positives on TS-only globals/types.
      "no-undef": "off",
      // Empty interfaces that extend one supertype are a deliberate naming pattern
      // (e.g. GroundXRequestOptions extends RequestOptions) — allow that form.
      "@typescript-eslint/no-empty-object-type": ["error", { allowInterfaces: "with-single-extends" }],
      // `declare global { namespace Express { ... } }` is the canonical Express
      // type augmentation; allow declaration namespaces while still banning runtime ones.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  // App: browser + React (hooks + fast refresh).
  {
    files: ["app/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Middleware + repo scripts: Node.
  {
    files: ["middleware/**/*.ts", "scripts/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Test + e2e files: add Node globals on top of whatever area they live in.
  {
    files: ["**/*.test.{ts,tsx}", "**/test/**/*.{ts,tsx}", "**/e2e/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
);
