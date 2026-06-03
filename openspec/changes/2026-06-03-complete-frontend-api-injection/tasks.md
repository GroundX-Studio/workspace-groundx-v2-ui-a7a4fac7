# Tasks - complete frontend API injection (#10)

Sequential. TDD failing-test-first where code changes are made. Every task has
an adversarial review gate before marking it done and before starting the next
task. Each implementation slice must end with focused tests, a passing
adversarial review, and a saved commit/push via GroundX Studio Harness MCP
(`sync_status` then `commit_push`) or an explicit note that MCP was unavailable.

## T0 - Inventory current state and lock slice boundaries (SEQUENTIAL)

- [ ] Run the current import/mock inventory across `app/src` and classify every
      hit as one of: migrate in this plan, type-only import, API/Sentry
      implementation file, implementation unit test, non-network mock, or
      already-migrated false positive.
- [ ] Save the classified inventory in this OpenSpec change, either in a
      dedicated `inventory.md` under this change or as an inventory section in
      this task list. Do not create a rival top-level tracker.
- [ ] Record the final per-domain migration list for resources,
      scenario/canvas/reset/sign-up/PDF, extract, smart-report, telemetry, and
      cleanup/guard. Do not start T1 while any hit is unclassified.
- [ ] Lock the telemetry architecture decision for this plan:
      rendered runtime error capture uses `Api.telemetry.captureException`;
      production composition forwards that method to the existing Sentry
      wrapper; production Sentry initialization remains outside the injected
      runtime capture seam.
- [ ] Lock mandatory browser smoke coverage for final closeout: one resource
      operation, one scenario/canvas or reset/sign-up path, one extract path, one
      smart-report path, and one telemetry/error branch with console/network
      checks.
- **Adversarial review:** rerun the inventory with an independent grep, compare
  the classified list against GitHub issue #10 and the archived session/chat and
  auth plans, and reject the task if any direct import/mock hit lacks a domain or
  allowlist reason.

## T1 - Migrate resource provider domains (SEQUENTIAL)

- [ ] **Failing test first:** convert one resource-provider test to
      `renderWithAppProviders(..., { api: { resources: ... } })` or
      `withApiProvider(..., { resources: ... })` and confirm it fails until the
      provider reads `useApi()`.
- [ ] Add only the resource grouped members needed by migrated resource
      providers to `realApi`, preserving current runtime function behavior and
      stable references.
- [ ] Add matching resource fake defaults and deep overrides so tests can
      override one resource method without replacing sibling methods.
- [ ] Migrate `BucketsProvider`, `DocumentsProvider`, `GroupsProvider`,
      `ProjectsProvider`, `WorkflowsProvider`, `ApiKeysProvider`,
      `HealthProvider`, and `SearchProvider` from value imports of `@/api` to
      injected resource groups.
- [ ] Convert resource-context wire-shape imports to `import type` where they are
      type-only.
- [ ] Replace the provider tests' per-file `vi.mock("@/api")` with one injected
      fake and visible/provider-state assertions.
- **Adversarial review:** grep resource contexts/tests for direct `@/api` value
  imports and `vi.mock("@/api")`; inspect hook dependency arrays and fake
  defaults for dormant or missing methods; run focused provider tests plus
  `npm --workspace app exec vitest run src/api/client.test.ts src/test/makeFakeApi.test.ts`.

## T2 - Migrate scenario, canvas intent, reset, sign-up, and PDF viewer consumers (SEQUENTIAL)

- [ ] **Failing test first:** retarget one scenario/canvas/widget test to the
      injected fake and prove it fails before its consumer switches to `useApi()`.
- [ ] Add only the scenario, canvas intent, reset/sign-up helper, and PDF/viewer
      grouped members needed by this slice to `realApi` and `makeFakeApi`.
- [ ] Migrate `ScenarioRegistryContext` to the injected scenario group.
- [ ] Migrate `CanvasOrchestratorContext` and related intent tests to injected
      canvas/intent and telemetry groups instead of direct `recordIntent` /
      `captureException` imports.
- [ ] Migrate `resetExperience` and `SignUpWidget` customer-auth/reset calls to
      injected auth/reset helpers while preserving exhaustive debug-reset
      behavior.
- [ ] Migrate `PdfViewerWidget` tests and any PDF-viewer app-facing network calls
      to the injected viewer/document group.
- **Adversarial review:** grep these domains for direct app-facing network
  imports and Sentry mocks; run focused scenario registry, canvas orchestrator,
  reset, sign-up, and PDF viewer tests; inspect reset coverage against
  `docs/agents/discipline.md` reset rules.

## T3 - Migrate extract domain (SEQUENTIAL)

- [ ] **Failing test first:** convert one Extract/SchemaView/ProposeSchema test
      from module mocks to the injected fake and confirm it fails until the
      consumer uses the injected group.
- [ ] Add only the extract/template/workflow/document grouped members needed by
      this slice to `realApi` and `makeFakeApi`.
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
  module mocks; inspect type-only conversions; run focused Extract, SchemaView,
  ProposeSchemaFieldCard, useLiveExtract, and useLiveExtractionSchema tests.

## T4 - Migrate smart-report domain (SEQUENTIAL)

- [ ] **Failing test first:** retarget one `SmartReportBuilder` or
      `SmartReportRender` test to injected `api.report` overrides and confirm it
      fails until the component consumes `useApi()`.
- [ ] Add only the smart-report/report-template grouped members needed by this
      slice to `realApi` and `makeFakeApi`.
- [ ] Migrate `SmartReportBuilder`, `SmartReportRender`, and onboarding shell
      report call sites to injected report/template groups.
- [ ] Replace per-file mocks for `@/api/smartReport` with harness fake
      overrides.
- [ ] Keep visible behavior assertions: render, rerender, save template, section
      edit/accept/reject, and navigation between render/builder frames.
- **Adversarial review:** grep smart-report surfaces/tests for direct
  `@/api/smartReport` imports and mocks; run focused smart-report tests plus
  affected onboarding shell tests; inspect that report follows the shared
  template/scope/results model rather than a forked surface.

## T5 - Migrate telemetry/Sentry runtime capture (SEQUENTIAL)

- [ ] **Failing test first:** convert one component/context Sentry test from
      `vi.mock("@/lib/sentry")` to an injected `api.telemetry` fake and confirm
      it fails until the consumer uses the injected telemetry surface.
- [ ] Add `Api.telemetry.captureException` to the injected app-facing surface,
      wired in production to the existing Sentry wrapper.
- [ ] Migrate app-facing components, contexts, hooks, and widgets that assert
      `captureException` behavior away from direct `@/lib/sentry` imports.
- [ ] Leave production Sentry initialization and low-level Sentry wrapper tests
      allowed to use the wrapper directly.
- [ ] Leave API implementation tests allowed to mock wrapper/transport behavior
      only when they are testing the wrapper or API module directly.
- **Adversarial review:** grep for remaining `vi.mock("@/lib/sentry")` and direct
  `captureException` imports outside allowlisted implementation tests; run
  focused telemetry/error-branch tests; inspect the final shape for exactly one
  rendered-runtime fake surface.

## T6 - Tighten the guard and retire the app-facing legacy aggregate (SEQUENTIAL)

- [ ] **Failing test first:** temporarily introduce a direct app-facing
      `@/api` value import, a direct standalone API value import, a per-file
      `vi.mock("@/api...")`, and a per-file `vi.mock("@/lib/sentry")` in
      migrated consumer/test files; prove the guard fails each violation. Revert
      the temporary violations before proceeding.
- [ ] Expand `frontend-api-injection-guard.test.ts` so all migrated runtime
      consumers are covered, not only session/chat/auth.
- [ ] Keep allowlists explicit and narrow: composition root, `api/client.ts`, API
      implementation modules, API module unit tests that mock transport, Sentry
      wrapper initialization/tests, and type-only imports.
- [ ] Remove or quarantine `app/src/api/index.ts` as an app-facing aggregate once
      no runtime consumers import it. If implementation modules still need shared
      composition, move that composition behind `api/client.ts`.
- [ ] Add guard output that groups offenders by domain so future regressions are
      obvious.
- [ ] Update `docs/agents/data-model.md` and related agent references in the same
      slice so they no longer describe session/chat/auth as the only guarded
      frontend Api domains.
- **Adversarial review:** run the red/green proof; run
  `npm --workspace app exec vitest run src/test/frontend-api-injection-guard.test.ts`;
  inspect allowlists for accidental masking of resource, extract, report,
  scenario, canvas, widget, or telemetry files; verify the legacy aggregate is
  not an app-facing import path.

## T7 - Final validation, browser smoke, issue close, and archive (SEQUENTIAL)

- [ ] Verify no per-file app-facing network/Sentry mocks remain outside explicit
      low-level implementation tests.
- [ ] Run `npm test`, `npm run build`, `npm run scan:secrets`, and
      `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`.
- [ ] Run mandatory Chrome DevTools MCP browser smoke for: one resource
      operation, one scenario/canvas or reset/sign-up path, one extract path, one
      smart-report path, and one telemetry/error branch. Measure console errors,
      failed network requests, and relevant DOM/user-visible state rather than
      relying on screenshots alone.
- [ ] Run GroundX Studio Harness `sync_status` before the final push and
      `commit_push` for the final saved change. If the MCP server is not
      attached, diagnose attachment first and document the fallback used.
- [ ] Comment on GitHub issue #10 with commit hashes, focused test commands,
      full-suite/build/secret/OpenSpec validation, browser-smoke evidence, and
      guard red/green proof.
- [ ] Include a human-readable completed-task summary in the #10 closeout
      comment: what each slice changed, what user-visible/runtime behavior was
      verified, and which mocks/direct imports were removed.
- [ ] Include the final open-work inventory in the #10 closeout comment and the
      final response: active OpenSpec plans/tasks and open GitHub issues without
      `backlog`. Ignore backlogged issues unless they block #10 closure.
- [ ] Close GitHub issue #10 only after the evidence above passes.
- [ ] Archive this OpenSpec change only after validation, #10 closure, and final
      harness sync/commit handling succeed.
- **Adversarial review:** confirm the injected surface is the only app-facing
  runtime path, the final guard fails regressions, #10 is closed, no active
  OpenSpec change remains for this epic, no browser-smoke defect remains, and no
  suite/build/spec/secret-scan regression remains.
