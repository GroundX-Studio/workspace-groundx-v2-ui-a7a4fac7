# Backlog

**The single source of truth for pending work across the project.**

Every item has a stable id. Inline `TODO(<id>)` markers in source
reference an entry below. When an item closes, the inline TODO gets
DELETED.

Created 2026-05-25 after the working-session pattern of "close the
seam, leave the implementation as TODO" became a project-wide
problem. Memory's `project_build_status.md` "Still open" section
points here.

## Rules of engagement

1. **Definition of done = user-visible test.** A test against the
   seam (interface compiles, mock works) is `in-progress`, not
   `closed`. Closure requires a test exercising real user behavior.
2. **WIP cap = 3 per epic.** Before opening a 4th in any one
   epic, close one OR move it back to `not-started`.
3. **Closure deletes inline TODOs.** Grep should never find a
   `TODO(X-N)` that points at a closed item.
4. **Honest commit titles.** "X: seam + 3 of 7 sub-cases wired" not
   "X: done."
5. **No silent additions.** New work goes here with a status before
   any code lands.

## Status legend

- **not-started** — design known, no code yet
- **in-progress** — partial — has a seam or some sub-cases; pending
  more before user-visible test passes
- **blocked** — external dependency (data table, env, product call)
- **closed** — user-visible test passes; inline TODOs deleted

## Priority (set 2026-05-25; revised 2026-05-25 after audit)

Priority is orthogonal to status — a blocked P0 still beats a
not-started P2. The default is P2; non-default IDs are listed
explicitly. Grep `^- \*\*P[0-9]` for the four buckets.

- **P0** — UR-03, UR-04, TS-02, TS-03, TS-08, TS-09, TS-11
- **P1** — OPS-01, OPS-04, OPS-05
- **P2** — everything else (implicit), plus **TS-05, TS-06, TS-07**
  (demoted 2026-05-25 — each has a real upstream blocker; see
  per-row "Blocker" notes)
- **P3** — every `deferred-late` item (CF-06a, PLUG-07)

Rationale: P0 is "ship-quality runtime" — the motion fallback, the
StepStrip sub-bracket, and the testing coverage gaps are what keep a
demo from breaking under a customer's hands. P1 is the agent-loop
ergonomics + air-gap seams that aren't user-visible but block our
ability to debug and sell. P3 is parked work where pulling forward
burns credit (LLM eval) or commitment (plugin ADR) before the
upstream caller exists.

**Demotion rationale (2026-05-25):** TS-05, TS-06, TS-07 each need
work that doesn't exist yet OR a platform decision the project
hasn't made. Better to stop calling them P0 than to ship a watered-
down version that loses the original closure intent. Re-promote each
when the corresponding blocker clears.

## ID conventions

| Prefix | Epic | Owner direction |
|---|---|---|
| `CF-N` | Chat algorithm | LLM runtime + RAG + compression |
| `AU-N` | Auth + RBAC | Sessions, magic-link, SSO, session merge |
| `DT-N` | Data model | DB schema, migrations, scope refs |
| `UI-N` | Product surfaces | F1–F7 views + Steady mode |
| `TL-N` | Agent tools | Tool surface + canvas dispatch routes |
| `OB-N` | Observability | Sentry, PostHog, GA, Hotjar, dashboards |
| `SC-N` | Security | CSRF, consent, PII expansion |
| `UR-N` | UI runtime | pdfjs, drag-resize, motion, primitives |
| `SCEN-N` | Scenarios | Per-scenario fixtures + completeness |
| `SL-N` | Scale / perf | Pool sizing, batching, streaming, background jobs |
| `TS-N` | Testing | Coverage gaps + load + a11y + visual regression |
| `OPS-N` | Operations | Migrations infra, MCP cluster reading |
| `POL-N` | Polish | Known minor bugs |
| `PLUG-N` | Plugin system | Plugin loader, OnboardingSkillContext, SDR content, tour state machine, onboarding overlay surface |

---

# Foundations (must land first; unblocks above)

These are dependency roots. Pick from here when nothing in your
current epic is actionable.

| ID | Status | Item | Closure test |
|---|---|---|---|
| **DT-01** | not-started | Knex migrations directory + Helm pre-install job. Today `createSchema()` inlines `CREATE TABLE IF NOT EXISTS`. Productionizing: versioned `middleware/src/db/migrations/NNNN_*.sql` + Helm pre-install/upgrade Job that runs them. Memory: project_database.md "knex migrations deferred." | Schema change between two migrations rolls forward + back cleanly. |
| **DT-02** | not-started | MySQL primary in production. Schema + repo impls + claim endpoint exist. Provision RDS/self-hosted, set `APP_REPOSITORY_MODE=mysql` + creds, first deploy runs `createSchema()`. | Production deploy reads/writes against MySQL; in-memory repo unused. |

# Epic: CHAT — LLM runtime + RAG + compression

CF-01 through CF-18. Inline `TODO(CF-N)` markers in middleware
`chatRouter.ts` / `chatHandler.ts` / `structuredHandler.ts` and
in `app/src/api/chatSessions.ts` reference these rows.

| ID | Status | Item | Closure test |
|---|---|---|---|
| CF-19 | not-started | `ensureBucketGroup(bucketIds[]) → groupId` helper. Multi-workspace pivots (user looking across 2+ buckets) need a pre-created GroundX Group. Builds: stable hash of sorted bucket-id list → cached groupId → fallback to Partner API `POST /v1/groups` with deterministic name. Sub-deferral of CF-15 — no upstream caller produces a multi-bucket scope yet, so no user-visible test exists until that caller (UI-05 SteadyShell, or a multi-bucket project view) lands. Don't ship this until a real call site exists. | A multi-bucket entity (`bucketIds:[B1,B2]`) sent through the chat path triggers `ensureBucketGroup([B1,B2])`; first call creates the group via Partner API; second call returns the cached id without a second POST; chatHandler then routes the search via `{kind:"group", groupId}`. |
| CF-06a | **deferred-late** | Eval-set-in-CI follow-up to CF-06. ≥20 (query, expected-cite, expected-refusal) tuples per scenario (Utility/Loan/Solar). Runner exercises `callGroundedLlm` against the live LLM (or a configurable provider) and grades each answer against the expected cite/refusal. Regression fails the CI job. Splits from CF-06 because the runner + ground-truth authoring is genuinely separate work from the prompt code. Requires: (a) eval fixture per scenario, (b) grading function (cite presence + refusal-pattern match), (c) opt-in CI workflow that uses a real key (paid + flaky-tolerant). Soft-blocked on SCEN-06 (real sample PDFs) for the cite-against-real-text portion. **Per locked decision 2026-05-25:** deferred to the late-stage closure pass — no upstream item is blocked on it, and shipping it early would burn LLM credits before the prompt has stabilized. Pull forward only if (a) SCEN-06 lands AND (b) prompt regressions actually start happening in production. | The 60-tuple eval set runs in CI; a deliberate prompt regression (e.g. stripping the refusal contract) fails the job. |
| CF-10 | not-started | Compression off the request hot path. Job queue + background worker + 202/poll OR "pending" flag on session. | Posting near threshold returns 200 promptly; compression completes async; next post sees new active summary. |
| CF-11 | not-started | Streaming response (SSE / fetch-stream). | E2e renders a long answer token-by-token. |
| CF-12 | not-started | Tool-call wiring in routeChat (see also TL-* below for the individual tool routes). | A query firing `show_extraction` produces the tool call in the reply. |
| CF-14 | not-started | DB pool sizing + batch reads. Pool=10 with 5–8 sequential reads per post. | Load test asserts P99 < 1s with 50 concurrent posts. |

# Epic: AUTH — sessions, magic-link, SSO, session merge

| ID | Status | Item | Closure test |
|---|---|---|---|
| AU-01 | not-started | Magic-link provisioning endpoint `POST /api/auth/magic-link/send` + callback handler. Currently no magic-link route exists; `commitGate("register")` does direct register only. Memory: `project_auth_state_machine.md` references magic-link as an auth method. | User clicks "send magic link" → POST → email contains link → click → session created. |
| AU-02 | blocked | SSO with Partner-API verification. `SSO_ENABLED` flag gates UI but no OAuth/callback middleware routes. Blocked on product decision: which IdPs (Google, Okta, custom)? | SSO_ENABLED + IdP-configured deploy → user clicks SSO → callback → session minted. |
| AU-03 | not-started | Session merge on signin from new browser. Pre-signin pinned answers + schemas (in localStorage on old browser) carry over after user signs in elsewhere. Memory: `project_auth_state_machine.md` "session merge." | User signs in on browser B; sees pinned answer from browser A's anon session. |
| AU-04 | not-started | AuthProvider race tests (anon→authed flip during in-flight chat send). Today `app/src/contexts/AuthContext/` has 0 race tests. | Test: chat-message in flight when login fires; assert no orphaned message, no wrong-owner write. |

# Epic: DATA — DB schema + scope refs

| ID | Status | Item | Closure test |
|---|---|---|---|
| DT-01 | not-started | (Foundation — see above) Knex migrations infra. | |
| DT-02 | not-started | (Foundation — see above) MySQL primary in prod. | |
| DT-03 | not-started | Retention sweep jobs. `chat_messages`/`summaries` keep 1yr default; `intent_log` 90d; `viewer_events` 30d. Per `project_database.md` retention table. No sweep job exists. | Job runs nightly; rows past retention deleted. |
| DT-04 | not-started | Anonymous compression strategy. `project_database.md`: "Anon compression deferred / localStorage if implemented." Today anon sessions don't compress at all — their messages stay in localStorage forever and eventually hit the localStorage growth cap. | Either: (a) wire anon compression server-side (since anon now has DB rows), OR (b) write a localStorage-side compression for anon-only that mirrors the leaf+meta shape. |

# Epic: UI — product surfaces + Steady mode

| ID | Status | Item | Closure test |
|---|---|---|---|
| UI-01 | not-started | **F4 SchemaView** (chat-driven schema builder). Biggest unstarted product surface. W7 Extract widget on the canvas; intent dispatch from chat ("add field X" / "remove field Y"); live extraction preview; save-template. Multi-day. | E2e: user picks a sample, types "add field for total amount", schema updates live, extraction re-runs. |
| UI-02 | not-started | **F7 IntegrateView** real connector cards + agent-plugin download buttons. Today the buttons are non-functional. | E2e: user clicks "download" on an agent plugin, gets a real artifact. |
| UI-03 | not-started | **F3a edit-schema branch**. Inline schema editor stub today; wire to schema-builder widget pattern. | User edits a field's prompt in F3, extraction re-runs against the new schema. |
| UI-04 | not-started | **F5 InteractView polish**. Citation chips inline with bot turns; clicking a chip opens a side panel with the source page. Today F5 has citation chips but no side panel. | Click chip → side panel opens with PDF page. |
| UI-05 | not-started | **Steady-mode chat + canvas inside SteadyShell**. Currently a placeholder with `SessionSwitcher` mounted. | Authed user navigates to `/c/:sessionId` → real chat + canvas surface renders. |
| UI-06 | not-started | Session list fetch from BFF when URL session id isn't in localStorage. Today the "unknown session" hint is an inline `<code>` placeholder. | Open `/c/:unknownId` on a fresh browser → BFF fetch populates the session → UI renders. |
| UI-07 | not-started | Multi-session keyboard shortcuts (cmd-K to switch). | cmd-K opens a session picker; arrow keys navigate; Enter switches. |
| UI-08 | not-started | Engineer-call Calendly wire-up. `commitGate("engineer-call")` is a stub with no Calendly round-trip. Needs `CALENDLY_URL` env + embed or `<a target=_blank>`. | "Book a call" button opens Calendly; `gate_event` recorded. |
| UI-09 | not-started | Richer thinking-note formatting. Manifest `thinkingScript` is `string[]`; wireframe shows bolded words. Extend to support markdown-lite. | Manifest with `**bold**` renders bold in F2 thinking stream. |
| UI-11 | not-started | Variable inference / `{project}` placeholder UX. Per `project_dev_contracts.md` decision #12: "automatic variable inference is parked... UX for proposing variables is the hybrid pattern (deferred)." Today S3a section editor doesn't propose variables; user can only inline-edit. | User selects "the project" → "make variable" surfaces a chip; future runs render `{project}`. |
| UI-12 | not-started | **BYO upload UI passes `filter.workflow_id` on every uploaded doc.** Per `memory/project_workflow_id_filter.md` (locked 2026-05-25): when the user-facing upload UI ships (no surface today; F1 has a BYO tile but no upload widget behind it), the ingest payload's `filter` must include `workflow_id` whenever the upload was scoped to a workflow. Implementation when this surface lands: (a) accept a workflow id at the upload-flow entry (selected by user OR inherited from the active scenario / project / bucket); (b) construct `filter: { ..., workflow_id }` in the `IngestDocumentsInput.documents[].filter` before calling `ingestRemoteDocuments`; (c) the entity layer + middleware proxy already pass the filter through unchanged, so no new wire-up there. Frontend tests must assert the filter contains workflow_id when ingest is triggered from a workflow context. | A BYO upload that originates inside a workflow-scoped surface produces a GroundX doc whose `filter.workflow_id` matches the originating workflow; a test mocks the ingest call and asserts the filter payload. |

# Epic: TOOLS — agent canvas-dispatch + content tools

All from `project_dev_contracts.md`. None wired today — `reply.tools` is always `[]`.
CF-12 is the umbrella; TL-* are the individual tool surfaces.

| ID | Status | Item | Closure test |
|---|---|---|---|
| TL-01 | not-started | `search_groundx({scope, query, n?, verbosity?})` — content tool that performs a scoped GroundX search. | LLM asks tool; middleware routes; results appear inline in answer. |
| TL-02 | not-started | `show_understand({doc_id, progress})` — canvas dispatch tool. | LLM emits tool call; canvas advances to F2/Understand. |
| TL-03 | not-started | `show_extraction({schema_id, doc_id, category?, render?})` — canvas dispatch. | LLM emits; canvas advances to F3/Extract. |
| TL-04 | not-started | `show_field_citation({field_id, doc_id, page})` — open F4 expanded citation. | LLM emits; F4 citation peek opens. |
| TL-05 | not-started | `pin_to_report({turn_id, template_id?})` — pin literal turn text to report; auto-creates draft template if missing. Per `project_dev_contracts.md` decision #12. | Pin command from chat creates report row + template if needed. |
| TL-06 | not-started | `propose_schema_field({field_def})` — emit ProposalCard in F3a. | LLM proposes field; ProposalCard renders; user accepts → field added. |
| TL-07 | not-started | `propose_report_section({section_def})` — emit ProposalCard in S3a. | LLM proposes section; card renders; accept → section added. |
| TL-08 | not-started | Tool error recovery: 3 consecutive errors → fallback mode per `project_dev_contracts.md` error catalog. | Force 3 tool failures in a row; chat enters fallback (no more tool calls this session). |
| TL-09 | not-started | `AgentToolBusContext` Zod-to-JSON-Schema bridge. Provider exposes a "placeholder" Zod schema today; tool registration needs real JSON Schema per LLM provider tool-spec format. | Tool registered via AgentToolBus appears with correct JSON Schema parameters in the LLM tool array. |

# Epic: OBS — observability + telemetry

| ID | Status | Item | Closure test |
|---|---|---|---|
| OB-02a | not-started | PostHog events for surfaces that don't exist yet. **`session.mode_flipped_to_steady`** — fires when an authed user is bumped from onboarding into steady mode (UI-05 SteadyShell mount). **`report.pinned`** — fires when a chat turn is pinned to a report template (F7 / TL-05). **`report.section_added`** — fires when a section is added to a report (TL-07). **`report.rendered`** — fires when the report template renders an HTML/PDF artifact. Blocked on the underlying surfaces existing. | All 4 events fire at their boundaries with the documented prop shape; PostHog dashboard shows them on the golden path. |
| OB-04 | not-started | Hotjar session recording with PII suppression. `data-hj-suppress` tags on sensitive inputs. `HOTJAR_SITE_ID` env not implemented. | Hotjar dashboard shows session with email field redacted. |
| OB-05 | not-started | Sentry source-map upload on production builds. | Stack trace in Sentry shows TS file + line, not minified js. |
| OB-06 | not-started | AWS Managed Prometheus dashboards + AWS X-Ray traces. Middleware emits both; no dashboards configured. | Open the dashboard URL → see live request rate + p99 latency. |
| OB-07 | not-started | Alert rules: SLO violations, error-budget burn, ALB 5xx, unhealthy hosts. ALB-alarms workflow exists; SLO + budget alerts don't. | Synthetic burn fires a real Sentry/PagerDuty alert. |
| OB-09 | not-started | Migrate middleware `console.warn` calls in `chatRouter.ts` (hybrid-RAG-failed at L264, unknown-scope at L377) to pino structured logging. Both currently use `eslint-disable-next-line no-console` to bypass the lint rule. | Grep `console.warn` in `middleware/src/` outside tests returns no hits; the warns surface via `logger.warn({...}, "msg")` with the scrubber applied. |

# Epic: SEC — security

| ID | Status | Item | Closure test |
|---|---|---|---|
| SC-01 | not-started | (Foundation — see above) CSRF middleware. | |
| SC-02 | not-started | Consent UI + CSP allowlist builder. GA/Hotjar must NOT load until consent. Today CSP is built at boot statically. | Visit the app cold → see consent banner → no GA/Hotjar requests in network tab. After consent → GA/Hotjar load with their hosts in CSP `connect-src`. |
| SC-03 | not-started | `scrubPII()` expansion: confirm coverage of all 5 patterns (email, phone, SSN, credit-card Luhn, account numbers). `pii.ts` exists with 10 tests; need to verify completeness against `project_security.md` spec. | Test fixtures with each PII shape redact correctly in pino + PostHog scrubber. |
| SC-04 | not-started | PII redaction on pino logs — explicit `redact` paths for `password`, `authorization`, `cookie`, `documentContent`. Verify pino config. | Log line with these fields shows `[Redacted]`. |

# Epic: UR — UI runtime + primitives

| ID | Status | Item | Closure test |
|---|---|---|---|
| UR-01 | closed | **Re-closed 2026-05-25 against the real architecture.** Initially shipped a `PdfViewer` primitive (`app/src/shared/components/PdfViewer.tsx`) using pdfjs-dist that consumed a `scenario.documents[0].previewUrl` field from a hardcoded manifest. Per the architectural correction (`memory/feedback_no_onboarding_duplicates.md`): the right shape is a **production widget** (`app/src/components/widgets/PdfViewer/PdfViewerWidget.tsx`) that takes `documentId` + `mode`, calls `getGroundXDocumentXray(documentId)` via `DocumentsContext`, and renders the real per-page images from `xray.documentPages[].pageUrl`. `UnderstandView` is now a thin layout wrapper (~50 lines) that mounts the widget with `mode="onboarding"`. The pdfjs primitive stays in-tree for future steady-mode source-viewer needs that want text-selection. The mock `previewUrl` field on `ScenarioDocument` is dead code (kept for now; will be stripped with the manifest cleanup). Closed 2026-05-25. | 7 PdfViewerWidget tests pass (loading + first page image + LIVE PARSE label + thumbnails + getDocumentXray call + thumb-switch + error + data-mode); 3 UnderstandView tests pass (BYO branch + widget mount + real-data wiring). Full app sweep 657 tests pass; TS + lint clean. |
| UR-03 | closed | `MotionRoot` component (`app/src/shared/components/MotionRoot.tsx`) — wraps the App tree in a single `<MotionConfig reducedMotion="user">`. When `useReducedMotion()` reports the OS preference is set, supplies a global default `transition: { duration: 0.08, ease: "linear" }` so any motion site that doesn't override gets an 80 ms crossfade. When reduced is off, transition is undefined so per-site animations drive themselves. `reducedMotion="user"` makes framer-motion auto-disable transform/scale/rotate animations under reduced-motion; opacity continues to animate (= the crossfade). Mounted at the App root inside GxThemeProvider so the contract covers the entire tree. Per-site `useReducedMotion()` calls (AppShell drag, F2 scan-line, GateChatPanel) keep their own logic — MotionRoot is the floor, not the ceiling. Closed 2026-05-25. | 4 tests: renders children, sets reducedMotion="user", swaps to 80 ms crossfade when reduced, omits global transition when not reduced. Full app sweep 96 files / 614 tests pass; TS clean. |
| UR-04 | closed | **Verify-first hit — already built.** `StepStrip.tsx` already renders the ANALYZE dashed bracket with the three sub-pills (`SubPill` component at L146, bracket at L282-316). `OnboardingShell.analyzeSubsteps()` (L62) wires `{extract, interact, report}` with per-frame `active` / `reachable-todo` / `disabled` state. The closure test already exists at `StepStrip.test.tsx:37` ("renders all four primary slots + substep bracket when analyze is active") — asserts Ingest / Understand / ANALYZE / Integrate / Extract / Interact / Report all in the strip. Audit 2026-05-25 confirmed the row was mis-flagged not-started because of the verify-first ask. No code change. Closed 2026-05-25. | Existing `StepStrip.test.tsx:37` passes — assertions cover all three sub-pills inside the ANALYZE bracket. |
| UR-05 | not-started | Hotkey surface (cmd-K, Esc, etc.) via `react-hotkeys-hook`. Per `project_ui_runtime.md`. | cmd-K opens session switcher; Esc dismisses overlays. |

# Epic: SCEN — scenario completeness

| ID | Status | Item | Closure test |
|---|---|---|---|
| SCEN-01 | not-started | **Data-only — no code change.** The Utility manifest is loaded from the GroundX samples bucket at runtime via `/api/scenarios` → `ScenarioRegistry`. Today `middleware/scripts/scenarios/utility.json` ships ~14 ids (a small subset). Closing the gap is: extend `utility.json` with the full 20 statement + 8 meters + 56 charges fields per `project_scenario_fixtures.md`, then `npm --workspace middleware run seed -- utility`. `refreshManifestIfChanged()` rewrites the carrier doc's filter so the bucket is the new source of truth and the next `/api/scenarios` fetch hands the frontend the full 84-field schema. No frontend or middleware code edit. | After re-seed, `/api/scenarios` returns 84 fields for utility; F3 extract table renders all 84. |
| SCEN-02 | not-started | Loan 12-doc packet: 3 paystubs + W-2 + employment letter + 3 bank statements + 4 debt docs. Fixtures drafted; needs product sign-off + real docs ingested. | Pick Loan → 12 docs listed; cross-doc citations work. |
| SCEN-03 | not-started | Solar 142-doc portfolio tree: hierarchical Fund→Project, virtualized scroll >50 nodes. Today no tree UI. | Pick Solar → tree renders 142 nodes; scroll smooth; search filters. |
| SCEN-04 | not-started | Solar IC brief 4-section template: executive_summary, risk_roll_up, comparable_projects, recommendation. Per `project_scenario_fixtures.md`. | F7 generates IC brief from template; 4 sections present. |
| SCEN-06 | blocked | Sample document assets + page images. Per `project_phased_plan.md`: assets need to exist before Phase 2 UI work is real (today F2 uses a "flat-WHITE PDF placeholder"). Blocked on Product delivering the real Utility/Loan/Solar PDFs. | Real PDFs ingested into samples bucket; F2 PdfViewer (UR-01) renders pages from them. |
| SCEN-07 | not-started | **Seed script attaches `filter.workflow_id` to every uploaded doc.** Per `memory/project_workflow_id_filter.md` (locked 2026-05-25): every doc seeded into a GroundX bucket must carry `filter.workflow_id` when a workflow was used to extract it. Today `middleware/scripts/seed-bucket.ts` does not carry a workflow id; scenario specs in `middleware/scripts/scenarios/*.json` don't carry one either. Required: (a) add a `workflowId` field to each `scenarios/*.json` (Utility scenario value today: `9910308e-3100-473e-9da6-3ac29f5958a6`); (b) `ScenarioSpec` type adds the field; (c) on every doc ingest (initial `POST /v1/ingest/documents/remote`) and every filter refresh (`refreshManifestIfChanged()`), include `workflow_id` in the filter alongside `kind`, `scenarioId`, `manifest`, etc. (d) `refreshManifestIfChanged()` should also drift-check `workflow_id` and PUT an update when it changes. **Note:** the sample utility doc `c3bfff49-6640-4213-822b-e81c3a771e45` was manually updated 2026-05-25 with this workflow_id — the next un-guarded re-seed will preserve it only if the script also carries it. | A fresh re-seed of the Utility scenario produces a doc whose `filter.workflow_id` matches the scenario's authored workflowId; the filter diff-check picks up workflow_id changes alongside manifest changes. |

# Epic: SL — scale + perf

| ID | Status | Item | Closure test |
|---|---|---|---|
| SL-04 | not-started | Widget-search concurrency cap: ≤3 concurrent per session per `project_security.md`. | Fire 5 concurrent searches; 2 wait. |

# Epic: TS — testing gaps

| ID | Status | Item | Closure test |
|---|---|---|---|
| TS-02 | closed | 6 new test files (`BucketsProvider.test.tsx`, `ProjectsProvider.test.tsx`, `DocumentsProvider.test.tsx`, `GroupsProvider.test.tsx`, `HealthProvider.test.tsx`, `ApiKeysProvider.test.tsx`) — 18 tests total, 3 per provider. AuthContext already had `AuthProvider.test.tsx` (1 file × 7 tests) carried from earlier work, so all 7 contexts now have coverage. Each suite mocks `@/api`, wraps the provider in LoadingProvider + MessageBarProvider, and asserts three contracts: list/fetch populates state, create/ingest emits the contextual success message, and a thrown API error surfaces the contextual failure message (isSuccess=false, no partial state mutation). ApiKeys suite uses obviously-stub key values (`test-key-stub-*`) — no real key material. Closed 2026-05-25. | 18 new tests pass first run; full app sweep 651 tests pass; TS + lint clean. |
| TS-03 | closed | `ChatStoreContext.test.tsx` extended with a 4-test `persistence failure modes (TS-03)` block: (1) `QuotaExceededError` on setItem doesn't crash; in-memory state still mutates, (2) malformed JSON snapshot rehydrates as empty store, (3) wrong-version snapshot is treated as no snapshot, (4) cross-tab `StorageEvent` does NOT silently mutate this tab's state (locks the "no cross-tab sync yet, that's intentional" contract). Closed 2026-05-25. | 25 ChatStore tests pass; the 4 new ones lock the existing error-swallowing + rehydrate-guard behavior and the deliberate no-cross-tab-listener contract. |
| TS-04 | blocked | **Reclassified 2026-05-25.** Original framing assumed harness widget directories (`widgets/extraction-workbench/`, `widgets/chat-with-sources/`, `widgets/smart-report/`) are present in this repo. They are not — this is a greenfield project that built F3 ExtractView, F5 InteractView, and F7 IntegrateView natively without copying widgets. Either (a) the equivalent native surfaces get an integration-test layer (see TS-05 for the Playwright path; the unit tests already exist), OR (b) the widgets get imported per `references/widgets.md` and we test those copies. **Blocked on the decision**: do we want exact-use widgets in this project at all? Until then this row is not actionable. | Decision made on widget adoption; closure path follows. |
| TS-05 | not-started | **(P2; demoted 2026-05-25.)** Browser smoke + a11y suite: golden-path F1→F2→F3→F5→F6→F7 at desktop/mobile via Playwright + axe WCAG A/AA. Partial coverage today (`onboarding-utility.spec.ts` reaches F5, `onboarding-loan.spec.ts` reaches F5, `onboarding-compact.spec.ts` covers F2 mobile). **Blockers:** (a) **F4 surface doesn't exist** — UI-01 (SchemaView) is not-started, so the "full golden path" can't traverse F4. (b) **Solar scenario can't be tested** — only `utility.json` exists under `middleware/scripts/scenarios/`; SCEN-03 (Solar tree UI) and SCEN-06 (real PDFs) both not-started/blocked. (c) **F6 + F7 lack e2e** but the surfaces exist — that subset is the realistic do-now scope. **Re-promotion path:** when UI-01 lands AND a Solar fixture lands, the full closure is reachable; until then either accept scope = "F1→F2→F3→F5→F6→F7 on Utility+Loan, no Solar, skip F4" or wait. | All scenarios' golden paths pass at both viewports. |
| TS-06 | not-started | **(P2; demoted 2026-05-25.)** Nightly visual regression — non-blocking baseline. **Blocker — platform decision not made:** four real choices, each with cost / brittleness tradeoffs. (1) **Chromatic** (paid SaaS, ~$149/mo for 5k snapshots; Storybook-driven; account + token required), (2) **Playwright `toHaveScreenshot()`** (free; PNGs committed in-repo; brittle on font rendering across OSes), (3) **Percy / BrowserStack** (paid), (4) **Argos** (free tier, repo-stored). Also: PR-blocking or non-blocking baseline? Which surfaces baseline first? **Re-promotion path:** make the tool + storage decision, then this becomes mechanical wiring. Cheapest start would be Playwright snapshots — no account, no recurring cost. | First baseline runs; diff flagged on PR. |
| TS-07 | not-started | **(P2; demoted 2026-05-25.)** Load test against `/api/chat/messages`: ≥100 concurrent SSE per `project_test_plan.md`. **Blockers:** (a) **SSE doesn't exist** — `/api/chat/messages` is a regular JSON POST today. CF-11 (streaming response via SSE / fetch-stream) is not-started, so "100 concurrent SSE" is testing a feature that isn't built. (b) **Tool decision not made** — k6 (Grafana, JS scripting, modern) vs Artillery (YAML, mature) vs Autocannon (Node-native, simplest). (c) **Target environment** — local middleware + MOCK_MODE LLM (cheap, repeatable) vs staging (more realistic, hits real upstream costs). **Re-promotion path:** wait for CF-11 to land SSE OR rewrite the closure test to "≥100 concurrent JSON POST against the mocked LLM" — but the JSON path is the easy load shape; the SSE one is where real bottlenecks surface. | P95 < 5s under load with mocked LLM. |
| TS-08 | closed | `middleware/src/lib/pii.test.ts` extended with a 5-test DoS guard suite covering: (1) 50k repeated digits → credit-card regex, (2) alternating digit+separator runs, (3) long phone-shaped period-separated runs, (4) account-prefix + 100k digits, (5) deeply nested object with pathological string payloads. Closure budget: every shape scrubs in <50 ms. Confirmed the existing regexes don't catastrophically backtrack — `\b` anchors + non-greedy `[ -]*?` keep them linear. The test locks that property so a future regex tweak that re-introduces nested-quantifier ambiguity fails CI. Closed 2026-05-25. | 15 pii tests pass; all 5 pathological-shape elapsed times sub-50ms. |
| TS-09 | closed | `app/e2e/reduced-motion.spec.ts` — Playwright spec running with `test.use({ reducedMotion: "reduce" })` against the MOCK_MODE preview. Three sweeps: (1) AppShell `data-app-shell-reduced-motion="true"` after a scenario pick, (2) F2 scan-line `display: none` (the looping `repeat: Infinity` motion is actually gone), (3) F2 page transition completes within 1.5s under reduced-motion. Pairs with UR-03 — the `<MotionRoot>` is the seam these assertions exercise end-to-end. Closed 2026-05-25. | `npm run test:e2e -- reduced-motion` passes all 3 specs under Playwright's reducedMotion=reduce fixture. |
| TS-11 | closed | 5 new test files in `app/src/views/Auth/Form/` + `app/src/views/Auth/AuthLayout.test.tsx`. Each form has ≥3 tests covering validation (required-field errors), submit happy-path (onSubmit called with the typed values), and one error-display branch (yup .email() shape, code-must-be-6-digits, passwords-do-not-match, EULA-must-be-accepted). AuthLayout has 3 layout/`isTall` tests. Per-suite `vi.spyOn(console, "error").mockImplementation()` follows the existing `Login.test.tsx` pattern — Formik's blur/change triggers React `act(...)` warnings under user-event which would otherwise trip the global setup.ts spy. Closed 2026-05-25. | 15 new tests pass (3 per form × 4 forms + 3 for AuthLayout); full app sweep 101 files / 633 tests pass. |

# Epic: OPS — operations + infra

| ID | Status | Item | Closure test |
|---|---|---|---|
| OPS-01 | blocked | **Reclassified 2026-05-25 — out of this repo's scope.** Agent MCP-driven cluster/pod-log reading is a feature of the `groundx-studio` MCP server (i.e. the harness plugin), not this application. The deploy-audit ask was delivered upstream 2026-05-24 and the resolution lives with the harness team. This row should track the upstream conversation, not produce code here. Blocked on the harness team shipping the corresponding MCP tool surface. | Harness MCP server exposes a `cluster_logs` (or equivalent) tool that this project's agent can call. |
| OPS-04 | closed | `docs/agents/airgap-audit.md` lists all 13 production-runtime external hosts with their source location and seam status. **6 have proper env-var overrides** (GROUNDX_BASE_URL, LLM_BASE_URL, LLM_LIGHT_BASE_URL, SENTRY_DSN, VITE_POSTHOG_HOST, VITE_GA_MEASUREMENT_ID — the telemetry trio follows the no-op-when-unset pattern from CF-13/OB-02/OB-03). **4 are hardcoded gaps** flagged with recommended follow-ups: `docs.groundx.ai` → VITE_DOCS_URL, `calendly.com/groundx/30min` → VITE_CALENDLY_URL (pairs with UI-08), the two font `@import`s (Inter + Thicccboi) → self-host woff2, and the eyelevel.ai terms URL → VITE_TERMS_URL. CSP allowlist hardcodes are derived: once the underlying URLs flip env-driven, the CSP composer reads the same env. Closed 2026-05-25. | Audit doc exists with every external host categorized; ✅/⚠️/❌ seam status per row; 5 follow-up tickets recommended at the bottom for the gaps. |
| OPS-05 | closed | Installed `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `globals` at the workspace root. Authored `app/eslint.config.js` and `middleware/eslint.config.js` — flat config, `@eslint/js` recommended + `typescript-eslint` recommended, plus `react-hooks/rules-of-hooks` (error) and `react-hooks/exhaustive-deps` (warn) on the frontend, and `no-console` (warn, info allowed) on the middleware. Per-package `npm run lint` scripts added. **Net rule hits today**: app = 0 errors / 9 warnings; middleware = 0 errors / 3 warnings. Warnings flag real cleanup work (unused imports, unused eslint-disable directives, `console.warn` calls awaiting OB-09 migration, `let errorCode = null` pattern). Demoted rules with documented exceptions: `no-empty-object-type` (deliberate API option type naming in `api/common.ts`), `no-namespace` (Express type augmentation), `no-useless-assignment` (let+catch reassignment pattern). Verified rules surface real issues via a planted `definitely_unused` offender — fires `no-unused-vars` as expected. Closed 2026-05-25. | `npx eslint src` runs in both packages with 0 errors; planted offender fires the expected rule. |

# Epic: POL — known minor bugs

| ID | Status | Item | Closure test |
|---|---|---|---|

# Epic: PLUG — plugin system + skills + SDR

The entire plugin/skill mechanism described across
`project_plugin_model.md` + `project_harness_model.md` +
`project_architecture.md` + `project_implementation_contract.md`
is deferred. `OnboardingSkillContext` exists as an empty stub
preserving provider shape. No plugin discovery, no remote manifest
fetch, no SDR content. Locked decisions: skills live in remote
plugins, NOT in `middleware/src/skills/` folders. Until the loader
exists, treat SDR as deferred.

| ID | Status | Item | Closure test |
|---|---|---|---|
| **PLUG-07** | **deferred-late** | **Plugin tool-surface ADR — must land before PLUG-01.** Per locked decision 2026-05-25: deferred until the plugin track actually unblocks (currently no caller, PLUG-01..05 all blocked here intentionally). Pull forward when (a) a real first plugin gets scoped OR (b) someone wants to start PLUG-01. Decide + document, in writing, the four open contracts the plugin loader needs settled: (1) **Manifest shape** — required fields (name, version, semver range, capability flags), system-prompt fragment shape, tool list shape, UI extension slot taxonomy, tour metadata shape; (2) **Tool transport** — native LLM tool-use (OpenAI/Anthropic JSON-Schema function-calling) vs MCP-as-protocol vs custom JSON-RPC; (3) **Tool runtime** — in-process JS (sandboxed `vm` / `isolated-vm`?) vs MCP subprocess vs remote HTTP webhook; (4) **Discovery + trust** — where do plugins come from (remote registry URL, signed npm package, baked-in?), signature verification, and what they can/can't access (the BFF's session, the user's Partner API key, fetch). Recommendation in this turn's response: **native function-calling for the LLM tool surface + in-process JS for the tool runtime + remote registry with signed manifests for discovery**. MCP-as-protocol is a wrong-shape commitment when we control both ends. ADR file lands at `docs/agents/adr/0001-plugin-tool-surface.md` with each of the four contracts decided, rationale, and rejected alternatives. | An ADR document exists at the named path with each of the four contracts decided + signed off. The PLUG-01 row text is updated to point at the ADR. |
| PLUG-01 | blocked | Plugin loader (BFF side). Fetches plugin manifests from a remote source, validates schema, composes the agent's system-prompt + tool surface from active plugins. **Blocked on PLUG-07** (the manifest + transport + runtime contract has to be decided before the loader can be scoped). | A test plugin manifest loads and contributes a system-prompt fragment + a tool to the next agent call. |
| PLUG-02 | blocked | `OnboardingSkillContext` real implementation. Today an empty stub. Once PLUG-01 ships, consume plugin manifests, expose UI extension slots + system-prompt fragments + tour metadata. Blocked on PLUG-01 (which is blocked on PLUG-07). | A loaded plugin manifest's UI slot renders in the right surface; tour metadata reaches `useOnboardingSkill()`. |
| PLUG-03 | blocked | SDR plugin content (tour script, voice, copy nuance, sales-flavored CTAs). Authored OUTSIDE the BFF codebase per locked decision. Blocked on PLUG-01 (which is blocked on PLUG-07). | The SDR plugin (loaded remotely) renders the three-options gate framing, the tour stepper, and SDR-specific assistant voice. |
| PLUG-04 | blocked | Onboarding **overlay** surface (alternative to the inline F1-F7). Per `project_plugin_model.md`: "Onboarding overlay is deferred, but both surfaces will exist." Blocked on PLUG-01 + product spec for overlay UX. | Overlay onboarding renders on top of an existing product surface (not as a full-page replacement). |
| PLUG-05 | blocked | Tour state machine (third intent source: user / agent / tour). Per `project_chat_session_model.md`: "When SDR plugin loads, the tour writes intents to the active chat session via the same `dispatchIntent` path." Blocked on PLUG-01 (which is blocked on PLUG-07) — UI-10 + UI-10b (intent_log triple-write at memory + DB layers) both closed 2026-05-25; the dispatch path itself is fully wired. | Tour-loaded plugin advances frames via `dispatchIntent({source: "tour"})`; `intent_log.source = "tour"` written. |
| PLUG-06 | not-started | `PLUGIN_PRESET` env var. Per `project_harness_model.md`: "TBD; locked but not implemented." Controls which plugin bundle the LLM-side harness loads at boot. Distinct from `APP_MODE_PRESET` (app shell). | env.ts declares `PLUGIN_PRESET`; boot reads it; the loader (PLUG-01) honors the preset. |

## Cross-epic dependency notes

- **CF-15 → CF-02 closure → CF-03 / TL-01 quality.** Multi-bucket can't ship until EntitySession scope refs exist.
- **CF-16 → CF-04 quality + CF-06a.** A light LLM makes the structured classifier + suggested-prompt generators + eval grading loop cheap enough to use everywhere.
- **CF-06 → CF-06a.** The eval set scores the prompt, so the prompt has to exist first.
- **SCEN-06 → CF-06a + UR-01.** Real PDFs are required for the eval set's cite-against-real-text portion AND for UR-01's "renders real Utility/Loan/Solar pages" closure test.
- **DT-01 → DT-02.** Migrations infra before production MySQL.
- **TL-01–TL-07 → CF-12 closure.** Individual tool routes finish the umbrella.
- **OB-02 (PostHog events) → CF-13 (Sentry) ordering: PostHog first** (telemetry coverage > error coverage when neither exists).
- **UR-01 (PdfViewer) → UI-04 (F5 citation side panel).** Side panel needs the viewer.
- **PLUG-07 (tool-surface ADR) → PLUG-01..05.** Manifest + tool transport + runtime contract has to be decided before the loader can be scoped. CF-12 / TL-* are NOT blocked on PLUG-07 — in-app native function-calling works regardless of how plugins eventually publish tools.

## Counts as of 2026-05-25 (after UR-01 closure + priority pass)

| Status | Count |
|---|---|
| closed | 1 (UR-01) — historical closes were swept from the table; build status memory holds the long list |
| in-progress | 0 |
| blocked | 7 (AU-02, PLUG-01..05, SCEN-06) |
| not-started | live items in epic tables below |

By priority (revised 2026-05-25 after batch closures + TS-05/06/07 demotion):

| Pri | IDs | Notes |
|---|---|---|
| **P0** | UR-03 ✅, UR-04 ✅, TS-02 ✅, TS-03 ✅, TS-08 ✅, TS-09 ✅, TS-11 ✅ | All 7 P0 items closed 2026-05-25. |
| **P1** | OPS-01 (blocked, harness-side), OPS-04 ✅, OPS-05 ✅ | OPS-04 + OPS-05 closed. OPS-01 awaits harness MCP work. |
| **P2** | everything else not listed, **plus TS-05, TS-06, TS-07** (demoted 2026-05-25) | Defaults + the three demotions. |
| **P3** | CF-06a, PLUG-07 | Deferred-late; pull forward only when upstream caller exists. |

P0 / P1 standing as of 2026-05-25: **9 of 10 closed, 1 blocked
upstream**. The remaining tier-1 work is now in P2 (default product
backlog) or P3 (deferred).

Why TS-05 / TS-06 / TS-07 moved to P2:
- **TS-05** — Soft-blocked. F4 doesn't exist (UI-01 not-started);
  no Solar scenario fixture (SCEN-03/06). Only F6+F7 on
  Utility/Loan is reachable; that's a scope-down from the
  original closure intent.
- **TS-06** — Platform decision not made. Chromatic vs Playwright
  snapshots vs Argos each have different cost / brittleness
  tradeoffs. Better to decide once than half-ship.
- **TS-07** — Soft-blocked on CF-11 (SSE doesn't exist yet, so
  "100 concurrent SSE" isn't testable). Also needs a load-tool
  decision (k6 / Artillery / Autocannon).

Re-promotion conditions for the demoted P2s:
- **TS-05** — re-promote when UI-01 (SchemaView) lands AND a Solar
  scenario fixture lands. OR accept the scope-down and re-promote
  with reduced closure ("Utility + Loan, no F4, no Solar").
- **TS-06** — re-promote after the visual-reg tool decision is
  made.
- **TS-07** — re-promote when CF-11 (SSE streaming) lands. OR
  rewrite the closure test to "JSON POST load" and pick a tool.

Next-move candidates (P2 only now):
- **CF-10** — compression off the request hot path.
- **CF-11** — streaming response (SSE). Unblocks TS-07 re-promotion.
- **UI-01** — F4 SchemaView (biggest unstarted product surface).
  Unblocks TS-05 re-promotion.
- **AU-01** — magic-link provisioning endpoint.

Out-of-scope until pulled forward (P3):
- **CF-06a** — LLM eval set in CI. Burns credit; soft-blocked on SCEN-06.
- **PLUG-07** — Plugin tool-surface ADR. Blocked on a real first
  plugin being scoped.

## How to use this file

- Opening work: add a new id (use the right epic prefix), status
  `not-started`. Add an inline `TODO(<id>)` at the partial-code
  site if applicable.
- **Before adding a `not-started` item, grep for the seam first.**
  Audit-discovered correction 2026-05-25: UR-02 was incorrectly
  listed not-started despite `ResizeHandle.tsx` + `useResizableSplit.ts`
  + AppShell wiring already existing. Always run
  `grep -rn "<feature-name>" middleware/src app/src` before
  asserting something is unbuilt.
- Starting: flip to `in-progress`.
- Closing: write the user-visible test result; flip to `closed`;
  DELETE the inline `TODO(<id>)` from source.
- The `memory/project_build_status.md` "Still open" list points
  here. This file is the truth.

## Discovery checklist (run before each audit pass)

Past audits missed work because they relied on a single
`grep TODO`. Run all of these next time:

| Method | Command |
|---|---|
| Standard markers | `grep -rn "TODO\|FIXME\|HACK\|XXX" middleware/src app/src` |
| Broader vocabulary | `grep -rnE "\b(for now\|later we\|we'll\|punt\|deferred\|ideally\|stretch\|Phase [0-9]+ (wire\|land))" middleware/src app/src` |
| Test framework markers | `grep -rnE "\.skip\(\|\.todo\(\|xit\(\|xdescribe\(" middleware/src app/src app/e2e` |
| Type escape hatches | `grep -rnE "@ts-ignore\|@ts-expect-error\|as any\b\|as unknown as" middleware/src app/src` |
| Lint suppressions | `grep -rn "eslint-disable" middleware/src app/src` |
| Print-debug holdovers | `grep -rnE "console\.(log\|warn\|error)" middleware/src app/src` |
| Stub-style throws | `grep -rnE "throw new Error.*(not implemented\|TODO\|placeholder\|stub)"` |
| `@deprecated` markers | `grep -rn "@deprecated" middleware/src app/src` |
| Files without sibling tests | walk `find`, compare `.ts` to `.test.ts` |
| Git WIP / stash / unmerged | `git log --grep="wip\|WIP"`; `git stash list`; `git branch -a` |
| Memory drafts / TBD / sketch | `grep -rnE "DRAFT\|TBD\|to be (decided\|determined)\|sketch" memory/` |
| Env vars in code vs schema | compare `grep -oE "env\.[A-Z_]+"` against `env.ts` Zod fields |
| Phase X markers | `grep -rnE "Phase [0-9]+" middleware/src app/src` |
| ESLint warnings | `npx eslint src` (frontend); accumulated warnings hide deferred refactors |
| **Verify before "not-started"** | `grep -rn "<feature-name>"` to confirm no seam already exists |
