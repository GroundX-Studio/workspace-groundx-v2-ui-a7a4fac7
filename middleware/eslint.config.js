// OPS-05 — initial ESLint flat config (middleware).
//
// Sibling to app/eslint.config.js. Node globals + no React. The
// "no-console" rule matters here because chatRouter.ts had two
// `eslint-disable` lines pointing at non-existent rules (the
// disable was vestigial — there was no rule to disable). Once OB-09
// closes those warns through pino, no-console flips to error.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "**/*.d.ts", "scripts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.es2022 },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // OB-09 will migrate the two remaining `console.warn` calls in
      // chatRouter.ts to pino; until then warn so we don't add more.
      "no-console": ["warn", { allow: ["info"] }],
      // Express type augmentation legitimately needs `namespace` syntax
      // (see middleware/src/session.ts). Demote to warn.
      "@typescript-eslint/no-namespace": "warn",
      // `let x = null` + reassignment in catch is a legitimate pattern;
      // the rule false-positives because the initial value is dead in
      // the happy path. Demote to warn.
      "no-useless-assignment": "warn",
    },
  },
  {
    files: ["src/**/*.test.ts", "src/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "no-console": "off",
    },
  },
);
