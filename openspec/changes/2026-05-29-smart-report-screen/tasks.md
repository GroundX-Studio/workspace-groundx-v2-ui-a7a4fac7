# Tasks — Smart Report screen (S3 render + S3a builder)

> v1 target = **Utility single-document** report, built scope-general (`ContentScope`) so Solar
> multi-doc works on the same surface. WIP cap = 3 per epic. Live **multi-doc** render depends on
> **WF-10** (blocked on source assets); every task below is fixture-backed and does NOT block on
> WF-10 except the explicitly-marked live step.

> **Execution mode: → predominantly SEQUENTIAL/TDD.** This is a single-screen build with hard phase
> ordering (each phase depends on the prior), so it runs by hand, failing-test-first, phase by phase —
> NOT as a fan-out workflow. Three caveats:
> - **Phase 2's Template + ContentScope foundation is OWNED by `core-data-model-hardening`** (its
>   "Shared Template lifecycle" + "ContentScope + composable filter" sections). Land it *there* once;
>   this phase consumes it. Do not fork the factoring here.
> - The **4-viewer-widgets-on-`ScopedViewerWidget`** application is the core change's ◑ MIXED item —
>   `SmartReportRender`/`SmartReportBuilder` (Phases 3–4) are 2 of those 4 and become ⟲ WORKFLOW-OK
>   fan-out once the base lands.
> - **Closeout live-verify is ⟲ WORKFLOW-OK** as a parallel multi-path check (pill→render→CiteChip→
>   edit→builder→pin, plus Interact→Report scope) once the screen is built — and the prereq applies:
>   fix the middleware parallel-test flake first.

## Phase 0 · Failing user-visible test first (Rule 9)

- [x] **Failing test:** with the **Utility** scenario, clicking the **Report** step-strip pill advances
  the canvas to `f4` and renders the single-doc IC-brief render surface (fixture sections + `CiteChip`s).
  Today the pill is disabled and `f4` shows the extract workbench. Red before any impl. — DONE: `OnboardingShell.test.tsx` "Phase 0: Utility → clicking the Report pill advances to f4 and renders the report surface" (red first, now green).

## Phase 1 · Frame + nav wiring + transitions

- [x] Add `"f4a"` to `FFrame`; route shell `f4 → report-render`, `f4a → report-builder` (stop `f4` rendering the extract workbench). — DONE: `FFrame` gains `f4a` (`types/onboarding.ts`); `OnboardingShell` `report` step-kind → `ReportRenderView` (f4) / `ReportBuilderView` (f4a, placeholder); `frameToStepStandalone` (OnboardingSessionContext) + `stepKindFallback` route f4/f4a → `report` (was the `extract-workbench` mis-route).
- [x] Remove `reportActive = false`; make the Report pill reachable for **all** scenarios (not chapter-gated, not auth-gated). MODIFY the durable "Report locked" step-strip scenario (anon previews). — DONE: `analyzeSubsteps` now marks Report `reachable-todo`/`active` (never `disabled`); `handleSubstepClick` routes Report → f4 (was mis-routed to f7).
- [x] `f4 → f4a` (edit affordance) + `f4a → f4` (back, builder-only). — DONE: `SmartReportRender` `✎ edit §N` → `onEditSection` → `ReportRenderView` `advanceFrame("f4a")`; `ReportBuilderView` `← back` → `advanceFrame("f4")`.
- [x] **Transitions:** Extract→Report and Interact→Report set the report scope to the source surface's `ContentScope` (no re-pick). — DONE: `ReportRenderView` derives the render scope from the active scenario (`{ bucket, filter:{ project:<scenarioId> } }`) — the same opening scope Extract/Interact use, so the user never re-picks. Pinned by the "Extract → Report carries the source ContentScope" test.
- [x] **ScopedViewerWidget contract — CONSUME from `core-data-model-hardening`** ... `SmartReportRender`/`SmartReportBuilder` build on the landed base (take a `scope` prop, adapt on scope change, register their `show_*` tool). — DONE (render half, scope-prop + adapter): `SmartReportRender` takes a REQUIRED `scope: ContentScope` + consumes `useScopeAdapter` (load-bearing — proven by the flip-scope re-resolution test). The widget's `show_smart_report_render` **descriptor is DEFERRED to Phase 5** (step 17): registering a no-op `defineScopedViewerWidget` descriptor here would be a dormant tool with no caller + an un-allowlisted `show_` verb (forbidden by `feedback_no_shortcuts`). It is authored with its real dispatch + the `show_` allowlist + the `SERVER_TOOL_CATALOG` mirror in Phase 5; the widget opts out via `no-llm.md` until then. No `scoped-viewer-contract.test.ts` re-added.
- [x] Tests: pill reachable on every scenario incl. anon; f4/f4a route correctly; transition carries scope. — DONE: 5 Phase-1 tests in `OnboardingShell.test.tsx` (pill reachable anon, anon preview locked, Loan reachable + empty-state, f4↔f4a round-trip, Extract→Report scope carry).

## Phase 2 · Factor the shared Template lifecycle, then the report data model

- [ ] **Factor a shared `Template` lifecycle layer** → **SPLIT OUT to its own change
  `2026-05-29-shared-template-lifecycle`** (2026-05-29; it grew past the WIP cap and is shared with
  `core-data-model-hardening`). That change factored `ExtractionSchemaDef` + `extraction_schemas` +
  `saveExtractionSchema` into a shared `Template` (`templates` table, **no `version`**, wire shape in
  `@groundx/shared`) + the `saveTemplate`/`getTemplate`/`listTemplates` repo API + the `parseTemplate`
  read sanitizer, and migrated Extract onto it with no behavior change. **This phase CONSUMES it**:
  the `report`-kind Template arm + the report data model below build on the landed shared lifecycle —
  do NOT re-factor it. **EXCEPTION:** the editing-**overlay** generalization (`PendingSchemaOverlay`→
  `PendingTemplateOverlay`, `SchemaField*`→`TemplateItem*`) was deliberately deferred OUT of that
  change to **Phase 4 below** (it touches live Extract editing code and the report *builder* is its
  real driver). Blocks on the lifecycle change's closeout.
- [x] Report template = the shared `Template` instantiated with section-questions; report results =
  the shared "generated result" shape (parallel to `ExtractedFieldValue`). — DONE (results shape): `app/src/types/report.ts` — `RenderedReport.sections[].result` IS the shared `RenderedSection` (`GeneratedResult` specialization), consumed by the render surface. The `ReportTemplate`/`ReportSection` template shapes + the `reportTemplateToSaveInput` → shared `report`-kind `TemplateSaveInput` save bridge are **DEFERRED to Phase 6** (their real caller is the render + Save endpoints); they are NOT shipped here as test-only exports with no production consumer (per the locked "no code with no caller" rule).
- [x] **CONSUME the landed `ContentScope.filter`** — ... Do NOT re-extend `ContentScope`; just consume it. — DONE: `report.ts` imports `ContentScope` from `@groundx/shared` and consumes its composable `filter`; no re-extension. Utility scope is `{ bucket, filter:{ project:"utility" } }`.
- [ ] Scope helper resolves any `ContentScope` shape → doc set. — **DEFERRED to Phase 6** (the render endpoint is its real caller). The `resolveScopeDocSet(scope, index)` + `ScopeDocIndex` resolver was previously landed in Phase 2 but had ZERO production consumers (`getReportFixture` matches the scope directly), so it was a test-only export — removed per the locked "no code with no caller" rule and re-added in Phase 6 with the render endpoint that consumes it.
- [ ] ChatStore: report template/section state + `pinToReport` → **existing-or-new template UX** (NO auto-create) via the shared create/edit-template methods. — **DEFERRED to Phase 5** (the pin affordance / `pin_to_report` tool is its only real caller). The `resolvePinTarget` PURE resolver (`prompt-new-only` | `single-existing` | `prompt-existing-or-new`; NEVER auto-create) was previously landed in Phase 2 but had no production caller, so it was test-only plumbing — removed per "name the 2nd real caller before abstracting / no code with no caller" and re-added in Phase 5 alongside the stateful ChatStore action + affordance that call it.
- [x] MOCK_MODE **Utility** report fixture — scope `bucket + project filter` (resolves to the bill), sections (billing summary ¶, charge breakdown ▦, anomalies •, recommendation ¶) + cited bodies. Stub a Solar multi-doc fixture. — DONE: `app/src/widgets/reportFixtures.ts` (`getReportFixture` keyed by scope) — Utility 4-section IC brief (¶/▦/•/¶, each cited into the bill) + Solar `group`-scope stub. (The `UTILITY_REPORT_DOC_INDEX` doc-org index was removed with the deferred `resolveScopeDocSet` — `getReportFixture` matches the scope directly, so the index had no production consumer; it returns in Phase 6 with the resolver.)
- [x] Tests: Utility uses bucket+project-filter (not document-id list); the four sections + renderAs mix; each section cited into the bill; group scope returns the stub; unknown scope → null. — DONE: `reportFixtures.test.ts` (5 tests). (The pin / scope-resolver tests moved with their deferred code to Phases 5/6 — they tested removed test-only exports, so they are NOT shipped here.)

## Phase 3 · Render surface (f4 / S3) — reuse Extract/CiteChip

- [x] `SmartReportRender` viewer-widget (README + sibling test + `role: WidgetRole` + required `scope: WidgetScope` (a real `ContentScope` here), tokens only) — ordered sections, `renderAs` formatters (¶/•/▦), streaming order. Per `widget-role-access`, use `role` (not `mode`). — DONE: `components/viewer-widgets/SmartReportRender/` — single default export named for the dir, required `role`+`scope`, README (all required headers incl. Events), sibling `*.test.tsx` (both roles), design tokens only (no-hardcoded-styles green); sections rendered via the shared `Markdown` primitive with ¶/•/▦ glyphs. (LLM-tool fork = `no-llm.md` for now; the `show_smart_report_render` descriptor is NOT registered yet — a no-op `defineScopedViewerWidget` descriptor with an un-allowlisted `show_` verb would be dormant plumbing. The descriptor + full tool surface + `show_` allowlist land in Phase 5/step 17, consistent with line 33.)
- [x] Citations: `CiteChip` + WF-06b tiers; chip click → `highlightCitation` → `PdfViewerWidget` lit-region (reuse the shipped path). — DONE: `SmartReportRender` renders the shared `CiteChip` per section footer (global 1-based index); chip default-dispatches `highlightCitation` (the shipped path); fixture citations carry `tier` (exact/paraphrase/ambient).
- [x] `✎ edit §N` per heading → `f4a` with the section pre-selected; `preview_only` badge; export/Save locked-for-anon. — DONE: per-heading `✎ edit §N` → `onEditSection` → `ReportRenderView` advances to f4a; `preview_only` badge + export/Save lock-for-anon (`widgetRoleCanEdit`). NOTE: section *pre-selection* in the builder is Phase 4 (the builder is a placeholder route here); the edit affordance + routing are live.
- [x] `ReportRenderView` wrapper; widget-contract test passes. — DONE: `views/Onboarding/ReportRenderView.tsx` (thin layout wrapper, resolves scope + role, mounts `SmartReportRender`); widget-contract + widget-access-matrix + no-hardcoded-styles guards green.

## Phase 4 · Builder surface (f4a / S3a) — mirror the schema editor

- [x] **Generalize the editing overlay HERE (moved from `shared-template-lifecycle` Phase 4, 2026-05-29).** The report builder is the real second consumer, so this is where `PendingSchemaOverlay`→`PendingTemplateOverlay` + `SchemaField*`→`TemplateItem*` + generic ChatStore actions get generalized — driven by the builder's actual requirements, not speculatively. (The shared `Template` types + persistence + route + read API already landed in that change; only the editing-overlay generalization was deferred to here.) — DONE: `PendingSchemaOverlay` factored into the GENERIC shell `PendingTemplateOverlay<TItem, TEdit, TProposal>` (`contexts/ChatStoreContext/types.ts`); `PendingSchemaOverlay` is now a NON-BREAKING type-alias instance (`PendingTemplateOverlay<SchemaFieldAddition, SchemaFieldEdit, SchemaFieldProposal>`) — member names preserved so live Extract (SchemaView/ExtractView) reads it unchanged. The report arm = `PendingReportOverlay` = the shell of `ReportSection{Item,Edit,Proposal}` (the `TemplateItem*` rename, scoped to the section item the builder actually needs — name+renderAs+question+instructions+manual variables, NO per-section scope). New `reportOverlay` ChatSession slot + `addReportSection`/`editReportSection`/`removeReportSection` actions (the `report`-kind siblings of `addSchemaField`/…). SAFETY GUARD HELD: Extract/schema-editor tests (`SchemaView.test.tsx`, `ChatStoreContext.test.tsx`) stay green + tsc clean — proves the rename is non-breaking. Tests: `contexts/ChatStoreContext/reportOverlay.test.tsx` (5 — empty default, add, edit shallow-merge, remove, manual `make variable` #12).
- [x] `SmartReportBuilder` viewer-widget reusing the F3a chrome (pinned-samples row, `Sections`/`Render` sub-tabs, row list w/ inline editor, proposal cards, `⋮` menu, `export ▾ 🔒 · ↻ render · 💾 Save 🔒`). — DONE: `components/viewer-widgets/SmartReportBuilder/` — single default export named for the dir, required `role`+`scope`, README (all required headers incl. Events + No-LLM), sibling `SmartReportBuilder.test.tsx` (both roles), design tokens only (no-hardcoded-styles green); pinned-samples row + Sections/Render sub-tabs + section row list with the inline editor + `⋮` row menu (Remove) + the `export ▾ 🔒 · ↻ render · 💾 Save 🔒` control row. (LLM-tool fork = `no-llm.md`; the `show_smart_report_edit` descriptor + per-control tools land in Phase 5/step 17 — a no-op `defineScopedViewerWidget` descriptor with an un-allowlisted `show_` verb would be dormant plumbing, mirroring `SmartReportRender`.)
- [x] Inline section editor: name + `renderAs` + question + instructions (**no per-section scope** — the template is scope-independent; render scope is supplied at render time); manual "make variable" only (#12); no version-history UI (#13). — DONE: the `SectionRow` inline editor exposes exactly name + renderAs (¶/•/▦ Select) + question + instructions (one rule/line); the test asserts NO `/scope/i` field is present. Manual `make variable` affordance records a literal variable (#12, no auto-inference); no version-history surface anywhere (#13).
- [x] Save sign-in-gated via `commitGate`. — DONE: an `anonymous` Save (`widgetRoleCanEdit(role) === false`) calls `openGate("save")` (the `commitGate` entry) rather than persisting — the gate flips `idle → open` (pinned by the anon-Save test via a gate-status probe); a `member`'s Save is unlocked (no `🔒`). The member persist endpoint is Phase 6.
- [x] `ReportBuilderView` wrapper; widget-contract test passes. — DONE: `views/Onboarding/ReportBuilderView.tsx` fleshed out from the Phase-1 placeholder into the thin layout wrapper that resolves scope (`bucket + project filter`) + auth role and mounts the production `SmartReportBuilder` (keeps the `← back` f4a→f4 affordance). Tests: `ReportBuilderView.test.tsx` (mounts the real widget + section rows, NOT the placeholder; role derives from auth state). widget-contract + widget-access-matrix + no-hardcoded-styles guards green; the Phase-1 OnboardingShell f4↔f4a test retargeted from the retired `report-builder-view` placeholder testid to the production `smart-report-builder`.

## Phase 5 · Chat ⇄ viewer: pin affordance + tools (every control driven from chat)

- [ ] **Allowlist `show_`** in `check-tool-quality`'s `ALLOWED_VERBS` (the canvas-dispatch verb for all ScopedViewerWidgets); any other genuinely new verb added too, never bypassed.
- [ ] `📌 pin to report` chat-widget on every assistant turn (disabled mid-stream; queues if clicked). RE-ADD the deferred `resolvePinTarget` PURE resolver (`PinResolution`/`PinSectionInput`) HERE — this affordance + the `pin_to_report` tool are its real callers — failing-test-first against the stateful ChatStore action they drive.
- [ ] `*.tools.ts` for every control, **mirrored on middleware `SERVER_TOOL_CATALOG`** (drift guard green): `show_smart_report_render`/`show_smart_report_edit`, `pin_to_report`, `propose_report_section`, and the section-mutation tools — the **same shared family as Extract's field-mutation tools** (allowlisted verbs `propose_`/`accept_`/`reject_`/`edit_`/`delete_`/`run_`). Interim: each calls the same ChatStore action as its UI control (AgentToolBus bridge pending).
- [ ] Report render + section focus emit `ViewerEvent`s into the chat three-axis context.
- [ ] Tests: each tool performs the same mutation as its UI control; pin lands a section; proposal-card accept lands a section.

## Phase 6 · Render endpoint

- [ ] `POST /api/widgets/smart-report/reports/render` (scope = `ContentScope`) — MOCK_MODE returns the Utility fixture; section-subset re-render; `preview_only` for sample; BYO scope → gate envelope (#10). RE-ADD the deferred `resolveScopeDocSet` + `ScopeDocIndex` resolver (+ `UTILITY_REPORT_DOC_INDEX`) HERE — the render endpoint is its real caller (scope→doc set) — and the `reportTemplateToSaveInput` + `ReportTemplate`/`ReportSection` save bridge with the Save endpoint, failing-test-first.
- [ ] Edge cases: unresolved variable → `{var}` + "bind it"; no source → `—` + low-confidence; question edit → scoped single-section re-render.
- [ ] Middleware tests for each state + edge case + a multi-doc `ContentScope`.

## Phase 7 · Live multi-doc render (DEPENDS ON WF-10)

- [ ] Fan each section's `question` through `search_groundx` (scoped by the section's `ContentScope`) + grounded generation + WF-06b verification against real docs.
- [ ] Solar multi-doc/multi-project/multi-workspace render on the same surface; keep fixtures as the MOCK_MODE path.

## Closeout

- [ ] `OPENSPEC_TELEMETRY=0 npx @fission-ai/openspec@1.3.1 validate --all --strict --json` passes.
- [ ] `scaffold/app` + `scaffold/middleware` vitest green; widget-contract + no-hardcoded-styles drift guards pass.
- [ ] Live-verify (Chrome DevTools MCP): Utility → Report pill → render → CiteChip jumps viewer → edit §N → builder → pin from chat; Interact→Report carries scope.
- [ ] Update memory to point at this capability as the report home: `project_build_status.md`, `project_dev_contracts.md` (W8 surface owned by `smart-report`), `project_phased_plan.md` (Phase 5), `project_spec_frames.md` (f4/f4a + Utility report live). Delete any `TODO(report)` seam.
- [ ] Archive: `npx @fission-ai/openspec@1.3.1 archive 2026-05-29-smart-report-screen --yes`.
