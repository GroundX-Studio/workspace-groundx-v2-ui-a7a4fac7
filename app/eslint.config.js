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
      // Catch left-in debug logging (e.g. ungated `console.log` that ships
      // to prod). warn, matching this config's "warn side" posture;
      // `warn`/`error` stay allowed for real diagnostics. Intentional
      // DEV-only traces gate on `import.meta.env.DEV` + an explicit disable.
      "no-console": ["warn", { allow: ["warn", "error"] }],
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
      "src/components/viewer-widgets/Extract/*.test.{ts,tsx}",
      "src/components/viewer-widgets/Integrate/*.test.{ts,tsx}",
      // The Extract workbench composes <PdfViewerWidget> as its source pane
      // (a sub-pane, not a canvas dispatch) — the same internal compose the
      // legacy ExtractView did. Exempt the widget's own .tsx from the ban.
      "src/components/viewer-widgets/Extract/Extract.tsx",
      "src/components/viewer-widgets/SmartReportRender/*.test.{ts,tsx}",
      "src/components/viewer-widgets/SmartReportBuilder/*.test.{ts,tsx}",
      // 2026-05-31-shared-canvas-affordance-restoration — the six legacy
      // onboarding per-frame views (UnderstandView / InteractView / ExtractView /
      // IntegrateView / ReportRenderView / ReportBuilderView) are now DELETED:
      // the live shell mounts every canvas via <ScopedCanvas>, so "unregistered"
      // == "unreachable" holds with no grandfathered direct-importer. The
      // workbench/connector behavior tests that used to mount the ExtractView /
      // IntegrateView thin wrappers were retargeted to mount the production
      // widget through an in-file shim; those test files are exempted here (a
      // widget's own behavior test may import it directly — same allowance as
      // the co-located `viewer-widgets/*/*.test` exemptions above).
      "src/views/Onboarding/ExtractView.test.tsx",
      "src/views/Onboarding/SchemaView.test.tsx",
      "src/views/Onboarding/IntegrateView.test.tsx",
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
                "@/components/viewer-widgets/Extract/Extract",
                "**/viewer-widgets/Extract/Extract",
                "@/components/viewer-widgets/Integrate/Integrate",
                "**/viewer-widgets/Integrate/Integrate",
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
