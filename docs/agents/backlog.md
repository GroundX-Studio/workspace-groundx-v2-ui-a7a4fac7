# Backlog

**The single source of truth for pending work across the project.**
Supersedes the prior `chat-fix-list.md` (chat items kept their `CF-N`
ids; many more epics added). `docs/agents/open-work.md` now points
here.

Ledger created 2026-05-25 after the working-session pattern of
"close the seam, leave the implementation as TODO" became a
project-wide problem (not just chat-stack). Every item has a stable
id. Inline `TODO(<id>)` markers in source reference an entry below.
When an item closes, the inline TODO gets DELETED.

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

---

# Foundations (must land first; unblocks above)

These are dependency roots. Pick from here when nothing in your
current epic is actionable.

| ID | Status | Item | Closure test |
|---|---|---|---|
| **DT-01** | not-started | Knex migrations directory + Helm pre-install job. Today `createSchema()` inlines `CREATE TABLE IF NOT EXISTS`. Productionizing: versioned `middleware/src/db/migrations/NNNN_*.sql` + Helm pre-install/upgrade Job that runs them. Memory: project_database.md "knex migrations deferred." | Schema change between two migrations rolls forward + back cleanly. |
| **DT-02** | not-started | MySQL primary in production. Schema + repo impls + claim endpoint exist. Provision RDS/self-hosted, set `APP_REPOSITORY_MODE=mysql` + creds, first deploy runs `createSchema()`. | Production deploy reads/writes against MySQL; in-memory repo unused. |
| **CF-15** | not-started | `EntitySession` scope refs (multi-bucket/multi-workspace/single-doc). Adds optional `bucketId? / projectIds?[] / groupId? / documentIds?[]` to `chat_session_entities`. Plus `ensureBucketGroup(bucketIds[]) → groupId` helper. Unblocks **CF-02 closure**. | Post a chat with entity having `projectIds:[P1, P2]` → search call body has `filter: {projectId: {$in:[P1,P2]}}`. |
| **CF-16** | not-started | Light LLM vs chat LLM split. New env block (`LLM_CHAT_*` + `LLM_LIGHT_*`), two `FetchLlmClient` instances, `deps.chatLlm` vs `deps.lightLlm`. Compressor uses light; RAG grounded call uses chat. Unblocks cheap classification + suggested-prompts. | Leaf summarization hits the light client; RAG hits the chat client (assert via spies). |
| **SC-01** | not-started | CSRF middleware. State-changing routes protected only by SameSite=lax cookie today. Token endpoint + middleware + axios interceptor. | Cross-site form POST to `/api/chat/messages` without token is rejected; same-origin POST with token works. |

# Epic: CHAT — LLM runtime + RAG + compression

The existing chat-fix-list (CF-01 through CF-18). Ids stable;
inline TODOs reference them.

| ID | Status | Item | Closure test |
|---|---|---|---|
| CF-01 | **closed** | Compression chain (leaf + meta-compaction). Telephone-game decay eliminated; meta-compaction folds oldest 5 at >10 active. | (in `conversationCompressor.test.ts`) |
| CF-02 | in-progress | ContentScope routing in `searchGroundX` — 5-case dispatch shipped. **Blocked on CF-15** for real-world behavior. | See CF-15 closure test. |
| CF-03 | not-started | Generic Mongo-style `filter` field on RAG scope. RBAC + org + arbitrary metadata filters compose via `$and`. RBAC filter added server-side (never trusted from client). | Posting from a session with a fake RBAC seam returns search bodies with `$and: [rbacFilter, scopeFilter]`. |
| CF-04 | in-progress | Live `structured` mode. 3 of 7 sub-handlers real (pages_remaining, onboarding_state, current_entity). 4 frank-reply (saved_schemas, my_projects, api_keys, unknown). | Real reader for saved_schemas / my_projects / api_keys; each has a test that posts a query + asserts the real data appears in the answer. |
| CF-05 | in-progress | Live `hybrid` mode. Framework done; quality depends on CF-04 + CF-06. | Hybrid query with real readers + iterated prompt returns a useful tour-style answer matching expected shape. |
| CF-06 | not-started | Grounded completion prompt iteration. Token-budget guard, structured citation field (JSON), "I don't know" calibration, eval set per scenario. | Eval set of ≥20 (query, expected-cite, expected-refusal) per scenario runs in CI; regression fails. |
| CF-07 | not-started | Viewer-intent inference with ≥0.85 confidence gate. LLM optionally emits `suggestedIntent: {intent, confidence, reason}`; client surfaces as chip ONLY at high confidence. Never auto-navigates. | High-confidence reply emits chip; low-confidence suppresses it. |
| CF-08 | not-started | Per-status client error mapping. 401→re-auth, 501→"can't yet" copy, 504→retry, 502/5xx→generic, 400→dev error. | Each status produces the right UX in F5. |
| CF-09 | not-started | Per-scenario MOCK_MODE fixtures. Utility/Loan/Solar each answer their own canonical questions distinctly. | Canned questions per scenario return the right scenario-specific mock answer. |
| CF-10 | not-started | Compression off the request hot path. Job queue + background worker + 202/poll OR "pending" flag on session. | Posting near threshold returns 200 promptly; compression completes async; next post sees new active summary. |
| CF-11 | not-started | Streaming response (SSE / fetch-stream). | E2e renders a long answer token-by-token. |
| CF-12 | not-started | Tool-call wiring in routeChat (see also TL-* below for the individual tool routes). | A query firing `show_extraction` produces the tool call in the reply. |
| CF-13 | not-started | Frontend Sentry browser SDK + claim-failure telemetry. | Unit test: `Sentry.captureException` called on the chatSend + claim failure paths. |
| CF-14 | not-started | DB pool sizing + batch reads. Pool=10 with 5–8 sequential reads per post. | Load test asserts P99 < 1s with 50 concurrent posts. |
| CF-17 | in-progress | Configurable compression tunables. `LLM_CONTEXT_WINDOW_TOKENS` env shipped. Pending: `COMPRESSION_TRIGGER_RATIO`, `COMPRESSION_TARGET_TOKENS`, `MAX_ACTIVE_SUMMARIES_BEFORE_META`, `META_COMPACTION_BATCH_SIZE`, `MAX_SUMMARY_OUTPUT_TOKENS`. | Setting each non-default affects the right behavior. |
| CF-18 | not-started | F2 chat input wire-up. `ChatInputStub` in `OnboardingChatColumn.tsx` is still a visual stub. Pattern from F5 drops in. ~30 min. | F2 e2e posts a message and renders assistant turn. |

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

# Epic: OBS — observability + telemetry

| ID | Status | Item | Closure test |
|---|---|---|---|
| OB-01 | not-started | Frontend Sentry browser SDK. Today middleware Sentry is wired; browser is not. `GateView.handleRegisterSubmit`'s claim catch is `console.error` only. (Same item as CF-13.) | `Sentry.captureException` fires on chat-send + claim failure. |
| OB-02 | not-started | PostHog 14 named events fired across F1–F7: `session.started`, `sample.picked`, `understand.started/completed`, `extract.field_hovered`, `cite.peeked`, `gate.shown`, `signup.completed`, `session.mode_flipped_to_steady`, `report.pinned`, `report.section_added`, `report.rendered`. Per `project_telemetry_logging.md`. Server PostHog hook exists; events don't fire. | Walking the golden path produces all 14 events with the expected shape. |
| OB-03 | not-started | GA4 custom dimensions: `sessionId`, `appMode`, `currentSample`, `llmProvider`. Measurement id env exists; dimension setup doesn't. | GA debugger shows the four dims on every event. |
| OB-04 | not-started | Hotjar session recording with PII suppression. `data-hj-suppress` tags on sensitive inputs. `HOTJAR_SITE_ID` env not implemented. | Hotjar dashboard shows session with email field redacted. |
| OB-05 | not-started | Sentry source-map upload on production builds. | Stack trace in Sentry shows TS file + line, not minified js. |
| OB-06 | not-started | AWS Managed Prometheus dashboards + AWS X-Ray traces. Middleware emits both; no dashboards configured. | Open the dashboard URL → see live request rate + p99 latency. |
| OB-07 | not-started | Alert rules: SLO violations, error-budget burn, ALB 5xx, unhealthy hosts. ALB-alarms workflow exists; SLO + budget alerts don't. | Synthetic burn fires a real Sentry/PagerDuty alert. |

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
| UR-01 | not-started | `PdfViewer` wrapper component using `pdfjs-dist` v4. Worker bundled same-origin. Today F2 UnderstandView has a "flat-WHITE PDF placeholder" per inline comment. | Sample document renders real PDF with pdfjs in F2. |
| UR-02 | not-started | Drag-to-resize chat/canvas divider — `useResizable` hook with snap zones (<200 → focus canvas, 280–640 live, >720 → focus chat), localStorage persistence, a11y arrow-key. Per `project_ui_runtime.md`. Today AppShell focus modes are click-toggled only. | Drag the divider; snap fires; reload preserves. |
| UR-03 | not-started | `<MotionConfig>` global with `prefers-reduced-motion` fallback (80ms crossfade). Today Framer Motion has no global config. | OS preference set → animations swap to 80ms crossfade. |
| UR-04 | not-started | StepStrip sub-bracket: Analyze pill contains Extract/Interact/Report sub-pills per `project_ui_runtime.md`. Verify against current StepStrip implementation. | StepStrip renders the sub-pill row under Analyze. |
| UR-05 | not-started | Hotkey surface (cmd-K, Esc, etc.) via `react-hotkeys-hook`. Per `project_ui_runtime.md`. | cmd-K opens session switcher; Esc dismisses overlays. |

# Epic: SCEN — scenario completeness

| ID | Status | Item | Closure test |
|---|---|---|---|
| SCEN-01 | not-started | Utility scenario full schema: 20 statement + 8 meters + 56 charges fields per `project_scenario_fixtures.md`. Today's manifest has a subset. | Pick Utility → see all 84 fields in F3 extract table. |
| SCEN-02 | not-started | Loan 12-doc packet: 3 paystubs + W-2 + employment letter + 3 bank statements + 4 debt docs. Fixtures drafted; needs product sign-off + real docs ingested. | Pick Loan → 12 docs listed; cross-doc citations work. |
| SCEN-03 | not-started | Solar 142-doc portfolio tree: hierarchical Fund→Project, virtualized scroll >50 nodes. Today no tree UI. | Pick Solar → tree renders 142 nodes; scroll smooth; search filters. |
| SCEN-04 | not-started | Solar IC brief 4-section template: executive_summary, risk_roll_up, comparable_projects, recommendation. Per `project_scenario_fixtures.md`. | F7 generates IC brief from template; 4 sections present. |
| SCEN-05 | not-started | (Same as CF-09) Per-scenario MOCK_MODE response fixtures. | Canned questions per scenario distinct. |

# Epic: SL — scale + perf

| ID | Status | Item | Closure test |
|---|---|---|---|
| SL-01 | not-started | (Same as CF-10) Compression off request hot path. | |
| SL-02 | not-started | (Same as CF-11) Streaming chat response (SSE). | |
| SL-03 | not-started | (Same as CF-14) DB pool sizing + batch reads. | |
| SL-04 | not-started | Widget-search concurrency cap: ≤3 concurrent per session per `project_security.md`. | Fire 5 concurrent searches; 2 wait. |

# Epic: TS — testing gaps

| ID | Status | Item | Closure test |
|---|---|---|---|
| TS-01 | not-started | (Same as AU-04) AuthProvider race tests. | |
| TS-02 | not-started | Context coverage: `AuthContext`, `BucketsContext`, `ProjectsContext`, `DocumentsContext`, `GroupsContext`, `HealthContext`, `ApiKeysContext` — scaffold-shipped, 0 onboarding-flow tests. | Each context has ≥3 tests for its real surface. |
| TS-03 | not-started | ChatStore persistence failure modes: `QuotaExceededError`, malformed snapshot rehydrate, cross-tab `storage` event. | Tests cover all three. |
| TS-04 | not-started | Widget integration tests for `extraction-workbench`, `chat-with-sources`, `smart-report` inside the scaffold stack. Per `project_test_plan.md` Layer 9. | Each widget mounted in a real scaffold-stack test passes its acceptance suite. |
| TS-05 | not-started | Browser smoke + a11y suite: golden-path F1→F2→F3→F5→F6→F7 at desktop/mobile via Playwright + axe WCAG A/AA. Partial coverage today; not all 9 frames per scenario. | All scenarios' golden paths pass at both viewports. |
| TS-06 | not-started | Nightly visual regression (Chromatic) — non-blocking baseline. | First baseline runs; diff flagged on PR. |
| TS-07 | not-started | Load test against `/api/chat/messages`: ≥100 concurrent SSE per `project_test_plan.md`. | P95 < 5s under load with mocked LLM. |
| TS-08 | not-started | PII regex DoS guard: pathological input (50k repeated digits) doesn't trigger catastrophic backtracking. | Adversarial input completes in <100ms. |
| TS-09 | not-started | Reduced-motion sweeps in CI. | Visual test with `prefers-reduced-motion: reduce` passes. |
| TS-10 | not-started | Tool 3-strike fallback test (per `project_dev_contracts.md`). | (Same as TL-08.) |

# Epic: OPS — operations + infra

| ID | Status | Item | Closure test |
|---|---|---|---|
| OPS-01 | not-started | Agent MCP-driven CI / cluster / pod-log reading. Today every deploy debug requires user paste. Deploy-audit ask delivered 2026-05-24; still open. | Agent can read GH Actions logs + cluster pod state via MCP tool. |
| OPS-02 | not-started | (Same as DT-01) Knex migrations infra. | |
| OPS-03 | not-started | (Same as OB-05) Sentry source-map upload on prod builds. | |

# Epic: POL — known minor bugs

| ID | Status | Item | Closure test |
|---|---|---|---|
| POL-01 | not-started | OnboardingNav chevron uses `«` / `»` Unicode. Replace with MUI chevron icon. | Visual: nav chevron is an MUI icon. |
| POL-02 | not-started | SteadyShell "unknown session" hint uses an inline `<code>` element without MUI wrapper. Replace with proper MUI Typography. | Visual: matches design tokens. |
| POL-03 | not-started | Pick-a-view pill labels use `category.name.toLowerCase()` — awkward for multi-word categories. | Labels render correctly for known scenarios; sentence-case if needed. |

---

## Cross-epic dependency notes

- **CF-15 → CF-02 closure → CF-03 / TL-01 quality.** Multi-bucket can't ship until EntitySession scope refs exist.
- **CF-16 → CF-04 quality + CF-06.** A light LLM makes the structured classifier + suggested-prompt generators cheap enough to use everywhere.
- **DT-01 → DT-02.** Migrations infra before production MySQL.
- **TL-01–TL-07 → CF-12 closure.** Individual tool routes finish the umbrella.
- **OB-02 (PostHog events) → CF-13 (Sentry) ordering: PostHog first** (telemetry coverage > error coverage when neither exists).
- **UR-01 (PdfViewer) → UI-04 (F5 citation side panel).** Side panel needs the viewer.

## Counts as of 2026-05-25

| Status | Count |
|---|---|
| closed | 1 (CF-01) |
| in-progress | 4 (CF-02, CF-04, CF-05, CF-17) |
| blocked | 1 (AU-02) |
| not-started | 67 |
| **total** | **73** |

Over the 3-per-epic WIP cap on CHAT (currently 4 in-progress). Next
move closes one of those to genuine done OR moves one back to
not-started before opening anything new under CHAT.

## How to use this file

- Opening work: add a new id (use the right epic prefix), status
  `not-started`. Add an inline `TODO(<id>)` at the partial-code
  site if applicable.
- Starting: flip to `in-progress`.
- Closing: write the user-visible test result; flip to `closed`;
  DELETE the inline `TODO(<id>)` from source.
- The `memory/project_build_status.md` "still open" list and
  `docs/agents/open-work.md` chat section both point here. This
  file is the truth.
