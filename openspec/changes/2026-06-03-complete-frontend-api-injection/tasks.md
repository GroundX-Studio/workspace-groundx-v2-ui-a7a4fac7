# Tasks - complete frontend API injection (#10)

Sequential. TDD failing-test-first. Every task has an adversarial review gate
before marking it done and before starting the next task.

## T1 - Complete the injected Api surface for remaining domains

- [ ] **Failing test first:** extend `api/client.test.ts` and
      `makeFakeApi.test.ts` to assert grouped members exist for resources,
      scenarios, extract, smart-report/report templates, viewer/PDF support,
      canvas intent, reset/sign-up auth helpers, and telemetry/error capture.
- [ ] Add the grouped members to `realApi`, preserving current runtime function
      behavior and stable references.
- [ ] Add fake defaults and deep overrides for each new group so render harnesses
      can override one method without replacing sibling methods.
- [ ] Keep low-level API implementation tests able to import and mock transport
      modules directly; this task is about the injected app-facing surface.
- **Adversarial review:** inspect the grouped real client and fake for dormant
  or missing members; run `npm --workspace app exec vitest run src/api/client.test.ts
  src/test/makeFakeApi.test.ts`; run `npm run build`.

## T2 - Migrate resource provider domains

- [ ] **Failing test first:** convert one resource-provider test to
      `renderWithAppProviders(..., { api: { resources: ... } })` or
      `withApiProvider(..., { resources: ... })` and confirm it fails until the
      provider reads `useApi()`.
- [ ] Migrate `BucketsProvider`, `DocumentsProvider`, `GroupsProvider`,
      `ProjectsProvider`, `WorkflowsProvider`, `ApiKeysProvider`,
      `HealthProvider`, and `SearchProvider` from `import { api } from "@/api"`
      to the relevant injected resource groups.
- [ ] Convert resource-context wire-shape imports to `import type` where they are
      type-only.
- [ ] Replace the provider tests' per-file `vi.mock("@/api")` with one injected
      fake and visible/provider-state assertions.
- **Adversarial review:** grep resource contexts/tests for direct `@/api` value
  imports and `vi.mock("@/api")`; inspect hook dependency arrays; run focused
  provider tests for all migrated resource contexts.

## T3 - Migrate scenario registry, canvas intent, reset, sign-up, and PDF viewer consumers

- [ ] **Failing test first:** retarget one scenario/canvas/widget test to the
      injected fake and prove it fails before its consumer switches to `useApi()`.
- [ ] Migrate `ScenarioRegistryContext` to the injected scenario group.
- [ ] Migrate `CanvasOrchestratorContext` and related intent tests to the
      injected intent/telemetry group instead of direct `recordIntent` /
      `captureException` imports.
- [ ] Migrate `resetExperience` and `SignUpWidget` customer-auth/reset calls to
      injected auth/reset helpers while preserving session-reset behavior.
- [ ] Migrate `PdfViewerWidget` tests and any PDF-viewer app-facing network calls
      to the injected viewer/document group.
- **Adversarial review:** grep these domains for direct app-facing network
  imports and Sentry mocks; run focused scenario registry, canvas orchestrator,
  reset, sign-up, and PDF viewer tests.

## T4 - Migrate extract domain

- [ ] **Failing test first:** convert one Extract/SchemaView/ProposeSchema test
      from module mocks to the injected fake and confirm it fails until the
      consumer uses the injected group.
- [ ] Migrate `Extract` widget, `SchemaView`, `ProposeSchemaFieldCard`,
      `useLiveExtract`, `useLiveExtractionSchema`, field-geometry, template-save,
      workflow-schema, and extract-field call sites to injected extract/template
      groups where they are consumed by React runtime surfaces.
- [ ] Move app-facing hooks out of `app/src/api/` or wrap them so components do
      not import a network hook from an API implementation path.
- [ ] Replace per-file mocks for `@/api/extractField`,
      `@/api/entities/groundxWorkflowsEntity`,
      `@/api/entities/groundxDocumentsEntity`,
      `@/api/useLiveExtract`, and `@/api/useLiveExtractionSchema` with harness
      fake overrides.
- **Adversarial review:** grep extract surfaces/tests for direct API imports and
  module mocks; run focused Extract, SchemaView, ProposeSchemaFieldCard,
  useLiveExtract, and useLiveExtractionSchema tests.

## T5 - Migrate smart-report domain

- [ ] **Failing test first:** retarget one `SmartReportBuilder` or
      `SmartReportRender` test to injected `api.report` overrides and confirm it
      fails until the component consumes `useApi()`.
- [ ] Migrate `SmartReportBuilder`, `SmartReportRender`, and onboarding shell
      report call sites to injected report/template groups.
- [ ] Replace per-file mocks for `@/api/smartReport` with harness fake
      overrides.
- [ ] Keep visible behavior assertions: render, rerender, save template, section
      edit/accept/reject, and navigation between render/builder frames.
- **Adversarial review:** grep smart-report surfaces/tests for direct
  `@/api/smartReport` imports and mocks; run focused smart-report tests plus
  affected onboarding shell tests.

## T6 - Migrate telemetry/Sentry test seams

- [ ] **Failing test first:** convert one component/context Sentry test from
      `vi.mock("@/lib/sentry")` to an injected telemetry fake and confirm it
      fails until the consumer uses the injected telemetry surface.
- [ ] Add a telemetry/error-capture group to the injected app-facing surface (or
      a sibling provider if implementation proves that is cleaner), wired to the
      existing Sentry wrapper in production.
- [ ] Migrate app-facing components, contexts, hooks, and widgets that assert
      `captureException` behavior away from direct `@/lib/sentry` imports.
- [ ] Leave low-level Sentry wrapper tests and API implementation tests allowed to
      mock the wrapper when they are testing the wrapper or API module behavior
      directly.
- **Adversarial review:** grep for remaining `vi.mock("@/lib/sentry")` and direct
  `captureException` imports outside allowlisted implementation tests; run
  focused telemetry/error-branch tests.

## T7 - Tighten the frontend API injection guard repo-wide

- [ ] **Failing test first:** temporarily introduce a direct app-facing
      `@/api` value import, a direct standalone API value import, a per-file
      `vi.mock("@/api...")`, and a per-file `vi.mock("@/lib/sentry")` in
      migrated consumer/test files; prove the guard fails each violation. Revert
      the temporary violations before proceeding.
- [ ] Expand `frontend-api-injection-guard.test.ts` so all migrated runtime
      consumers are covered, not only session/chat/auth.
- [ ] Keep allowlists explicit and narrow: composition root, `api/client.ts`, API
      implementation modules, API module unit tests that mock transport, and
      Sentry wrapper unit tests.
- [ ] Add guard output that groups offenders by domain so future regressions are
      obvious.
- **Adversarial review:** run the red/green proof; run
  `npm --workspace app exec vitest run src/test/frontend-api-injection-guard.test.ts`;
  inspect allowlists for accidental masking of resource, extract, report,
  scenario, canvas, widget, or telemetry files.

## T8 - Remove the legacy direct-import path and close #10

- [ ] **Failing test first:** add/extend cleanup guard coverage proving no
      runtime component/context/widget can value-import the legacy `@/api`
      aggregate.
- [ ] Remove or quarantine `app/src/api/index.ts` as an app-facing aggregate once
      no runtime consumers import it. If implementation modules still need shared
      composition, move that composition behind `api/client.ts`.
- [ ] Verify no per-file app-facing network mocks remain outside explicit
      low-level API implementation tests.
- [ ] Update `docs/agents/` and OpenSpec durable specs with the final rule:
      frontend runtime network/telemetry behavior flows through the injected
      surface; tests use one fake.
- [ ] Run `npm test`, `npm run build`, `npm run scan:secrets`, and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] Run focused browser smoke only for domains where runtime behavior changed
      beyond dependency routing; at minimum verify one resource operation, one
      extract/report path, and one telemetry/error path if their behavior changed.
- [ ] Comment on issue #10 with final evidence and close it.
- [ ] Archive this OpenSpec change only after all validation and #10 closure
      succeed.
- **Adversarial review:** confirm the injected surface is the only app-facing
  runtime path, the final guard fails regressions, #10 is closed, no active
  OpenSpec change remains for this epic, and no suite/build/spec/secret-scan
  regression remains.
