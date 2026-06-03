# Adversarial Reviews

Each task must append a passed review entry before the next task starts.

## Template

### Task N: Title

- Claims made:
- Counterevidence searched:
- Files, commands, or browser evidence checked:
- Verdict:
- Required correction before next task:

### Task 1: Create Audit Acceptance Artifacts

- Claims made: The audit has concrete report, finding-register, issue-handoff,
  adversarial-review, and tool-availability artifacts; tool availability is
  recorded with fallback paths.
- Counterevidence searched: Missing evidence files; placeholder red flags;
  unavailable tools silently represented as available.
- Files, commands, or browser evidence checked:
  - `test -f .../evidence/conformance-report.md`
  - `test -f .../evidence/finding-register.md`
  - `test -f .../evidence/issue-handoff.md`
  - `test -f .../evidence/adversarial-reviews.md`
  - `test -f .../evidence/tool-availability.md`
  - `rg -n "TBD|TODO|implement later|fill in details|Similar to Task" .../evidence`
  - `tool_search` for `codegraphcontext`
  - `tool_search` for Chrome DevTools inspection tools
  - `mcp__chrome_devtools.list_pages`
  - `mcp__codex_apps__groundx_studio._groundx_account_context`
  - `gh repo view` and `gh issue list`
- Verdict: passed.
- Required correction before next task: none.

### Task 2: Reconstruct The Philosophy Baseline

- Claims made: The report rubric reflects the scaffold's own philosophy:
  model-first composition, production widget reuse, real-data paths,
  write/read/render round trips, Template + Scope + Results, widget/tool
  contracts, one source of truth, measured runtime evidence, and user-visible
  testing.
- Counterevidence searched: Agent docs that explicitly mark items as future,
  target, deferred, or not yet shipped; cases where the rubric could turn a
  planned migration into a current product defect.
- Files, commands, or browser evidence checked:
  - `AGENTS.md`
  - `docs/agents/principles.md`
  - `docs/agents/discipline.md`
  - `docs/agents/hacking-vs-solving.md`
  - `docs/agents/real-data-rewire-gap.md`
  - `docs/agents/template-scope-results.md`
  - `docs/agents/data-model.md`
  - `docs/agents/widget-contract.md`
  - `docs/agents/testing.md`
  - `rg -n "future|target|not yet shipped|DEFERRED|planned|backlog" ...`
  - `rg -n "Audit Rubric|Future-target|role|scope|generated-result|Loan/Solar|BYO" .../conformance-report.md`
- Verdict: passed.
- Required correction before next task: none.

### Task 3: Audit Planning And Backlog Hygiene

- Claims made: Active OpenSpec contains only this audit; open GitHub issues are
  all backlog-labeled; known archived E2E/onboarding blockers map to closed
  issues or current open backlog issues.
- Counterevidence searched: Open archived changes with unchecked tasks, open
  non-backlog GitHub issues, closed issue state for `#4`-`#12`, and inline source
  markers that could be orphaned work.
- Files, commands, or browser evidence checked:
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list`
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list --specs`
  - `gh issue list --state open --limit 100 --json number,title,labels,url`
  - `gh issue list --state open --search '-label:backlog'`
  - `gh issue list --state all --limit 100 --json number,title,state,labels,url,closedAt`
  - `rg -n "\[ \]" openspec/changes/archive/2026-06-0{1,2,3}-*/tasks.md`
  - `rg -n "TODO|FIXME|XXX|spawn_task|GitHub Issue|Issue #[0-9]+|backlog" app middleware shared`
  - `middleware/src/services/structuredHandler.ts`
  - `middleware/src/services/groundxSearch.ts`
  - `docs/agents/cross-plan-execution-order.md`
  - GitHub searches for `CF-04`, `page_usage_event`, `CF-19`, and
    `multi-bucket`, all returning no issue matches.
- Verdict: passed after correction.
- Required correction before next task: keep `SCF-001` and `SCF-002` open as
  handoff candidates; confirm in Task 5/9 whether to file new GitHub backlog
  issues or mark no-action/stale.

### Task 4: Audit Composition Versus Forking

- Claims made: The main chat/canvas architecture is composed through one
  `ConversationFlow`, `ChatExperience`, `AppShell`, and `ScopedCanvas`/registry
  path; the retired onboarding frame views are not production mount points;
  F1/gate/book-call/value-prop are legitimate context-specific exceptions.
- Counterevidence searched: Direct production imports of retired onboarding
  `*View` surfaces; direct viewer-widget imports outside the registry; steady
  routes using onboarding as a proxy; context shells counted as defects; specs
  that intentionally keep `OnboardingWizard` and its tool surface.
- Files, commands, or browser evidence checked:
  - `app/src/router/router.tsx`
  - `app/src/components/chat-widgets/ChatColumn/ChatColumn.tsx`
  - `app/src/conversation/ConversationFlow.tsx`
  - `app/src/components/layout/AppShell/AppShell.tsx`
  - `app/src/components/layout/ScopedCanvas/ScopedCanvas.tsx`
  - `app/src/views/Onboarding/OnboardingShell.tsx`
  - `app/src/views/Steady/SteadyShell/SteadyShell.tsx`
  - `app/src/views/Scoped/ScopedConversationShell.tsx`
  - `app/src/widgets/scopedViewerWidgetRegistryProduction.ts`
  - `app/src/contexts/OnboardingContext/OnboardingProvider.tsx`
  - `app/src/views/Onboarding/OnboardingWizard.tsx`
  - `app/src/appConfig.ts`
  - `docs/agents/widget-contract.md`
  - `openspec/specs/agent-tools/spec.md`
  - `gh issue view 5`
  - `gh issue list --search 'OnboardingWizard OR wizard OR duplicate onboarding OR onboarding modal'`
  - `rg -n "ExtractView|UnderstandView|InteractView|ReportView|IntegrateView|SchemaView|components/viewer-widgets" app/src --glob '!**/*.test.*'`
  - `npm --workspace app test -- --run src/conversation/ConversationFlow.test.tsx src/components/chat-widgets/ChatColumn/ChatColumn.test.tsx src/components/layout/ScopedCanvas/ScopedCanvas.test.tsx src/widgets/scopedViewerWidgetRegistryProduction.test.ts`
- Verdict: passed after correction.
- Required correction before next task: carry `SCF-003` as existing-issue `#5`
  and `SCF-004` as a new-issue candidate; do not claim the global wizard is a
  registry violation, only that its enabled generic scaffold copy needs product
  alignment or retirement.

### Task 5: Audit Real Data And Round-Trip Done

- Claims made: Runtime network/data access is composed through `realApi` and
  middleware DI; mock mode is absent from runtime middleware; live extraction
  uses GroundX document/workflow/extract data; chat/session/entity/viewer
  event/intent/template/report paths have durable write/read/service-consumer
  coverage. `CF-04` page usage and `CF-19` multi-bucket/group scope remain
  intentional deferred items without GitHub handoff. Extract's manifest fallback
  is transitional/no-action for this audit, not a confirmed defect.
- Counterevidence searched: Direct API imports bypassing `ApiProvider`;
  localStorage-only persistence without server hydration; runtime mock/dev
  client switches; scenario manifest values rendered as live data; repository
  writes with no read/render consumer; source/doc markers claiming future work
  but missing issue handoff.
- Files, commands, or browser evidence checked:
  - `app/src/api/client.ts`
  - `app/src/contexts/ApiContext/ApiContext.tsx`
  - `app/src/test/makeFakeApi.ts`
  - `app/src/api/extractLiveData.ts`
  - `app/src/hooks/liveExtractData.ts`
  - `app/src/hooks/liveExtractionSchemaData.ts`
  - `app/src/contexts/ChatStoreContext/ChatStoreContext.tsx`
  - `app/src/contexts/ChatStoreContext/ChatStoreServerHydrator.tsx`
  - `app/src/conversation/useConversation.ts`
  - `app/src/contexts/ScenarioRegistryContext/ScenarioRegistryContext.tsx`
  - `app/src/components/viewer-widgets/Extract/Extract.tsx`
  - `middleware/src/app.ts`
  - `middleware/src/types.ts`
  - `middleware/src/scenarios/registry.ts`
  - `middleware/src/scenarios/sampleScenarios.ts`
  - `middleware/src/services/structuredHandler.ts`
  - `middleware/src/services/entityScopeProducer.ts`
  - `middleware/src/services/noMockMode.drift.test.ts`
  - `docs/agents/cross-plan-execution-order.md`
  - `rg -n "mock|fixture|manifest|sampleExtractionValues|sampleChatScript|localStorage|APP_REPOSITORY_MODE|MemoryAppRepository" app middleware shared`
  - `rg -n "manifest\\.sampleExtractionValues|sampleExtractionValues|manifest\\.sampleChatScript|sampleChatScript|manifest\\.extractionSchema|extractionSchema" app/src middleware/src shared/src`
  - `gh issue list --state all --search "\"page_usage_event\" OR \"pages remaining\" OR \"CF-04\" OR \"multi-bucket\" OR \"CF-19\""`
  - `npm --workspace app test -- --run src/api/client.test.ts src/hooks/liveExtractData.test.ts src/hooks/liveExtractionSchemaData.test.ts src/contexts/ChatStoreContext/ChatStoreServerHydrator.test.tsx src/views/Onboarding/SchemaView.test.tsx`
  - `npm --workspace middleware test -- --run src/services/noMockMode.drift.test.ts src/db/memoryRepository.test.ts src/db/mysqlRepository.test.ts src/services/structuredHandler.test.ts src/services/entityScopeProducer.test.ts src/services/reportRenderer.test.ts`
- Verdict: passed.
- Required correction before next task: file GitHub backlog issues for
  `SCF-001` and `SCF-002` in Task 9 unless an existing issue appears on the
  final search. Keep `SCF-005` no-action unless Task 7 runtime evidence proves
  the fallback creates a visible mismatch.

### Task 6: Audit Template, Scope, Result, Widget, And Tool Contracts

- Claims made: Shared `Template`, `ContentScope`, `WidgetScope`, generated
  result, extracted-value, and rendered-section types are the app/middleware
  contract spine; Extract and SmartReport mostly use that lifecycle; widget and
  tool contracts have passing parity/quality guards. SmartReport's current
  Utility report path has a scope-key caveat (`filter.project` versus
  `filter.projectId`) that belongs under existing issue `#11`. The app-side
  `toolRegistry` is an acknowledged non-production orphan that needs backlog
  cleanup or deliberate wiring.
- Counterevidence searched: SmartReport using an entirely separate template or
  result model; Extract regressions hidden by future SmartReport work; app and
  middleware catalogs diverging without parity tests; existing GitHub issues for
  `filter.project`, `toolRegistry`, or `SERVER_TOOL_CATALOG`; current docs/specs
  allowing `filter.project` as the canonical seeded-document key.
- Files, commands, or browser evidence checked:
  - `shared/src/index.ts`
  - `openspec/specs/data-tier/spec.md`
  - `app/src/components/viewer-widgets/Extract/Extract.tsx`
  - `app/src/components/viewer-widgets/SmartReportRender/SmartReportRender.tsx`
  - `app/src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.tsx`
  - `app/src/api/smartReport.ts`
  - `app/src/views/Onboarding/OnboardingShell.tsx`
  - `app/src/widgets/reportFixtures.ts`
  - `app/src/widgets/scopedViewerWidgetRegistryProduction.ts`
  - `app/src/widgets/scopedViewerWidget.ts`
  - `app/src/tools/types.ts`
  - `app/src/tools/registry.ts`
  - `app/src/tools/catalog-parity.test.ts`
  - `app/src/test/widget-contract.test.ts`
  - `middleware/src/app.ts`
  - `middleware/src/services/reportRenderer.ts`
  - `middleware/src/services/toolCatalog.ts`
  - `middleware/src/services/toolCatalog.test.ts`
  - `middleware/src/services/contentScopeVocabulary.test.ts`
  - `gh issue view 11`
  - `gh issue list --state all --search "\"filter.project\" OR \"projectId\" OR \"SmartReport scope\" OR \"toolRegistry\" OR \"SERVER_TOOL_CATALOG\""`
  - `npm --workspace app test -- --run src/test/widget-contract.test.ts src/tools/catalog-parity.test.ts src/tools/registry.test.ts src/widgets/scopedViewerWidget.test.ts src/widgets/scopedViewerWidgetRegistryProduction.test.ts src/widgets/reportFixtures.test.ts src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.test.tsx src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.tools.test.ts src/components/viewer-widgets/PdfViewer/PdfViewerWidget.tools.test.ts`
  - `npm --workspace middleware test -- --run src/services/toolCatalog.test.ts src/services/reportRenderer.test.ts src/services/template.test.ts src/services/contentScopeVocabulary.test.ts src/services/groundxSearch.compose.test.ts src/services/zodToJsonSchema.test.ts`
- Verdict: passed.
- Required correction before next task: add a Task 9 comment to existing issue
  `#11` for `SCF-006`; file `SCF-007` as a new backlog issue unless the final
  issue search finds an existing match.

### Task 7: Audit Wireframe And Runtime Evidence

- Claims made: F1 conforms to the public canvas-only wireframe in the
  accessibility tree while preserving the shared shell underneath; F2+,
  steady, workspace, and project routes use the shared AppShell/chat/canvas
  structure. Mobile F1 has no horizontal overflow. Broader steady/scoped
  widget parity remains tracked, not closed. `/projects` visibly exposes
  `filter {"project":"utility"}`, confirming a scoped-project vocabulary drift
  that needs new handoff (`SCF-008`).
- Counterevidence searched: Hidden nav/chat counted as visible F1 UI; visual
  screenshot impressions without DOM/a11y/network evidence; console/network
  errors on runtime routes; route-specific shell forks; existing GitHub issues
  that already own scoped `filter.project` drift; live GroundX/LLM variance
  mistaken for wireframe conformance defects; anonymous browser limitations
  mistaken for proof that the signed-in `OnboardingWizard` is unreachable.
- Files, commands, or browser evidence checked:
  - `openspec/wireframes/source/spec-flow.jsx`
  - `openspec/wireframes/source/spec-chapters.jsx`
  - `openspec/wireframes/source/spec-nav-v2.jsx`
  - `openspec/wireframes/source/spec-widgets.jsx`
  - `app/src/views/Onboarding/OnboardingShell.tsx`
  - `app/src/views/Scoped/ScopedConversationShell.tsx`
  - `app/src/views/Steady/SteadyShell/SteadyShell.tsx`
  - `app/src/contexts/OnboardingContext/OnboardingProvider.tsx`
  - `app/src/appConfig.ts`
  - `app/src/conversation/experiences/project/experience.tsx`
  - `app/src/conversation/experiences/project/experience.test.tsx`
  - `openspec/specs/data-tier/spec.md`
  - `docs/agents/data-model.md`
  - `gh issue list --state all --search '"filter.project" OR "project filter" OR "projectId" OR "ScopedConversationShell" OR "Projects"'`
  - Dev server: `APP_REPOSITORY_MODE=memory MYSQL_HOST= npm run dev`
  - Chrome DevTools MCP `/onboarding`: a11y snapshot, DOM metrics, console, and
    fetch/XHR network list.
  - Chrome DevTools MCP `/onboarding/28454/utility`: a11y snapshot, DOM metrics,
    console, and fetch/XHR/image network list.
  - Chrome DevTools MCP `/c/:sessionId`: a11y snapshot, DOM metrics, console,
    and fetch/XHR network list.
  - Chrome DevTools MCP `/workspaces` and `/projects`: a11y snapshot, DOM
    metrics, console, and fetch/XHR network list.
  - Chrome DevTools MCP mobile-size `/onboarding`: a11y snapshot, DOM metrics,
    console, and fetch/XHR network list.
  - `npm --workspace app test -- --run src/contexts/OnboardingContext/OnboardingProvider.test.tsx src/views/Onboarding/OnboardingWizard.test.tsx`
  - `npm --workspace app test -- --run src/views/Scoped/ScopedConversationShell.test.tsx src/conversation/experiences/project/experience.test.tsx src/conversation/experiences/workspace/experience.test.tsx`
- Verdict: passed after correction.
- Required correction before next task: file `SCF-008` as a new backlog issue in
  Task 9 unless the final issue search finds an exact existing owner. Keep
  `SCF-003` under issue `#5`; do not close it based on the empty steady canvas
  prompt because the route only shows a production widget after a document step.

### Task 8: Audit Test And Verification Posture

- Claims made: The repo has broad app, middleware, contract, and Playwright
  coverage; the practical validation gates passed; skipped E2E cases and
  passing stale-contract tests are recorded as residual risk rather than hidden
  as success.
- Counterevidence searched: E2E skipped tests being mistaken for shipped
  coverage; passing unit tests being treated as end-to-end proof; tests that
  encode the known `filter.project` drift; test-only router warnings being
  mislabeled as product defects; practical gates left unrun.
- Files, commands, or browser evidence checked:
  - `package.json`
  - `app/package.json`
  - `app/playwright.config.ts`
  - `app/e2e/*.spec.ts`
  - `app/src/views/Scoped/ScopedConversationShell.test.tsx`
  - `app/src/conversation/experiences/project/experience.test.tsx`
  - `middleware/src/services/groundxSearch.compose.test.ts`
  - test inventory scan over app/middleware/shared test files
  - `npm test`
  - `npm run test:e2e`
  - `npm run scan:secrets`
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict`
- Verdict: passed.
- Required correction before next task: preserve the distinction between
  passing gates and open backlog. In Task 9, do not use the green E2E suite to
  close `#5`, `#11`, or the new `SCF-008` handoff.

### Task 9: Produce Issue Handoff

- Claims made: Every confirmed gap now has an existing issue handoff, a new
  GitHub backlog issue, or an explicit no-action rationale. No confirmed
  finding remains only in the report.
- Counterevidence searched: Existing GitHub issues that would make the new
  issues duplicates; missing labels, missing issue URLs, permission failures,
  and confirmed findings left with `new-issue candidate` language.
- Files, commands, or browser evidence checked:
  - `gh issue list --state all --search '"page_usage_event" OR "pages remaining" OR "page budget" OR "CF-04"'`
  - `gh issue list --state all --search '"multi-bucket" OR "group resolver" OR "CF-19" OR "group helper"'`
  - `gh issue list --state all --search '"OnboardingWizard" OR "scaffold walkthrough" OR "starter Home page" OR "Replace the starter"'`
  - `gh issue list --state all --search '"toolRegistry" OR "app-side registry" OR "SERVER_TOOL_CATALOG" OR "tool catalog"'`
  - `gh issue list --state all --search '"filter.project" OR "projectId" OR "ScopedConversationShell" OR "Project scope"'`
  - `gh issue create` for issues `#13`, `#14`, `#15`, `#16`, and `#17`
  - `gh issue comment 11` for the `SCF-006` SmartReport scope-key subfinding
  - `gh issue view 11 --json number,title,state,labels,url,comments`
  - `gh issue view 13 --json number,title,state,labels,url,body`
  - `gh issue view 14 --json number,title,state,labels,url,body`
  - `gh issue view 15 --json number,title,state,labels,url,body`
  - `gh issue view 16 --json number,title,state,labels,url,body`
  - `gh issue view 17 --json number,title,state,labels,url,body`
  - `evidence/finding-register.md`
  - `evidence/issue-handoff.md`
- Verdict: passed.
- Required correction before next task: none. Task 10 may archive only after
  fresh OpenSpec validation, diff checks, and review-only git-status checks pass.
