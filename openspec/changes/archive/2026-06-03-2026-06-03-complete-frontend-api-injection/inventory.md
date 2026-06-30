# Frontend API injection inventory

Generated for T0 of `2026-06-03-complete-frontend-api-injection`.

Scan commands:

```bash
rg -l "from ['\"]@/api|import\(['\"]@/api|vi\.mock\(['\"]@/api" app/src | sort
rg -l "from ['\"]@/lib/sentry|vi\.mock\(['\"]@/lib/sentry|captureException" app/src | sort
rg -n "import \{ api \} from ['\"]@/api|vi\.mock\(['\"]@/api['\"]" app/src/contexts app/src/views app/src/components app/src/lib app/src/conversation app/src/test | sort
```

## Locked execution shape

- T1 resources: migrate resource providers and their tests from the legacy `@/api`
  aggregate to injected resource groups.
- T2 scenario/canvas/reset/sign-up/PDF: migrate scenario registry, canvas intent,
  debug reset, sign-up, PDF viewer, and the app/onboarding tests that still mock
  aggregate/scenario/intent/report helpers.
- T3 extract: migrate Extract, SchemaView, ProposeSchemaFieldCard,
  `useLiveExtract`, `useLiveExtractionSchema`, field geometry, template save,
  workflow schema, and extract-field call sites.
- T4 smart-report: migrate SmartReportBuilder, SmartReportRender, and remaining
  onboarding-shell smart-report test seams.
- T5 telemetry: migrate rendered runtime capture to
  `Api.telemetry.captureException`; production `initSentry` remains outside the
  runtime capture seam.
- T6 cleanup/guard: remove or quarantine the app-facing `@/api` aggregate, widen
  `frontend-api-injection-guard.test.ts`, and update agent references.
- T7 final: full validation, Chrome DevTools MCP smoke, GitHub #10 close,
  OpenSpec archive.

## T1 resources

Production files to migrate:

- `app/src/contexts/ApiKeysContext/ApiKeysProvider.tsx`
- `app/src/contexts/BucketsContext/BucketsProvider.tsx`
- `app/src/contexts/DocumentsContext/DocumentsProvider.tsx`
- `app/src/contexts/GroupsContext/GroupsProvider.tsx`
- `app/src/contexts/HealthContext/HealthProvider.tsx`
- `app/src/contexts/ProjectsContext/ProjectsProvider.tsx`
- `app/src/contexts/SearchContext/SearchProvider.tsx`
- `app/src/contexts/WorkflowsContext/WorkflowsProvider.tsx`

Tests to retarget to one injected fake:

- `app/src/contexts/ApiKeysContext/ApiKeysProvider.test.tsx`
- `app/src/contexts/BucketsContext/BucketsProvider.test.tsx`
- `app/src/contexts/DocumentsContext/DocumentsProvider.test.tsx`
- `app/src/contexts/GroupsContext/GroupsProvider.test.tsx`
- `app/src/contexts/HealthContext/HealthProvider.test.tsx`
- `app/src/contexts/ProjectsContext/ProjectsProvider.test.tsx`
- `app/src/contexts/sdkContexts.test.tsx`

Type-only imports in the matching `*Context.tsx` files may remain until a future
type-surface cleanup.

## T2 scenario/canvas/reset/sign-up/PDF

Production files to migrate:

- `app/src/contexts/ScenarioRegistryContext/ScenarioRegistryContext.tsx`
- `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx`
- `app/src/lib/resetExperience.ts`
- `app/src/components/viewer-widgets/SignUpWidget/SignUpWidget.tsx`

Tests to retarget:

- `app/src/App.test.tsx`
- `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.test.tsx`
- `app/src/lib/resetExperience.test.ts`
- `app/src/components/viewer-widgets/PdfViewer/PdfViewerWidget.test.tsx`
- `app/src/components/viewer-widgets/SignUpWidget/SignUpWidget.test.tsx`
- `app/src/views/Onboarding/anonSessionOrdering.test.tsx`

Notes:

- `app/src/components/viewer-widgets/PdfViewer/PdfViewerWidget.tsx` currently
  imports only utility/type surfaces (`documentId`, `DocumentXrayResponse`), not
  an app-facing network function.
- `app/src/App.tsx` is the composition root and remains allowed to import
  `realApi` from `@/api/client`.
- `app/src/main.tsx` may keep `initSentry`; runtime capture migrates separately.

## T3 extract

Production files to migrate:

- `app/src/components/chat-widgets/ProposeSchemaFieldCard/ProposeSchemaFieldCard.tsx`
- `app/src/components/viewer-widgets/Extract/Extract.tsx`
- `app/src/components/viewer-widgets/Extract/SchemaView.tsx`
- `app/src/conversation/experiences/onboarding/experience.tsx`
- `app/src/api/useLiveExtract.ts`
- `app/src/api/useLiveExtractionSchema.ts`

T6 cleanup moved the pure helper implementations to:

- `app/src/hooks/liveExtractData.ts`
- `app/src/hooks/liveExtractionSchemaData.ts`

Tests to retarget:

- `app/src/api/useLiveExtract.test.ts`
- `app/src/api/useLiveExtractionSchema.test.ts`
- `app/src/components/chat-widgets/ChatColumn/ChatColumn.test.tsx`
- `app/src/components/chat-widgets/ProposeSchemaFieldCard/ProposeSchemaFieldCard.test.tsx`
- `app/src/views/Onboarding/SchemaView.test.tsx`

Implementation modules that may remain under `app/src/api` until the final guard
allowlist decision:

- `app/src/api/extractField.ts`
- `app/src/api/extractLiveData.ts`
- `app/src/api/fieldGeometry.ts`
- `app/src/api/templates.ts`

## T4 smart-report

Production files to migrate:

- `app/src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.tsx`
- `app/src/components/viewer-widgets/SmartReportRender/SmartReportRender.tsx`

Tests to retarget:

- `app/src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.test.tsx`
- `app/src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx`
- `app/src/views/Onboarding/OnboardingShell.test.tsx`
- `app/src/views/Onboarding/anonSessionOrdering.test.tsx`

Implementation modules:

- `app/src/api/smartReport.ts`

## T5 telemetry

Rendered runtime capture call sites to migrate:

- `app/src/components/chat-widgets/ProposeSchemaFieldCard/ProposeSchemaFieldCard.tsx`
- `app/src/components/layout/AppErrorBoundary/AppErrorBoundary.tsx`
- `app/src/components/viewer-widgets/SignUpWidget/SignUpWidget.tsx`
- `app/src/contexts/AuthContext/AuthProvider.tsx`
- `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx`
- `app/src/contexts/ChatStoreContext/ChatStoreServerHydrator.tsx`
- `app/src/conversation/useConversation.ts`

Rendered runtime tests to retarget from `vi.mock("@/lib/sentry")`:

- `app/src/components/viewer-widgets/SignUpWidget/SignUpWidget.test.tsx`
- `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.test.tsx`
- `app/src/contexts/ChatStoreContext/ChatStoreServerHydrator.test.tsx`

Low-level wrapper/API implementation tests that remain allowlisted:

- `app/src/lib/sentry.test.ts`
- `app/src/api/chatSessionEntities.test.ts`
- `app/src/api/chatSessionPatch.test.ts`
- `app/src/api/chatSessions.test.ts`
- `app/src/api/intentLog.test.ts`
- `app/src/api/smartReport.test.ts`
- `app/src/api/viewerEvents.test.ts`

## T6 final implementation allowlists

Allowed API implementation files:

- `app/src/api/**/*.ts` implementation modules and their unit tests when they
  test transport/wrapper behavior directly.
- `app/src/api/client.ts` while it composes the real injected client.

Allowed type-only or non-network helper imports:

- Type imports from `@/api/...`.
- `@/api/chatErrors`.
- `@/api/documentId`.
- `@/api/extractLiveData` as a pure conversion helper until T3 decides whether
  to move it beside the extract runtime surface.
- `@/api/common` and SDK wire types in context type files until separate
  type-surface cleanup.

Final guard should reject app-facing value imports from the legacy `@/api`
aggregate, standalone network modules, and rendered-runtime Sentry wrapper
imports outside the allowlists above.
