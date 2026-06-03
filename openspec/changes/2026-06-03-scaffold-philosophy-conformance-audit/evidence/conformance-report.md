# Scaffold Philosophy Conformance Report

Audit change: `2026-06-03-scaffold-philosophy-conformance-audit`
Audit mode: review-only
Repository: `GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7`

## Executive Summary

Task 9 handoff is complete. The scaffold mostly conforms to the project
philosophy: shared chat/canvas/shell composition, real-data middleware paths,
shared Template/Scope/Result contracts, and broad automated validation are in
place. The audit found no critical or high-severity gaps. Confirmed residual
work is either already in backlog issues (`#5`, `#11`) or newly filed as
backlog issues (`#13`-`#17`). Final validation and archive are Task 10.

## Axis Scores

| Axis | Verdict | Notes |
|---|---|---|
| Model composition | Strong with narrow caveats | `ConversationFlow` is the single chat flow; `ScopedCanvas` is the registry-backed sole canvas selector for declared viewer widgets; `AppShell` is shared by onboarding, steady, and scoped routes. |
| Production reuse | Mostly conforming; tracked gaps | Onboarding product frames mount production widgets through `ScopedCanvas`; F1/gate/book-call are legitimate context exceptions. Steady parity remains existing backlog `#5`; enabled generic `OnboardingWizard` copy is new handoff candidate `SCF-004`. |
| Real data | Mostly conforming; tracked deferred readers | Runtime data flows through the injected `realApi`, middleware DI, GroundX workflow/extract calls, repository persistence, and LLM/search routes. Runtime mock mode is guarded absent. `CF-04` page usage and `CF-19` multi-bucket scope remain deferred handoff items. |
| Round-trip done | Mostly conforming; two narrow exceptions | Chat sessions/messages, entity activation, viewer events, intent, templates, report render, and live extraction have write/read/render or service-consumer coverage. Page-usage counts have no reader yet; multi-bucket/group scope has no producer yet. |
| Template/scope/results | Mostly conforming; scope-key caveats | Shared `Template`, `ContentScope`, `WidgetScope`, `GeneratedResult`, Extract values, and rendered report sections live in `@groundx/shared`. SmartReport uses the shared save/render route, but its Utility demo routing still uses `filter.project` while the data-tier contract says seeded documents match `filter.projectId` (`SCF-006`, mapped to `#11`). The scoped `/projects` route also carries `filter.project` (`SCF-008`). |
| Widget/tool contracts | Mostly conforming; one tracked cleanup gap | Widget contract, tool quality, app/server catalog parity, scoped viewer registry, and SmartReport tool surfaces have focused passing tests. The app-side `toolRegistry` remains an acknowledged non-production orphan while `SERVER_TOOL_CATALOG` is the live LLM surface (`SCF-007`). |
| Source of truth | Mostly conforming; handoff complete | Active OpenSpec has only this audit; open GitHub issues are all backlog-labeled. Archived checked/unchecked historical items mostly map to closed issues or open backlog issues. Inline/doc backlog markers `CF-04`, `CF-19`, global `OnboardingWizard`, app-side `toolRegistry` cleanup, and scoped-project scope-key drift now have GitHub handoff in `#13`-`#17`. |
| Wireframe fidelity | Mostly conforming; tracked steady/scoped caveats | Chrome DevTools confirms F1 is a canvas-only public entry in the accessibility tree, F2+ uses the shared AppShell with chat/canvas, and mobile F1 has no horizontal overflow. Steady/workspace/project routes use the shared shell, but steady canvas parity remains `#5` and scoped project/filter vocabulary remains `SCF-008`. |
| Test evidence | Strong; residual skipped backlog and stale-contract tests | Root `npm test`, `npm run test:e2e`, `npm run scan:secrets`, and OpenSpec strict validation passed. E2E reported 48 passed and 60 skipped, with skipped Loan/Solar/backlog-oriented cases not counted as shipped conformance. Some passing project-scope tests currently codify `filter.project`, so passing tests alone do not close `SCF-008`. |

## Audit Rubric

The audit baseline comes from the scaffold agent references and the plan design:

| Axis | Conforming Model | Defect Bar |
|---|---|---|
| Model composition | Variations are values on explicit axes; mechanism stays shared while policy/data vary (`AGENTS.md:7`, `docs/agents/principles.md:12`). | A duplicated component, type, context, or dispatch path implements the same product mechanism with hardcoded scenario/mode behavior. |
| Production reuse | Onboarding decorates the production app shell and widgets; onboarding-specific surfaces are limited to signup/gate, nav, and F1 ingest/pick-a-view (`docs/agents/widget-contract.md:11`, `docs/agents/real-data-rewire-gap.md:27`). | A shipped onboarding frame renders a bespoke product surface instead of the production viewer/chat/widget surface it is meant to preview. |
| Real data | Visible data flows through GroundX, LLM, repository, or injected API clients; tests use fakes at the seam (`AGENTS.md:26`, `docs/agents/testing.md:95`). | User-visible behavior depends on manifest-only, fixture-only, localStorage-only, or canned mock data where the docs claim the live path is shipped. |
| Round-trip done | A claim is done only when it has a write site, read/hydrate site, rendered user-visible consumer, and relevant guard/test (`docs/agents/discipline.md:127`, `docs/agents/data-model.md:30`). | Data is persisted but not read, read but not rendered, rendered but not persisted, or protected only by seam-level plumbing that cannot catch visible regressions. |
| Template/scope/results | Extract and Report share Template + ContentScope + generated-result concepts; filters remain composable and not hardcoded (`docs/agents/template-scope-results.md:1`, `docs/agents/data-model.md:20`). | A feature forks template/scope/result shapes, bypasses the shared lifecycle, or scopes by a hardcoded document/project shape instead of `ContentScope` + filter. |
| Widget/tool contracts | Widgets obey slot placement, README/test expectations, role/mode locking as currently shipped, and mirrored app/server tool catalogs (`docs/agents/widget-contract.md:47`, `docs/agents/data-model.md:21`). | A product capability is mounted outside the widget contract, lacks required local docs/tests, has unmirrored tool definitions, or bypasses allowed tool verbs. |
| Source of truth | OpenSpec is active work; GitHub Issues are deferred backlog; shared types/docs/specs stay aligned (`docs/agents/discipline.md:152`, `docs/agents/data-model.md:33`). | Work remains only as an open OpenSpec task, archived unchecked task, inline TODO, untracked local folder, or stale doc claim with no GitHub handoff. |
| Wireframe fidelity | Runtime preserves the intended user-visible frame/widget shape while using production tokens and real data (`docs/agents/discipline.md:71`). | A shipped surface materially diverges from the intended workflow, hierarchy, or affordance and the divergence is not explained by production-token/data constraints. |
| Test evidence | Claims are backed by user-visible tests, contract tests, Playwright/Chrome measurements, or explicit residual-risk notes (`docs/agents/testing.md:5`, `docs/agents/discipline.md:310`). | The report treats an unmeasured visual impression, a seam-only test, or a passing unit test as proof of end-to-end user behavior. |

Future-target handling: a gap is only a confirmed defect when the current docs,
specs, or tests say the behavior is shipped or required now. Explicit future
targets such as `role`/`scope` migration, generated-result unification, unseeded
Loan/Solar live scenarios, and BYO upload scope stamping are recorded as backlog
alignment findings only when GitHub handoff is missing (`docs/agents/data-model.md:63`,
`docs/agents/data-model.md:107`, `docs/agents/data-model.md:133`,
`docs/agents/template-scope-results.md:20`, `docs/agents/testing.md:177`).

## Confirmed Strengths

- Source-of-truth hygiene: `openspec list` reports only
  `2026-06-03-scaffold-philosophy-conformance-audit` active; GitHub has no open
  non-backlog issues; open backlog issues are `#1`, `#2`, `#3`, `#5`, `#11`,
  and new audit handoff issues `#13`-`#17`.
- Composition strength: `ChatColumn` selects one `ConversationFlow` with an
  optional `ChatExperience`; steady chat is the same flow with no experience,
  not a separate flow component.
- Canvas strength: onboarding, steady, and scoped surfaces resolve declared
  viewer widgets through `ScopedCanvas` and the production
  `scopedViewerWidgetRegistryProduction` catalog. The remaining direct
  shell-level canvas imports are gate/book-call/value-prop context widgets, not
  document-scoped production viewer forks.
- API composition strength: `realApi` is the single frontend network
  composition root (`app/src/api/client.ts:131`), exposed through `ApiProvider`
  (`app/src/contexts/ApiContext/ApiContext.tsx:6`); tests inject `makeFakeApi`,
  which derives from the real surface (`app/src/test/makeFakeApi.ts:14`).
- Live extraction strength: Extract and SchemaView resolve schema/value data via
  GroundX document -> workflow -> document extract (`app/src/api/extractLiveData.ts:1`,
  `app/src/hooks/liveExtractData.ts:1`, `app/src/hooks/liveExtractionSchemaData.ts:1`).
  Focused SchemaView tests prove live values win over manifest sample values.
- Round-trip strength: chat session creation, message hydration, entity updates,
  viewer events, current intent, templates, report render, scenarios, and RBAC
  filters have explicit middleware/repository paths rather than local-only or
  fixture-only behavior.
- No mock-mode strength: `middleware/src/services/noMockMode.drift.test.ts`
  walks runtime middleware source and fails on retired mock/dev-client tokens.
- Shared contract strength: `@groundx/shared` owns `ContentScope`,
  `WidgetScope`, `Template`, `TemplateSaveInput`, `GeneratedResult`,
  `ExtractedFieldValue`, and `RenderedSection`; app and middleware route report
  sections through those shapes instead of hand-declaring free-standing twins.
- Widget/tool strength: widget contract tests, tool quality/reference scripts,
  app/server catalog parity, and server tool-catalog tests are active and
  passing. The parity guard now checks name, role, description, and declared
  chat-card reachability.
- Runtime wireframe strength: Chrome DevTools MCP evidence in an isolated
  context confirms `/onboarding` exposes the F1 step strip, sample cards, and
  BYO gates without accessible nav/chat; `/onboarding/28454/utility` exposes
  the shared nav/chat/canvas shell with live GroundX document/workflow/extract
  requests; `/c/:sessionId`, `/workspaces`, and `/projects` all mount the shared
  AppShell rather than route-specific bespoke layouts.
- Mobile F1 strength: the Chrome mobile-size pass reported no horizontal
  overflow and kept the public H1/sample/BYO cards reachable in the accessibility
  tree.
- Verification strength: the repository has broad app, middleware, contract, and
  Playwright coverage. The root test gate passed, Playwright E2E passed with a
  transparent skipped-test count, the secret scanner passed, and OpenSpec strict
  validation passed.

## Confirmed Gaps

- `SCF-001` / `CF-04` page-usage reader: `pages_remaining` currently returns a
  frank "usage count not wired" response and the docs park the reader. Filed
  backlog issue `#13`.
- `SCF-002` / `CF-19` multi-bucket group helper: docs mark the original helper
  as broken and backlogged, and source keeps a substrate note. Filed backlog
  issue `#14`.
- `SCF-003`: broader steady-mode wireframe/widget parity remains unresolved and
  is already tracked by GitHub `#5`.
- `SCF-004`: the globally mounted `OnboardingWizard` remains enabled with
  generic scaffold walkthrough copy. Filed backlog issue `#15`.
- `SCF-005`: Extract still has a manifest schema/value fallback when live
  document/workflow/extract data fails. This is transitional, not a confirmed
  defect in this audit, because the current code comments allow fallback and the
  stricter standalone SchemaView path has live-only tests.
- `SCF-006`: SmartReport demo/report scopes use `filter.project` while current
  data-tier/shared contracts and seeded sample docs use `filter.projectId`.
  Existing issue `#11` already owns restoring the Utility render path through
  the shared Template/Scope/Result architecture; the audit added a subfinding
  comment to `#11`.
- `SCF-007`: `app/src/tools/types.ts` still documents the app-side tool registry
  as an orphan with no production importer. Filed backlog issue `#16`.
- `SCF-008`: `/projects` and the Project `ChatExperience` still use
  `ContentScope.filter.project`, visibly announced as
  `filter {"project":"utility"}` in Chrome, while the current data-tier spec,
  scenario registry, RBAC/search tests, and seeded document contract use
  `filter.projectId`. Filed backlog issue `#17`.

## Next Decisions

Proceed to final validation. If OpenSpec strict validation and diff checks pass,
commit the review-only audit artifacts, archive the change, validate the
post-archive state, and commit the archive cleanup. If validation fails, leave
the change active and record the blocker in `issue-handoff.md`.

## Validation Evidence

- Task 4 focused composition validation:
  - Initial command with `app/src/...` paths failed because `npm --workspace app`
    filters from the app workspace root and found no files.
  - Corrected command passed: `npm --workspace app test -- --run
    src/conversation/ConversationFlow.test.tsx
    src/components/chat-widgets/ChatColumn/ChatColumn.test.tsx
    src/components/layout/ScopedCanvas/ScopedCanvas.test.tsx
    src/widgets/scopedViewerWidgetRegistryProduction.test.ts`
  - Result: 4 test files passed, 68 tests passed. Tool-reference and
    tool-quality guards also passed as part of the app test script.
- Task 5 focused real-data/round-trip validation:
  - Passed: `npm --workspace app test -- --run src/api/client.test.ts
    src/hooks/liveExtractData.test.ts src/hooks/liveExtractionSchemaData.test.ts
    src/contexts/ChatStoreContext/ChatStoreServerHydrator.test.tsx
    src/views/Onboarding/SchemaView.test.tsx`
  - Result: 5 app test files passed, 49 tests passed. Tool-reference and
    tool-quality guards also passed.
  - Passed: `npm --workspace middleware test -- --run
    src/services/noMockMode.drift.test.ts src/db/memoryRepository.test.ts
    src/db/mysqlRepository.test.ts src/services/structuredHandler.test.ts
    src/services/entityScopeProducer.test.ts src/services/reportRenderer.test.ts`
  - Result: 6 middleware test files passed, 96 tests passed.
- Task 6 focused contract validation:
  - Passed: `npm --workspace app test -- --run src/test/widget-contract.test.ts
    src/tools/catalog-parity.test.ts src/tools/registry.test.ts
    src/widgets/scopedViewerWidget.test.ts
    src/widgets/scopedViewerWidgetRegistryProduction.test.ts
    src/widgets/reportFixtures.test.ts
    src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx
    src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.test.tsx
    src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.tools.test.ts
    src/components/viewer-widgets/PdfViewer/PdfViewerWidget.tools.test.ts`
  - Result: 10 app test files passed, 256 tests passed. Tool-reference and
    tool-quality guards also passed.
  - Passed: `npm --workspace middleware test -- --run
    src/services/toolCatalog.test.ts src/services/reportRenderer.test.ts
    src/services/template.test.ts src/services/contentScopeVocabulary.test.ts
    src/services/groundxSearch.compose.test.ts src/services/zodToJsonSchema.test.ts`
  - Result: 6 middleware test files passed, 79 tests passed.
- Task 7 focused wireframe/runtime validation:
  - Dev server: `APP_REPOSITORY_MODE=memory MYSQL_HOST= npm run dev` started the
    middleware in memory mode on `3001` and Vite on `5173`.
  - Chrome DevTools MCP, isolated context `scaffold-audit-2026-06-03`,
    `/onboarding` desktop: accessibility tree exposed `Connect your data to
    GroundX.`, `TRY A SAMPLE`, Utility/BYO entries, and no accessible nav/chat;
    DOM metrics showed the underlying shell wrapper was `aria-hidden="true"` and
    `inert=true`.
  - Chrome DevTools MCP, `/onboarding/28454/utility`: shared AppShell/nav/chat/
    canvas were visible; network included local session/viewer-event writes plus
    GroundX document, X-Ray, workflow, extract, and page-image reads; no console
    errors were reported.
  - Chrome DevTools MCP, `/c/:sessionId`: shared nav/chat/canvas visible with no
    console errors; canvas correctly showed the empty document prompt until a
    citation/document viewer step exists, preserving `#5` as the broader steady
    parity handoff.
  - Chrome DevTools MCP, `/workspaces` and `/projects`: both mounted shared
    AppShell chat/canvas routes with no console errors; both canvases currently
    show the generic unavailable-state until a viewer step is selected.
  - Chrome DevTools MCP, `/projects`: chat text visibly included `Project ·
    bucket 28454 · filter {"project":"utility"} · 1 sample ready`, supporting
    `SCF-008`.
  - Chrome DevTools MCP, mobile-size `/onboarding`: no horizontal overflow;
    public H1/sample/BYO cards remained reachable.
  - Passed: `npm --workspace app test -- --run
    src/contexts/OnboardingContext/OnboardingProvider.test.tsx
    src/views/Onboarding/OnboardingWizard.test.tsx`
  - Result: 2 app test files passed, 8 tests passed. Tool-reference and
    tool-quality guards also passed.
  - Passed: `npm --workspace app test -- --run
    src/views/Scoped/ScopedConversationShell.test.tsx
    src/conversation/experiences/project/experience.test.tsx
    src/conversation/experiences/workspace/experience.test.tsx`
  - Result: 3 app test files passed, 19 tests passed. Tool-reference and
    tool-quality guards also passed. The scoped shell test run emitted React
    Router future-flag warnings from its `MemoryRouter` harness.
- Task 8 validation posture:
  - Test inventory scan found 174 app/middleware/shared test files plus
    Playwright E2E specs.
  - Passed: `npm test`
  - Result: shared build, Vite alias check, local env setup check, deploy/Helm
    static checks, full app tests, and full middleware tests exited 0. The final
    middleware suite summary reported 44 files passed and 730 tests passed.
  - Passed: `npm run test:e2e`
  - Result: Playwright E2E exited 0 with 48 passed and 60 skipped. The skipped
    tests were not counted as conformance evidence for backlogged Loan/Solar and
    other deferred surfaces.
  - Passed: `npm run scan:secrets`
  - Result: secret scan passed.
  - Passed: `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
  - Result: 18 OpenSpec items passed, 0 failed.
  - Residual risk: the passing scoped-project tests currently preserve
    `filter.project`; those tests are evidence of `SCF-008`, not evidence that
    the scope vocabulary is correct.
  - Residual risk: `ScopedConversationShell.test.tsx` emits React Router
    future-flag warnings from its test-only `MemoryRouter` harness; the
    production router future-flag guard remains in place.
