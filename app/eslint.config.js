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
  // ── ScopedViewerWidget reachability ban (2026-05-30-onboarding-shell-shared-view) ──
  //
  // The three registry-backed ScopedViewerWidget COMPONENTS (PdfViewer,
  // SmartReportRender, SmartReportBuilder) may be imported ONLY by the
  // production registry singleton (`scopedViewerWidgetRegistryProduction.ts`)
  // and each widget's own test. `<ScopedCanvas>` is the SOLE mount path, so
  // "unregistered" == "unreachable": a view that imports one of these
  // components directly would re-introduce the per-frame canvas fork the
  // `no-onboarding-duplicates` rule forbids. (The `*.tools.ts` descriptors are
  // NOT banned — the registry imports those; and the gate/book-call viewer
  // widgets — GateValueProp/BookCallView/SignUpWidget — are NOT ScopedViewerWidgets,
  // so they are not covered by this ban.)
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      // The sole legitimate non-test importer of the components.
      "src/widgets/scopedViewerWidgetRegistryProduction.ts",
      // Each widget's own test mounts its component directly (allowed).
      "src/components/viewer-widgets/PdfViewer/*.test.{ts,tsx}",
      "src/components/viewer-widgets/SmartReportRender/*.test.{ts,tsx}",
      "src/components/viewer-widgets/SmartReportBuilder/*.test.{ts,tsx}",
      // ── GRANDFATHERED, pending step-20 retirement/alignment ──
      // These six legacy views/shells still mount a ScopedViewerWidget
      // component directly. They are NO LONGER on the live OnboardingShell
      // canvas path (the shell mounts <ScopedCanvas>), but the files are not
      // deleted yet: the 5 onboarding per-frame views are retired in
      // onboarding-shell-shared-view Phase 3, and SteadyShell's own
      // doc-viewer canvas fork is aligned to <ScopedCanvas> in Phase 4
      // (both = the next execution-order step). Each exemption is removed as
      // its file is deleted/aligned there — the ban is otherwise fully active
      // for all new code.
      "src/views/Steady/SteadyShell/SteadyShell.tsx",
      "src/views/Onboarding/UnderstandView.tsx",
      "src/views/Onboarding/InteractView.tsx",
      "src/views/Onboarding/ExtractView.tsx",
      "src/views/Onboarding/ReportRenderView.tsx",
      "src/views/Onboarding/ReportBuilderView.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/components/viewer-widgets/PdfViewer/PdfViewerWidget",
                "**/viewer-widgets/PdfViewer/PdfViewerWidget",
                "@/components/viewer-widgets/SmartReportRender/SmartReportRender",
                "**/viewer-widgets/SmartReportRender/SmartReportRender",
                "@/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder",
                "**/viewer-widgets/SmartReportBuilder/SmartReportBuilder",
              ],
              message:
                "Import ScopedViewerWidget components only via the production registry " +
                "(scopedViewerWidgetRegistryProduction.ts) — <ScopedCanvas> is the sole mount path. " +
                "Mount them through <ScopedCanvas>, not directly.",
            },
          ],
        },
      ],
    },
  },
);
