# Adversarial Reviews

Each task must pass this gate before the next task starts.

## Template

- Task:
- Claims made:
- Counterevidence searched:
- Checks performed:
- Verdict:
- Required correction:

## Task 1: Create Audit Acceptance Artifacts

- Claims made:
  - The audit report did not exist before Task 1.
  - Evidence artifacts now exist for the report, finding register, issue handoff,
    adversarial reviews, and tool availability.
  - The new files are review artifacts only, not product fixes.
- Counterevidence searched:
  - File existence before and after creation.
  - Product tree modification status.
  - Placeholder/unresolved section scan.
- Checks performed:
  - `test -f openspec/changes/2026-06-04-architecture-design-adversarial-review/evidence/conformance-report.md` failed before creation.
  - Created files under `openspec/changes/2026-06-04-architecture-design-adversarial-review/evidence/`.
  - Follow-up checks are recorded in Task 1 output.
- Verdict: passed.
- Required correction: none yet.

## Task 2: Reconstruct The Baseline

- Claims made:
  - The audit rubric is sourced from current scaffold agent docs and durable
    OpenSpec specs.
  - The rubric covers composition, production reuse, state ownership, data
    contracts, round-trip done, TDD posture, widget/tool contracts, design
    fidelity, runtime evidence, security/ops, and planning hygiene.
  - Known migration/deferred targets are not automatically current defects.
- Counterevidence searched:
  - `AGENTS.md` table of contents and principles pointers.
  - `docs/agents/principles.md`, `discipline.md`, `architecture.md`,
    `data-model.md`, `template-scope-results.md`, `widget-contract.md`,
    `testing.md`, `design-bundle.md`, and `real-data-rewire-gap.md`.
  - Durable specs for `app-architecture`, `testing-suite`, `data-tier`,
    `security-and-privacy`, and `ui-views`.
- Checks performed:
  - Verified line references for Tier-1 principles, Rule 9, Rule 10,
    widget/tool contracts, design evidence rules, and deferred targets.
  - Recorded baseline not-a-defect judgments for role/scope migration,
    partial view collapse, Auth/context audits, visual/load testing blockers,
    and production MySQL infra blocker.
- Verdict: passed.
- Required correction: none.

## Task 3: Map The Shipped Architecture

- Claims made:
  - The shipped composition root is `AppProviders` plus route layouts, not a
    hidden per-view provider stack.
  - The frontend API boundary is `realApi` injected through `ApiProvider`.
  - The middleware owns executable HTTP behavior through `createApp` and the
    `AppRepository` contract.
  - Shared schemas in `@groundx/shared` own cross-boundary concepts.
  - Chat/session/canvas state centers on `ChatStore`, `OnboardingSession` as a
    facade, and `CanvasOrchestrator.dispatch`.
  - The scoped viewer widget path is catalog-backed and live in production.
- Counterevidence searched:
  - `app/src/App.tsx`, `app/src/router/router.tsx`, and the full
    `app/src/contexts` file inventory.
  - Source discovery for providers, shared contracts, `ContentScope`,
    `Template`, `ViewerSession`, `ChatSession`, `CanvasIntent`,
    `SERVER_TOOL_CATALOG`, `defineScopedViewerWidget`, and `Catalog<`.
  - Import-direction search across onboarding, steady, scoped, shell,
    conversation, widget, and canvas modules.
  - Durable `app-architecture` spec text around the intent dispatch model.
- Checks performed:
  - `find app/src/contexts -maxdepth 2 -type f \( -name '*.tsx' -o -name '*.ts' \) | sort`.
  - `rg -n "Provider|createContext|useApi|ContentScope|Template|ViewerSession|ChatSession|CanvasIntent|SERVER_TOOL_CATALOG|defineScopedViewerWidget|Catalog<" app/src middleware/src shared/src`.
  - `rg -n "registerAdapter\(|adaptersRef|CanvasAdapter|adapter registry|registry-only" app/src openspec docs`.
  - `rg -n "from \"@/(views|components|contexts|conversation|widgets|api|shared|types|lib)/" ...`.
- Verdict: passed.
- Required correction: record `ADR-001` because the current durable
  `app-architecture` spec contains contradictory requirements for the live
  `registerAdapter` path.

## Task 4: Audit Composition And Production Reuse

- Claims made:
  - The application mostly conforms to composable architecture and production
    reuse at the shell/chat/canvas level.
  - Onboarding, steady, and scoped authenticated routes share `AppShell`.
  - Chat behavior is one `ConversationFlow` plus optional `ChatExperience`, not
    separate onboarding/steady flow components.
  - Viewer widgets are mounted through `ScopedCanvas` and the production scoped
    viewer widget registry.
  - F1, gate/value-prop, booking, and empty steady canvas states are legitimate
    contextual shells, not hidden forks.
- Counterevidence searched:
  - Onboarding, steady, and scoped route render paths.
  - `ChatColumn`, `ConversationFlow`, `ChatExperience`, `ScopedCanvas`,
    `AppShell`, and production viewer widget registry.
  - Fork indicators including `mode`, `surface`, `steady`, `onboarding`,
    `ConversationFlow`, `ScopedCanvas`, `placeholder`, and direct
    `viewer-widgets/` imports.
  - Prior OpenSpec specs/tests for Workspaces/Projects and authenticated
    onboarding route reachability.
- Checks performed:
  - `rg -n "onboarding|steady|mode|role|scope|documentId|bucketId|projectId|ChatExperience|ConversationFlow|ScopedCanvas|clone|duplicate" app/src`.
  - `rg -n "mode=|mode:|surface|SteadyConversation|F2Conversation|onboarding.*steady|steady.*onboarding|legacy|placeholder|stub|TODO|FIXME|direct import|viewer-widgets/" app/src/views app/src/components app/src/conversation app/src/widgets`.
  - Read `OnboardingShell`, `SteadyShell`, `ScopedConversationShell`,
    `ChatColumn`, `ConversationFlow`, `ChatExperience`, `AppShell`, and scoped
    route tests.
- Verdict: passed.
- Required correction: carry the `filter.project` versus `filter.projectId`
  issue into Task 5 as a data-contract finding candidate, not a composition
  finding.

## Task 5: Audit Data Contracts And Round-Trips

- Claims made:
  - The core persisted concepts mostly have write/read/consumer/test evidence:
    chat sessions, chat messages, summaries, entities, viewer events, intents,
    templates, projects, grants, and RBAC filters.
  - `/projects` route scope now correctly uses `filter.projectId` and has a
    focused guard.
  - Smart Report/onboarding report scope is a confirmed high-severity contract
    drift because it still uses and tests `filter.project`, while durable specs
    and shared docs require product project scope to use `filter.projectId`.
- Counterevidence searched:
  - Shared `ContentScope` and `compileScopeFilter` schema permissiveness, to
    avoid falsely claiming `filter.project` is type-invalid.
  - `/projects` scoped route implementation and tests, to avoid blaming the
    recently-fixed authenticated scoped flow.
  - Smart Report app fixtures, widget tests, API client tests, middleware
    renderer, app route tests, and GroundX search filter compilation.
  - Route-contract tests for RT-01 through RT-03 and service tests for
    compression, entity scope, project RBAC, and report rendering.
- Checks performed:
  - `rg -n "filter\\s*:\\s*\\{\\s*project\\s*:|filter\\?\\.project\\b" app/src middleware/src shared/src docs/agents openspec/specs`.
  - `rg -n "upsertChatSession|appendChatMessage|appendConversationSummary|upsertChatSessionEntity|appendViewerEvent|appendIntentLog|saveTemplate|insertProject|insertProjectGrant|listChatSessionsForUser|listChatMessages|listViewerEvents|listIntentLog|getTemplate|listTemplates|listGrantsForPrincipal|rekeyAnonymousChatSessions" middleware/src app/src shared/src`.
  - Read `app/src/views/Onboarding/OnboardingShell.tsx`,
    `app/src/widgets/reportFixtures.ts`,
    `app/src/components/viewer-widgets/SmartReportRender/SmartReportRender.tsx`,
    `app/src/api/smartReport.ts`, `middleware/src/app.ts`,
    `middleware/src/services/reportRenderer.ts`,
    `middleware/src/services/groundxSearch.ts`,
    `middleware/src/services/chatHandler.ts`, and
    `middleware/src/apiRouteContract.test.ts`.
- Verdict: passed.
- Required correction: record `ADR-002` and ensure Task 11 maps it to an
  existing or new GitHub issue. Do not patch Smart Report product code in this
  review-only plan.

## Task 6: Audit TDD And Test Evidence

- Claims made:
  - Recent architecture/design work mostly follows the scaffold's TDD posture:
    failing tests are recorded in archived OpenSpec plans, followed by green
    focused tests, adversarial reviews, and in some cases Chrome DevTools
    evidence.
  - Current widget contract, catalog parity, frontend API injection, scoped
    project vocabulary, middleware tool catalog, content-scope vocabulary,
    GroundX filter composition, and project RBAC guard tests pass.
  - Passing Smart Report tests are not enough to clear `ADR-002` because they
    currently assert the stale `filter.project` model.
- Counterevidence searched:
  - Recent commit history and archived OpenSpec tasks for tool registry/project
    scope, signed-in onboarding, authenticated onboarding reachability, and E2E
    gap closure.
  - Guard tests that could be vacuous, file-name-only, or seam-only.
  - Smart Report tests that might already prove canonical `projectId` scope.
- Checks performed:
  - `git log --oneline --decorate -20`.
  - Read archived task files under `openspec/changes/archive/2026-06-04-*` and
    `openspec/changes/archive/2026-06-03-2026-06-03-required-e2e-gap-closure/tasks.md`.
  - `npm --prefix app run test -- src/test/widget-contract.test.ts src/tools/catalog-parity.test.ts src/test/frontend-api-injection-guard.test.ts src/views/Scoped/projectScopeVocabulary.test.ts` passed 177 tests.
  - `npm --prefix middleware run test -- src/services/contentScopeVocabulary.test.ts src/services/toolCatalog.test.ts src/services/groundxSearch.compose.test.ts src/services/projectAccess.test.ts` passed 39 tests.
  - `npm --prefix app run test -- src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.test.tsx src/widgets/reportFixtures.test.ts src/api/smartReport.test.ts` passed 44 tests.
  - `npm --prefix middleware run test -- src/services/reportRenderer.test.ts` passed 26 tests.
- Verdict: passed.
- Required correction: keep the TDD verdict "mostly conforms" rather than
  "fully conforms"; Task 11 must include `ADR-002` acceptance criteria that
  migrates tests and guards before implementation.

## Task 7: Audit Widget And Tool Contracts

- Claims made:
  - Widget directories mostly conform to the scaffold widget contract: README,
    sibling test, required `role` and `scope`, no raw id props, no retired
    binary mode literal, and exactly one tools file or `no-llm.md`.
  - App `*.tools.ts` files are declarative metadata only; production execution
    lives in `middleware/src/services/toolCatalog.ts`.
  - The old app-side runtime `toolRegistry` is not present in production source.
  - App/server tool name, description, role, and `rendersWidget` bindings are
    guarded and currently pass.
- Counterevidence searched:
  - Widget directories with missing README/test/tool files.
  - App metadata files containing `handler:`.
  - Production app `tools/registry.ts` or `toolRegistry` import resurrection.
  - Middleware catalog role/step widening and server-only rendered-widget
    binding gaps.
- Checks performed:
  - `find app/src/components/chat-widgets app/src/components/viewer-widgets -mindepth 1 -maxdepth 2 -type f | sort`.
  - `rg -n "execute|handler|runTool|SERVER_TOOL_CATALOG|rendersWidget|availableIn|defineAppTool|toolRegistry|recordTool|dispatch|no-llm|role: WidgetRole|scope: WidgetScope" ...`.
  - `rg -n "registerTool|toolRegistry|AppToolRegistry|appToolRegistry|runtime tool|handler" app/src middleware/src shared/src openspec/specs docs/agents`.
  - `npm --prefix app run test -- src/tools/appToolMetadata.test.ts src/tools/catalog-parity.test.ts` passed 12 tests.
  - Earlier Task 6 focused guards also passed `widget-contract.test.ts`,
    `catalog-parity.test.ts`, and `middleware/src/services/toolCatalog.test.ts`.
- Verdict: passed.
- Required correction: no new product finding. Keep `ADR-001` as a spec-text
  cleanup issue, not as evidence that runtime tool catalog ownership is broken.

## Task 8: Audit Design Fidelity And Runtime Behavior

- Claims made:
  - The shipped app mostly follows the wireframe intent rather than copying
    every pixel: F1 is source-picker first, later steps use the shared
    nav/chat/canvas shell, and compact mode collapses to one visible pane with
    named controls.
  - The current signed-in onboarding implementation is allowed to use best
    judgment because the wireframes did not mock the post-signup authenticated
    experience in detail.
  - Design-system posture is guarded by token/hardcoded-style tests; remaining
    raw colors are already allowlisted debug or boundary states.
  - Runtime claims for the scoped route were checked with Chrome DevTools MCP
    using DOM geometry, network, console, and accessibility evidence.
- Counterevidence searched:
  - Wireframes for flow, shell layout, nav, widgets, responsive behavior, and
    workspace setup.
  - Source for `AppShell`, `ScopedCanvas`, `StepStrip`, `CiteChip`, onboarding
    shell, scoped shell, and hardcoded-style guards.
  - Runtime desktop and compact `/projects` behavior through Chrome DevTools
    MCP instead of relying on a static screenshot.
- Checks performed:
  - Read `openspec/wireframes/source/spec-flow.jsx`,
    `spec-layout.jsx`, `spec-nav-v2.jsx`, `spec-widgets.jsx`,
    `spec-responsive.jsx`, and `spec-workspace.jsx`.
  - Chrome DevTools MCP on `http://127.0.0.1:4174/projects`: desktop measured
    180px nav, 420px chat, 747px canvas, no compact topbar; compact viewport
    exposed `Open navigation` and `View canvas`/`View chat`, hid the drag
    separator, and had no horizontal overflow.
  - Chrome DevTools MCP network/console/a11y: no console messages; app-owned
    requests returned 200; accessibility tree exposed named navigation and
    pane-toggle controls plus the canvas empty-state heading.
  - `npm --prefix app run test -- src/test/no-hardcoded-styles.test.ts src/components/layout/AppShell/AppShell.test.tsx src/components/layout/StepStrip/StepStrip.test.tsx src/components/brand/CiteChip/CiteChip.test.tsx` passed 125 tests.
- Verdict: passed.
- Required correction: none. Keep design fidelity "mostly conforms" because the
  hover-citation affordance and post-signup workspace setup are intentionally
  simplified or unmocked, not current architecture defects.

## Task 9: Audit Security, RBAC, Observability, And Ops Seams

- Claims made:
  - Middleware security, session, CSRF, RBAC, metrics, logging, and telemetry
    seams are mostly centralized and test-backed.
  - `npm run scan:secrets` and the full middleware suite passed fresh during
    this task.
  - Air-gap URL/font/CSP seams and Sentry source-map upload are documented
    future follow-ups, not new untracked product defects discovered here.
  - Frontend analytics consent gating is a confirmed high-severity privacy
    contract gap because configured PostHog/GA load at bootstrap before any
    consent UI/source of truth exists.
- Counterevidence searched:
  - Durable `security-and-privacy` and `observability` specs, agent docs for
    observability/gotchas/deploy/MCP/air-gap, app analytics bootstrap, app GA
    loader, middleware Helmet/CSP, CSRF/session middleware, project RBAC, PII
    scrubbers, telemetry initialization, and related tests.
  - Source search for `consent`, analytics cookies, PostHog/GA/Hotjar, CSP,
    session, CSRF, RBAC, secrets, and telemetry terms.
- Checks performed:
  - `npm run scan:secrets` passed.
  - `npm --prefix middleware run test` passed: 44 files, 731 tests.
  - Read `middleware/src/config/env.ts`, `middleware/src/app.ts`,
    `middleware/src/middleware/session.ts`, `middleware/src/middleware/csrf.ts`,
    `middleware/src/services/projectAccess.ts`, `middleware/src/lib/pii.ts`,
    `middleware/src/lib/telemetry.ts`, `middleware/src/lib/logger.ts`,
    `app/src/main.tsx`, `app/src/lib/analytics.ts`, and `app/src/lib/ga.ts`.
- Verdict: passed.
- Required correction: carry `ADR-003` into Task 11 issue handoff. Do not file
  the air-gap/font/source-map seams as new findings unless Task 10 shows they
  lack existing tracking, because the docs already label them as future
  follow-ups or seam-only.

## Task 10: Audit Planning Hygiene

- Claims made:
  - At Task 10 scan time, the only active OpenSpec change was this review plan.
  - The open GitHub issue set contained only backlog-labelled issues:
    `#1`, `#2`, `#3`, `#5`, `#11`, `#13`, and `#14`; no open non-backlog issue
    existed before Task 11 handoff.
  - Live-source deferred markers are mostly covered by existing issues or
    resolved historical plans.
  - Four confirmed findings require Task 11 issue handoff: `ADR-001`,
    `ADR-002`, `ADR-003`, and `ADR-004`.
- Counterevidence searched:
  - OpenSpec list and spec list.
  - Live open GitHub Issues with labels and bodies.
  - Targeted all-state issue searches for `registerAdapter`, Smart Report
    `filter.project`/`projectId`, analytics consent, UI-02/plugin downloads,
    view/primitive deferred tools, and Integrate.
  - Broad source/archive search for `TODO`, `FIXME`, `backlog`, `deferred`,
    `follow-up`, `seam-only`, `not-started`, and `unchecked`.
- Checks performed:
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list`.
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list --specs`.
  - `gh issue list --repo GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7 --state open --limit 200 --json number,title,labels,url,body,createdAt,updatedAt`.
  - `rg -n "TODO|FIXME|backlog|deferred|follow-up|seam-only|not-started|unchecked" app middleware shared openspec docs`.
  - Narrow live-source scan under `app/src`, `app/scripts`, `middleware/src`,
    and `shared/src`.
- Verdict: passed.
- Required correction: Task 11 must create or match issues for `ADR-001` through
  `ADR-004`. Do not reopen `#4` for all F7 Integrate work; the remaining item
  is specifically the UI-02 plugin-download pipeline.

## Task 11: Synthesize Findings And Issue Handoff

- Claims made:
  - All confirmed findings have explicit GitHub issue handoff.
  - New issue bodies are actionable, scoped, and tied to source/spec evidence.
  - Existing adjacent issues were checked so new issues do not duplicate closed
    or unrelated backlog work.
- Counterevidence searched:
  - Live issue readback for created issues `#18` through `#21`.
  - Open issue list after creation to verify labels and state.
  - Existing closed adjacent issues `#4`, `#16`, and `#17`.
  - `finding-register.md`, `issue-handoff.md`, and `conformance-report.md` for
    any lingering `pending Task 11` handoff text.
- Checks performed:
  - Created [#18](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/18),
    [#19](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/19),
    [#20](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/20),
    and [#21](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/21).
  - `gh issue list --repo GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7 --state open --limit 200 --json number,title,labels,url,createdAt,updatedAt`.
  - `gh issue view 18`, `19`, `20`, and `21` with labels/state/url.
- Verdict: passed.
- Required correction: none. Task 12 must re-validate that all four findings
  still have issue URLs and that all open GitHub issues are backlog-labelled.

## Task 12: Final Review, Validation, Commit, Archive, Summary

- Claims made:
  - The review stayed review-only; no product source files were modified.
  - Every confirmed finding has GitHub issue handoff, and every no-action item
    has a rationale.
  - OpenSpec is clean after archiving this review-only change.
  - All open GitHub issues are backlog-labelled.
- Counterevidence searched:
  - Active and archived OpenSpec state after archive.
  - Git status and changed-path inventory.
  - Fresh OpenSpec validation, diff check, and open GitHub issue list.
  - Evidence artifacts for stale placeholder, pending handoff, or untracked
    confirmed-finding language.
- Checks performed:
  - `rg -n "Status: in progress|will record|needs issue handoff|Four items need Task 11|no matching open issue exists" openspec/changes/2026-06-04-architecture-design-adversarial-review` found no stale handoff text before archive.
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate 2026-06-04-architecture-design-adversarial-review --strict` passed before archive.
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict` passed before archive with 18 items.
  - `git diff --check` passed before the review commit.
  - `git commit -m "docs: complete architecture design review"` created commit `833b649`.
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 archive 2026-06-04-architecture-design-adversarial-review --yes --skip-specs` archived the change as `2026-06-04-2026-06-04-architecture-design-adversarial-review`.
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict` passed after archive with 17 specs.
  - `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list` reported no active changes.
  - `gh issue list --repo GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7 --state open --limit 200 --json number,title,labels,url` showed `#1`, `#2`, `#3`, `#5`, `#11`, `#13`, `#14`, `#18`, `#19`, `#20`, and `#21`, all with the `backlog` label.
- Verdict: passed.
- Required correction: none. Commit the archive cleanup separately, then report
  the remaining open backlog items and verification evidence.
