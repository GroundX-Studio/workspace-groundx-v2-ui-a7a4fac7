# Architecture And Design Conformance Report

## Executive Verdict

Status: completed review-only audit.

The scaffold mostly conforms to the philosophy in `AGENTS.md` and
`docs/agents/*`: composable architecture, TDD, adversarial review gates,
user-visible done, one source of truth, real round-trips, and design intent
from the wireframes. Four confirmed gaps remain and are handed off to backlog
issues. No product code was changed by this review.

## Axis Scorecard

| Axis | Verdict | Evidence | Notes |
|---|---|---|---|
| Composition | mostly conforms | `app/src/components/layout/AppShell/AppShell.tsx:141-165`, `app/src/views/Onboarding/OnboardingShell.tsx:799-838`, `app/src/views/Steady/SteadyShell/SteadyShell.tsx:191-210`, `app/src/views/Scoped/ScopedConversationShell.tsx:184-206` | Route shells share `AppShell`; variation is expressed through slots, scope, role, and experience selection. |
| Production reuse | mostly conforms | `app/src/conversation/ConversationFlow.tsx:1-118`, `app/src/components/chat-widgets/ChatColumn/ChatColumn.tsx:1-165`, `app/src/components/layout/ScopedCanvas/ScopedCanvas.tsx:1-181`, `app/src/widgets/scopedViewerWidgetRegistryProduction.ts:1-142` | The chat and viewer paths are shared and load-bearing; F1/gate/book-call/empty steady canvas are legitimate contextual shells. |
| State ownership | mostly conforms | `app/src/contexts/ChatStoreContext/ChatStoreContext.tsx:720-810`, `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx:67-103`, `middleware/src/services/chatHandler.ts:220-275` | `ChatStore` owns active session/entity/viewer state and fire-and-forget durable writes; middleware reads those rows back for hydration and LLM context. |
| Data contracts | mixed; one high-severity drift confirmed | `openspec/specs/data-tier/spec.md:176-190`, `shared/src/index.ts:122-129`, `app/src/views/Onboarding/OnboardingShell.tsx:467-482`, `middleware/src/services/reportRenderer.ts:83-153` | Core schemas are shared, but the Smart Report/onboarding report island still uses `filter.project` while the durable product scope vocabulary is `filter.projectId`. |
| Round-trip done | mostly conforms; Smart Report scope gap confirmed | `middleware/src/apiRouteContract.test.ts:563-704`, `middleware/src/apiRouteContract.test.ts:720-872`, `middleware/src/apiRouteContract.test.ts:886-1048`, `app/src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx:147-153` | Chat/message/entity/viewer/intent/template routes have write/read/consumer/test evidence. Smart Report render has endpoint evidence, but its scope vocabulary can miss project documents. |
| TDD posture | mostly conforms; one guard gap tied to `ADR-002` | `openspec/changes/archive/2026-06-04-2026-06-03-fix-tool-registry-and-project-scope/tasks.md`, `openspec/changes/archive/2026-06-04-authenticated-onboarding-reachability/tasks.md`, `app/src/test/widget-contract.test.ts:186-235`, `app/src/tools/catalog-parity.test.ts:49-116` | Recent plans show red/green/adversarial review discipline and the focused guard suites pass. The Smart Report tests are green but assert the stale `filter.project` island, so the next fix needs test-first migration. |
| Widget/tool contracts | mostly conforms | `app/src/test/widget-contract.test.ts:330-452`, `app/src/tools/appToolMetadata.test.ts:23-35`, `app/src/tools/catalog-parity.test.ts:49-116`, `middleware/src/services/toolCatalog.ts:52-83`, `middleware/src/services/toolCatalog.ts:673-768` | Widgets have README/test/tool-or-opt-out guards; app metadata is declarative; middleware owns executable intent builders and role/step filtering. `ADR-001` remains a spec-text contradiction around adapter retention. |
| Design fidelity | mostly conforms | `openspec/wireframes/source/spec-flow.jsx`, `openspec/wireframes/source/spec-layout.jsx`, `openspec/wireframes/source/spec-nav-v2.jsx`, `app/src/components/layout/AppShell/AppShell.tsx:1-160`, `app/src/components/layout/StepStrip/StepStrip.tsx:1-180`, `app/src/components/brand/CiteChip/CiteChip.tsx:1-120` | The app implements the shared shell, F1 no-chat path, split/focus/compact shell, StepStrip, inline gate widgets, citation chips, and scoped canvas registry intent. The post-signup workspace setup wireframe is exploratory context, not a shipped requirement. |
| Runtime/a11y | mostly conforms | Chrome DevTools MCP runtime check on `http://127.0.0.1:4174/projects`, `app/src/components/layout/AppShell/AppShell.test.tsx:1-160`, `app/src/components/layout/StepStrip/StepStrip.test.tsx:1-260` | Desktop and compact runtime geometry matched the intended shell behavior; console was quiet; app-owned network calls were 200; a11y snapshot exposed named nav/canvas controls. |
| Security/ops | mixed; one privacy-contract gap confirmed | `openspec/specs/security-and-privacy/spec.md:12-31`, `app/src/main.tsx:9-24`, `middleware/src/app.ts:215-247`, `middleware/src/middleware/csrf.ts:80-117`, `middleware/src/services/projectAccess.ts:1-94` | Secrets/session/RBAC/CSRF/headers are centralized and guarded; frontend analytics consent gating is not implemented for configured PostHog/GA, so `ADR-003` is tracked in [#20](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/20). |
| Planning hygiene | mostly conforms after handoff | `docs/agents/discipline.md:152-214`, `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list`, `gh issue list --state open`, `rg -n "TODO|FIXME|backlog|deferred|follow-up|seam-only|not-started|unchecked" app middleware shared openspec docs` | Only this review plan is active in OpenSpec before archive, and all open GitHub issues are backlog-labelled. `ADR-004` identified an Integrate UI-02 download pipeline deferral that lacked an exact open issue before Task 11; it is now tracked in [#21](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/21). |

## Architecture Map

Task 3 mapped the shipped architecture from source rather than stale diagrams:

| Area | Shipped map | Evidence | Review note |
|---|---|---|---|
| Runtime provider root | `AppProviders` injects `ApiProvider` outermost, then error/theme/motion/UI providers, `DocumentsProvider`, `AuthProvider`, `AppModeProvider`, `ScenarioRegistryProviderWithDemoHooks`, `OnboardingSessionProvider`, `CanvasOrchestratorProvider`, `OnboardingSkillProvider`, and `HelmetProvider`. | `app/src/App.tsx:37-86` | The provider order is explicit and testable; the production tree is not hidden in per-route helpers. |
| Route composition | Top-level `/` owns initialization; public `/onboarding*` mounts `OnboardingShell` through `PublicOnboardingLayout`; product `/c/:sessionId`, `/workspaces`, and `/projects` mount through `ProductRouteLayout` with `AppInitialization` and `OnboardingProvider`. | `app/src/router/router.tsx:32-44`, `app/src/router/router.tsx:46-120` | Public onboarding and authenticated product routes are separated at route layout level, but share app-wide providers. |
| Frontend API boundary | `realApi` is the single frontend network client; it wraps auth/session/chat/viewer events/intent/scenario/workflow/template/report/extract APIs and is injected through `ApiProvider`/`useApi`. | `app/src/api/client.ts:131-201` | This conforms to the DI/test-fake philosophy; direct import drift is a later task/test concern. |
| Middleware composition root | `createApp({ env, repository, partnerClient, groundxClient, llmClient, lightLlmClient, scenarioRegistry })` owns executable HTTP behavior and injected dependencies. | `middleware/src/app.ts:321-1511`, `middleware/src/types.ts:253-325` | The middleware contract is centered on `AppRepository` and injected upstream clients. |
| Shared contract root | `@groundx/shared` owns isomorphic schemas/types for `ApiError`, `Citation`, `ContentScope`, `ScopeFilter`, `WidgetRole`, `CanvasIntent`, `Catalog<T>`, and related parse/compile helpers. | `shared/src/index.ts:1-18`, `shared/src/index.ts:111-188`, `shared/src/index.ts:190-220` | This is the expected one-source-of-truth surface for app/middleware data contracts. |
| Chat/session state | `ChatStoreContext` validates hydrated `CanvasIntent` through shared `parseCanvasIntent`, builds deterministic per-scope session keys with `compileScopeFilter`, and owns session/entity/viewer state. | `app/src/contexts/ChatStoreContext/ChatStoreContext.tsx:34-81`, `app/src/contexts/ChatStoreContext/ChatStoreContext.tsx:145-220` | State ownership is centered in `ChatStore`, with localStorage guarded by parse boundaries. |
| Onboarding facade | `OnboardingSessionProvider` wraps `EntitySessionStoreProvider`; the facade maps F-series frames to canonical `ViewerStep` values and delegates entity/session mutations into `ChatStore` through `EntitySessionStore`. | `app/src/contexts/OnboardingSessionContext/OnboardingSessionContext.tsx:19-63`, `app/src/contexts/OnboardingSessionContext/OnboardingSessionContext.tsx:81-99`, `app/src/contexts/EntitySessionStoreContext/EntitySessionStoreContext.tsx:9-33` | This matches the "legacy facade over root session graph" model. |
| Canvas intent dispatch | `CanvasOrchestratorContext.dispatch()` writes current intent, viewer event, and intent log when `ChatStore` is mounted, then uses an exhaustive `switch` over `CanvasIntent.kind`; adapter registration still exists and runs after the switch. | `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx:52-65`, `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx:67-331` | See confirmed finding `ADR-001`: current durable spec text contradicts itself on whether `registerAdapter` is retired or retained. |
| Conversation and widget catalogs | `chatExperienceRegistry` implements shared `Catalog<T>` for chat experiences. `ScopedCanvas` resolves `ViewerStep -> CanvasKind -> componentForKind -> production scoped viewer widget registry`, and the production registry pairs descriptors with mounted components. | `app/src/conversation/chatExperienceRegistry.ts:1-97`, `app/src/components/layout/ScopedCanvas/ScopedCanvas.tsx:1-181`, `app/src/widgets/scopedViewerWidgetRegistryProduction.ts:1-142` | The main viewer widget path is catalog-backed and load-bearing, not a test-only convention. |

## Baseline Rubric

The review will use these standards:

1. **Composable architecture:** add a value on an existing axis instead of a new
   branch of structure. The required axes named by the docs are `ContentScope`,
   `WidgetRole`/current `mode`, route/experience, and read catalogs.
2. **Production reuse:** onboarding may own sign-up/gate, F1 ingest, and
   onboarding nav. Other durable product surfaces should be production widgets
   mounted through the shared shell.
3. **State ownership:** `ChatStore` is the root state aggregate, every
   `ChatSession` carries a paired `ViewerSession`, and canvas rendering should
   read viewer step/overlay state rather than a separate frame-only branch.
4. **One source of truth:** shared concepts come from `@groundx/shared` schemas
   or are explicitly reconciled in `docs/agents/data-model.md`.
5. **Round-trip done:** no persisted byte, endpoint, context field, or tool
   claim is treated as done without write/read/consumer/test evidence.
6. **TDD posture:** look for meaningful user-visible regression tests and drift
   guards. Do not infer failing-test-first from a green test suite alone.
7. **Widget/tool contract:** widgets have slot placement, default entry point,
   README, sibling test, current `mode` prop, declared tool metadata or opt-out,
   and no production dependency-direction inversion.
8. **Design fidelity:** compare implementation to wireframe intent and current
   durable UI specs, but preserve production design-system choices such as Inter
   and product tokens.
9. **Runtime proof:** browser-visible claims need measured DOM, network,
   console, a11y, or persisted/read evidence.
10. **Security/ops:** secrets never enter commits/browser; RBAC and credential
    isolation stay server-side; telemetry/PII/analytics gates follow durable
    specs.
11. **Planning hygiene:** active plans live in OpenSpec; deferred work lives in
    GitHub Issues; archived plans should not contain untracked future work.

## Conforming Strengths

| Area | Strength | Evidence |
|---|---|---|
| Shared shell | `OnboardingShell`, `SteadyShell`, and scoped Workspaces/Projects all mount `AppShell` instead of separate product shells. | `app/src/views/Onboarding/OnboardingShell.tsx:799-838`, `app/src/views/Steady/SteadyShell/SteadyShell.tsx:191-210`, `app/src/views/Scoped/ScopedConversationShell.tsx:184-206` |
| Single chat flow | `ChatColumn` and scoped routes both compose the same `ConversationFlow`; onboarding behavior is supplied as a `ChatExperience`, while steady chat passes no experience. | `app/src/components/chat-widgets/ChatColumn/ChatColumn.tsx:1-20`, `app/src/components/chat-widgets/ChatColumn/ChatColumn.tsx:130-160`, `app/src/views/Scoped/ScopedConversationShell.tsx:143-165`, `app/src/conversation/ConversationFlow.tsx:1-118` |
| Shared viewer mount path | `ScopedCanvas` resolves viewer steps through the production scoped viewer widget registry; Workspaces/Projects and onboarding both use this path when a viewer step is active. | `app/src/components/layout/ScopedCanvas/ScopedCanvas.tsx:54-181`, `app/src/widgets/scopedViewerWidgetRegistryProduction.ts:1-142`, `app/src/views/Scoped/ScopedConversationShell.test.tsx:118-142` |
| Scoped authenticated routes | `/workspaces` and `/projects` build `ContentScope` values and ensure per-scope chat sessions instead of creating new flow components. | `app/src/views/Scoped/ScopedConversationShell.tsx:83-110`, `app/src/views/Scoped/ScopedConversationShell.test.tsx:85-115`, `app/src/views/Scoped/ScopedConversationShell.test.tsx:145-204` |

## Composition And Reuse Audit

| Candidate | Verdict | Evidence | Rationale |
|---|---|---|---|
| F1 picker overlay with `IngestView` and `StepStrip` | legitimate onboarding shell | `app/src/views/Onboarding/OnboardingShell.tsx:41-143`, `app/src/views/Onboarding/OnboardingShell.tsx:549-572`, `app/src/views/Onboarding/OnboardingShell.tsx:841-887` | F1 is the explicitly allowed ingest-picker surface. The underlying `AppShell` remains mounted and is hidden from assistive tech while the overlay is active. |
| Gate/value-prop and booking surfaces | legitimate contextual shells | `app/src/views/Onboarding/OnboardingShell.tsx:361-396`, `app/src/views/Onboarding/OnboardingShell.tsx:510-531` | These are anonymous/sign-up or calendar surfaces, not document-scoped viewer widgets; they decorate the shared shell rather than replacing it. |
| Steady empty canvas placeholder | legitimate empty state | `app/src/views/Steady/SteadyShell/SteadyShell.tsx:133-189`, `app/src/views/Scoped/ScopedConversationShell.test.tsx:118-142` | Steady mode starts without an active document; once a doc-viewer step exists, the shared `ScopedCanvas` path mounts the production PDF viewer. |
| Workspaces/Projects hard reload from onboarding nav | accepted but worth future cleanup only if UX requires it | `app/src/views/Onboarding/OnboardingShell.tsx:609-624`, `app/src/views/Onboarding/OnboardingShell.test.tsx:475-510`, `openspec/specs/conversation-flow/spec.md:124-140` | The behavior is deliberately test-backed. It is not a hidden duplicate shell, but client-side navigation would be more idiomatic now that the product routes share providers. |
| Onboarding report scope uses `filter.project` | not a Task 4 composition finding; carry to Task 5 | `app/src/views/Onboarding/OnboardingShell.tsx:467-482`, `app/src/views/Scoped/projectScopeVocabulary.test.ts:13-20`, `docs/agents/data-model.md:23-25` | The issue is vocabulary/data-contract drift, not a component fork. |

## Data Contract And Round-Trip Audit

| Concept | Write site | Read or execution site | Consumer/render site | Test or guard evidence | Verdict |
|---|---|---|---|---|---|
| Chat sessions | `middleware/src/app.ts:522-556`; client ensure path in `app/src/api/chatSessions.ts:143-180` | `middleware/src/app.ts:583-620`, `middleware/src/app.ts:666-676` | `ChatStoreServerHydrator` and chat/session switcher flows hydrate from the server list/message routes. | `middleware/src/apiRouteContract.test.ts:563-704`, `app/src/api/chatSessions.test.ts`, `app/src/api/chatSessionsList.test.ts` | Mostly conforming. Ownership and anon-to-authed claim are route-tested. |
| Chat messages and citations | `middleware/src/services/chatHandler.ts:228-247`, `middleware/src/services/chatHandler.ts:443-462` | `middleware/src/app.ts:583-620`, `middleware/src/services/chatHandler.ts:248-259` | `ConversationFlow`/`ChatColumn` render hydrated turns and citation chips. | `middleware/src/apiRouteContract.test.ts:563-704`, `app/src/components/chat-widgets/ChatColumn/ChatColumn.test.tsx:491-920` | Conforming. User and assistant turns persist, hydrate, and preserve parsed citations. |
| Conversation summaries | `middleware/src/services/conversationCompressor.ts:253-270`, `middleware/src/services/conversationCompressor.ts:296-349` | `middleware/src/services/chatHandler.ts:251-259` | LLM context bundling uses active summaries before routing the next chat turn. | `middleware/src/services/conversationCompressor.test.ts`, `middleware/src/services/chatHandler.test.ts:875-932` | Conforming at service level; not directly UI-rendered, but it is an LLM context contract. |
| Chat session entities and scope refs | `app/src/contexts/ChatStoreContext/ChatStoreContext.tsx:720-744`, `middleware/src/app.ts:833-900` | `middleware/src/services/chatHandler.ts:261-265`, `middleware/src/services/chatHandler.ts:512-550` | Chat RAG scope and structured handlers consume active entity state and scope refs. | `middleware/src/apiRouteContract.test.ts:886-1048`, `middleware/src/services/chatHandler.test.ts:445-739` | Mostly conforming. Server-only scope refs are preserved and projectId scope derivation is tested. |
| Viewer events | `app/src/contexts/ChatStoreContext/ChatStoreContext.tsx:750-810`, `middleware/src/app.ts:918-1008` | `middleware/src/services/chatHandler.ts:265-272` | LLM context bundling sees recent viewer history; optimistic UI retains visible state. | `middleware/src/apiRouteContract.test.ts:720-872`, `app/src/api/viewerEvents.test.ts`, `app/src/contexts/ChatStoreContext/ChatStoreContext.test.tsx:179-217` | Conforming. This closes a prior write-only test seam. |
| Canvas intents and intent log | `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx:67-103`, `middleware/src/app.ts:1020-1071` | Middleware/repository intent log; current intent remains on the active chat session. | Canvas side effects and agent tool dispatch consume stamped intents. | `app/src/api/intentLog.test.ts`, `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.test.tsx:251-277`, `middleware/src/app.test.ts` | Mostly conforming, with `ADR-001` covering conflicting adapter-retirement spec text. |
| Templates and Smart Report render | `middleware/src/app.ts:1328-1368`, `app/src/api/smartReport.ts:221-260` | `middleware/src/app.ts:1242-1320`, `middleware/src/services/reportRenderer.ts:479-500` | `SmartReportRender` calls the render endpoint on first paint and re-render. | `app/src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx:147-153`, `middleware/src/services/reportRenderer.test.ts:183-239`, `middleware/src/app.test.ts:1256-1266` | Mixed. Endpoint/render round-trip exists, but scope vocabulary uses `filter.project` in app and middleware report code; see `ADR-002`. |
| Projects, grants, and RBAC | `middleware/src/app.ts:1502-1518`, `middleware/src/services/projectAccess.ts:47-98` | `middleware/src/services/projectAccess.ts:19-35`, `middleware/src/app.ts:1410-1426` | Chat and report retrieval receive server-derived RBAC filters. | `middleware/src/services/projectAccess.test.ts`, `middleware/src/services/groundxSearch.compose.test.ts`, `middleware/src/app.test.ts` | Mostly conforming. RBAC is server-side and intersects scope filters; Smart Report scope-key drift can still request the wrong filter field. |

## TDD And Test Evidence Audit

| Area | Evidence checked | Verification result | Review note |
|---|---|---|---|
| Recent plan discipline | `git log --oneline --decorate -20`; archived tasks for `2026-06-03-fix-tool-registry-and-project-scope`, `2026-06-04-real-signed-in-onboarding`, `authenticated-onboarding-reachability`, and `2026-06-03-required-e2e-gap-closure` | Recent OpenSpec task files record failing-first tests, adversarial reviews, focused test passes, browser evidence where relevant, and cleanup decisions. | This is good process evidence, but it is not proof that every current test was written red-first. The audit treats it as posture evidence only. |
| Widget and catalog contracts | `app/src/test/widget-contract.test.ts:186-235`, `app/src/tools/catalog-parity.test.ts:49-116`, `app/src/tools/catalog-parity.test.ts:131-197` | `npm --prefix app run test -- src/test/widget-contract.test.ts src/tools/catalog-parity.test.ts src/test/frontend-api-injection-guard.test.ts src/views/Scoped/projectScopeVocabulary.test.ts` passed: 4 files, 177 tests. | Strong non-vacuous guards for widget homes, dependency direction, app/server tool mirrors, descriptions, roles, and rendered chat-widget bindings. |
| API injection discipline | `app/src/test/frontend-api-injection-guard.test.ts:167-195` | Included in the focused app guard run above. | Guards production consumers against direct migrated network imports and guards tests against reintroducing per-file mocks. |
| Project/RBAC search contract | `middleware/src/services/contentScopeVocabulary.test.ts:35-84`, `middleware/src/services/groundxSearch.compose.test.ts`, `middleware/src/services/projectAccess.test.ts` | `npm --prefix middleware run test -- src/services/contentScopeVocabulary.test.ts src/services/toolCatalog.test.ts src/services/groundxSearch.compose.test.ts src/services/projectAccess.test.ts` passed: 4 files, 39 tests. | Strong for the chat/entity/project path; it does not cover Smart Report's separate scope resolver island. |
| Smart Report local tests | `app/src/widgets/reportFixtures.test.ts:8-20`, `app/src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx:147-153`, `middleware/src/services/reportRenderer.test.ts:44-48` | `npm --prefix app run test -- src/components/viewer-widgets/SmartReportRender/SmartReportRender.test.tsx src/components/viewer-widgets/SmartReportBuilder/SmartReportBuilder.test.tsx src/widgets/reportFixtures.test.ts src/api/smartReport.test.ts` passed: 4 files, 44 tests. `npm --prefix middleware run test -- src/services/reportRenderer.test.ts` passed: 1 file, 26 tests. | These tests prove render plumbing, but they currently codify `filter.project`; this is the TDD guard gap for `ADR-002`. |

## Widget And Tool Contract Audit

| Area | Evidence checked | Verdict | Review note |
|---|---|---|---|
| Widget directory contract | `find app/src/components/chat-widgets app/src/components/viewer-widgets -mindepth 1 -maxdepth 2 -type f`; `app/src/test/widget-contract.test.ts:330-452` | Conforming. | Every widget directory is guarded for sibling test, role/scope props, no raw id props, no retired mode literal, and exactly one LLM tools file or `no-llm.md` with a `## Why` section. |
| App metadata is declarative | `app/src/tools/types.ts:1-86`, `app/src/tools/appToolMetadata.test.ts:23-35` | Conforming. | App tool declarations are metadata for descriptors/parity checks. The specific guard passes and rejects both `handler:` fields and a production `tools/registry.ts` singleton. |
| App/server catalog parity | `app/src/tools/catalog-parity.test.ts:49-116`, `app/src/tools/catalog-parity.test.ts:131-197` | Conforming. | The app-side parity test imports `SERVER_TOOL_CATALOG`, checks name/description/role expectations, and proves `rendersWidget` bindings resolve to real mounted chat widgets. |
| Middleware executable catalog | `middleware/src/services/toolCatalog.ts:52-83`, `middleware/src/services/toolCatalog.ts:673-768`, `middleware/src/services/toolCatalog.test.ts:164-196`, `middleware/src/services/toolCatalog.test.ts:217-270` | Conforming. | Server catalog is the authoritative executable surface. It owns `intentBuilder`, role exposure, valid-step filtering, and the safe-minimum path for untrusted unknown step strings. |
| App runtime tool registry resurrection | `rg -n "registerTool|toolRegistry|AppToolRegistry|appToolRegistry|runtime tool|handler" app/src middleware/src shared/src openspec/specs docs/agents`; `npm --prefix app run test -- src/tools/appToolMetadata.test.ts src/tools/catalog-parity.test.ts` | No production resurrection found. | Remaining `toolRegistry` references are docs/spec/history or tests that prohibit it; no new issue needed. |

## Security, RBAC, Observability, And Ops Audit

| Area | Evidence checked | Verification result | Review note |
|---|---|---|---|
| Env and credential boundaries | `middleware/src/config/env.ts:21-155`, `middleware/src/index.ts:55-98`, `docs/agents/gotchas.md`, `docs/agents/mcp-tools.md` | `npm run scan:secrets` passed. Production env validation requires non-default `SESSION_SECRET`, GroundX partner key, LLM key/service/model, and MySQL settings when production or MySQL mode is active. | Mostly conforming. The documented harness-key-in-`.env.local` workaround is a known future credential-location problem, not a committed-code secret leak in this review. |
| Session, auth, and CSRF | `middleware/src/middleware/session.ts:65-153`, `middleware/src/middleware/csrf.ts:80-117`, `middleware/src/app.ts:277-286`, `middleware/src/middleware/session.test.ts`, `middleware/src/middleware/csrf.test.ts` | Full middleware suite passed: 44 files, 731 tests. | Conforming. Session cookies are signed, `httpOnly`, `sameSite: "lax"`, and secure in production; state-changing routes use the double-submit CSRF middleware except documented bootstrap/reset paths. |
| RBAC and project filters | `middleware/src/services/projectAccess.ts:1-94`, `middleware/src/services/groundxSearch.compose.test.ts`, `middleware/src/services/contentScopeVocabulary.test.ts`, `middleware/src/app.ts:1511-1540` | Full middleware suite passed, including project access, content-scope vocabulary, and GroundX filter composition tests. | Mostly conforming. Server-side grants derive `{ projectId: { $in: [...] } }` and intersect with scope filters. `ADR-002` remains the Smart Report island that can request the stale key. |
| Headers, rate limits, metrics, and logs | `middleware/src/app.ts:208-286`, `middleware/src/app.ts:297-340`, `middleware/src/app.ts:1634-1678`, `middleware/src/lib/logger.ts:1-42`, `middleware/src/lib/metrics.ts:1-50` | Full middleware suite passed, including security headers, metrics, request-log skip, and no-mock-mode drift guards. | Mostly conforming. Helmet/CSP, CORS, rate limits, Prometheus metrics, redaction paths, and safe 5xx response shaping are centralized. Air-gap URL/font/CSP seams remain documented future follow-ups. |
| Telemetry and PII scrubbing | `middleware/src/lib/pii.ts:1-58`, `middleware/src/lib/telemetry.ts:81-123`, `app/src/lib/sentry.ts:1-80`, `docs/agents/observability.md:119-174` | Full middleware suite passed, including `middleware/src/lib/pii.test.ts` and `middleware/src/lib/telemetry.test.ts`. | Mostly conforming for server-side PostHog/Sentry/OTel no-op/scrub behavior. Source-map upload remains documented `seam-only` until a Sentry project and CI upload path exist. |
| Frontend analytics consent | `openspec/specs/security-and-privacy/spec.md:12-31`, `app/src/main.tsx:9-24`, `app/src/lib/analytics.ts:40-49`, `app/src/lib/ga.ts:48-72`, `rg -n "consent|Consent|cookie.*analytics|analytics.*cookie" app/src middleware/src openspec docs/agents` | No app consent gate or consent cookie implementation found. | Not conforming. When `VITE_POSTHOG_API_KEY` or `VITE_GA_MEASUREMENT_ID` is configured, bootstrap calls `initAnalytics`/`initGa` before rendering any consent UI; GA injects `gtag.js` immediately. See `ADR-003`. |

## Planning Hygiene Audit

| Area | Evidence checked | Verdict | Review note |
|---|---|---|---|
| Active OpenSpec | `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list` | One active change: `2026-06-04-architecture-design-adversarial-review` (52/72 tasks at Task 10 scan time). | Conforming while this review is active. Task 12 should archive this change after issue handoff and validation. |
| Durable specs | `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 list --specs` | 17 spec capabilities listed. | Used as source of truth; no separate tracker introduced by this review. |
| Open GitHub Issues | `gh issue list --repo GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7 --state open --limit 200 --json ...` | Before Task 11, open issues were all backlog-labelled: `#1`, `#2`, `#3`, `#5`, `#11`, `#13`, `#14`. After handoff, `#18`, `#19`, `#20`, and `#21` are also open and backlog-labelled. No open non-backlog issue was present. | Conforming to the planning split: deferred work lives in GitHub Issues. |
| Existing deferred source markers | live-source `rg` for TODO/FIXME/backlog/deferred/follow-up/seam-only | Mostly covered. | `CF-04` page usage maps to `#13`; `CF-19` group resolver maps to `#14`; F7 real surface maps to closed `#4`; scoped route `filter.project` maps to closed `#17`; tool-registry cleanup maps to closed `#16`; view/primitive tool comments are delivered by tool-system-completion and current guards. |
| Confirmed untracked items | targeted GitHub searches for `registerAdapter`, Smart Report `projectId`, analytics consent, and UI-02 download pipeline | Task 11 created four backlog handoff issues. | `ADR-001`, `ADR-002`, `ADR-003`, and `ADR-004` had no exact open issue before handoff. `#11` is adjacent to Smart Report but covers `no_template`, not scope-key drift. Closed `#17` covers scoped `/projects`, not Smart Report. Closed `#4` covers F7 surface reachability, not UI-02 plugin downloads. |

## Confirmed Gaps

| id | Severity | Summary | Evidence | Next step |
|---|---|---|---|---|
| ADR-001 | medium | The durable `app-architecture` spec contradicts itself on whether `registerAdapter` is retired or retained. | `openspec/specs/app-architecture/spec.md:250-256`, `openspec/specs/app-architecture/spec.md:715-726`, `app/src/contexts/CanvasOrchestratorContext/CanvasOrchestratorContext.tsx:52-65` | [#18](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/18). |
| ADR-002 | high | Smart Report/onboarding report scope still uses `filter.project`, while the current product data/search/RBAC contract uses `filter.projectId`. | `openspec/specs/data-tier/spec.md:176-190`, `shared/src/index.ts:122-129`, `app/src/views/Onboarding/OnboardingShell.tsx:467-482`, `app/src/widgets/reportFixtures.ts:152-184`, `middleware/src/services/reportRenderer.ts:83-153` | [#19](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/19). |
| ADR-003 | high | Frontend PostHog/GA initialization is not consent-gated, despite the durable privacy/security spec requiring a cold-load consent banner before analytics/tracking scripts load. | `openspec/specs/security-and-privacy/spec.md:12-31`, `app/src/main.tsx:9-24`, `app/src/lib/analytics.ts:40-49`, `app/src/lib/ga.ts:48-72` | [#20](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/20). |
| ADR-004 | low | Integrate plugin downloads remain disabled-future under UI-02; before this review, after `#4` was closed, there was no open issue tracking the promised download pipeline. | `app/src/components/viewer-widgets/Integrate/Integrate.tsx:47-63`, `app/src/components/viewer-widgets/Integrate/README.md:52-64`, `docs/agents/widget-access-matrix.md:41`, `openspec/specs/ui-views/spec.md:12-31`, GitHub issue `#4` close comment | [#21](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/21). |

## Not-A-Defect Judgments

These are baseline judgments from the current docs/specs. The source audit may
still confirm a defect if shipped code contradicts them.

| Candidate | Judgment | Evidence |
|---|---|---|
| Existing widgets still using `mode`/raw document props | Not automatically a defect; role/scope is the migration target for new work and current code still ships `mode`/`documentId` until that migration lands. | `docs/agents/real-data-rewire-gap.md:19-25`, `docs/agents/template-scope-results.md:51-54`, `docs/agents/data-model.md:107-110` |
| F3-F7 view bodies not yet all ≤20 LOC | Not automatically a defect until the corresponding production widgets land; the durable requirement explicitly says partial state. | `openspec/specs/app-architecture/spec.md:11-16` |
| `views/Auth/` not fully culled | Not automatically a defect until AU-01/AU-02 ship; durable requirement is deferred. | `openspec/specs/app-architecture/spec.md:37-49` |
| Scaffold-default Partner API contexts still present | Not automatically a defect until UI-05 follow-on context cleanup lands. | `openspec/specs/app-architecture/spec.md:51-63`, `docs/agents/widget-contract.md:308-341` |
| Visual regression and load testing not fully implemented | Not automatically a defect; specs name platform/streaming/tool blockers. | `openspec/specs/testing-suite/spec.md:78-105` |
| Production MySQL primary not proven in deployed environment | Not automatically a code defect; durable spec says infra provisioning/Helm secret wiring blocks production use. | `openspec/specs/data-tier/spec.md:25-38` |
| Post-signup workspace setup wireframe | Not automatically a defect. The wireframe explores placement options for a future workspace setup flow; current signed-in onboarding was intentionally implemented with best judgment for existing authenticated routes rather than a mocked post-signup form. | `openspec/wireframes/source/spec-workspace.jsx`, `openspec/changes/archive/2026-06-04-authenticated-onboarding-reachability/tasks.md` |

## Design Fidelity And Runtime Audit

| Surface | Wireframe intent | Source/runtime evidence | Verdict |
|---|---|---|---|
| Shared shell and F1 | F1 is canvas/source-picker first; F2+ settles into the shared nav/chat/canvas shell. | `AppShell` supports `hideNav`, `hideChat`, split/focus modes, compact mode, reduced motion, drag bounds, and a stable shell instance (`app/src/components/layout/AppShell/AppShell.tsx:1-340`). `AppShell.test.tsx` covers F1 no-chat/no-nav, stable instance, nav width, focus modes, compact canvas pinning, and reduced motion. | Mostly conforming. |
| StepStrip | Four-step journey with Analyze bracket and accessible locked/reachable pills. | `StepStrip` implements the bracket, disabled/active/reachable states, keyboard handlers, `aria-current`, `aria-disabled`, compact mode, and contrast checks (`app/src/components/layout/StepStrip/StepStrip.tsx:1-180`; `StepStrip.test.tsx:1-260`). | Conforming. |
| Citation proof | Citation chips should be shared proof affordances that route to source/highlight. | `CiteChip` dispatches `highlightCitation`, carries `aria-label`, page/document metadata, and tokenized accent colors (`app/src/components/brand/CiteChip/CiteChip.tsx:1-120`). Focused tests passed. | Mostly conforming; the richer hover peek in wireframes is intentionally simplified to the shipped doc-jump behavior. |
| Scoped viewer widgets | Workspaces/Projects/onboarding canvas should select production widgets through shared scope and viewer step, not direct view forks. | `ScopedCanvas` maps `ViewerStep` to production registry components and renders a labelled idle placeholder for `ingest-picker`/no widget (`app/src/components/layout/ScopedCanvas/ScopedCanvas.tsx:1-160`). Desktop runtime `/projects` showed the project scope and idle canvas state. | Mostly conforming. |
| Responsive behavior | Desktop split, tablet/mobile single-pane with drawer/toggle, no drag handle below compact breakpoint. | Chrome DevTools MCP measured desktop `/projects`: 180px nav, 420px chat, 747px canvas, no compact topbar. After resize, compact topbar existed, nav was drawer-only, chat filled the viewport, the canvas toggle switched panes, no separator rendered, and `scrollWidth === clientWidth`. | Conforming for the measured scoped route. |
| Design token discipline | Production should use product tokens/Inter rather than wireframe-only handwritten styling. | `npm --prefix app run test -- src/test/no-hardcoded-styles.test.ts src/components/layout/AppShell/AppShell.test.tsx src/components/layout/StepStrip/StepStrip.test.tsx src/components/brand/CiteChip/CiteChip.test.tsx` passed 125 tests. Source scan found raw debug/error-boundary colors that are already allowlisted by the style guard. | Mostly conforming. |
| Runtime health | Runtime claims need console/network/a11y evidence. | Chrome DevTools MCP on `127.0.0.1:4174/projects`: no console messages; app-owned requests `/api/chat-sessions`, `/api/scenarios`, `/api/auth/me`, and message hydration returned 200; a11y snapshot exposed `Open navigation`, `View chat`, and the canvas empty-state heading/body. | Conforming for this review slice. |

## Recommended Next Decisions

This review should close as review-only. The highest-priority follow-up issues
are [#19](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/19)
for Smart Report scope correctness and
[#20](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/20)
for analytics consent. [#18](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/18)
is a spec cleanup guardrail; [#21](https://github.com/GroundX-Studio/workspace-groundx-v2-ui-a7a4fac7/issues/21)
is backlog hygiene around the UI-02 Integrate download pipeline.
