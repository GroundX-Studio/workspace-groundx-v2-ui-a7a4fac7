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

- [ ] **Failing test:** with the **Utility** scenario, clicking the **Report** step-strip pill advances
  the canvas to `f4` and renders the single-doc IC-brief render surface (fixture sections + `CiteChip`s).
  Today the pill is disabled and `f4` shows the extract workbench. Red before any impl.

## Phase 1 · Frame + nav wiring + transitions

- [ ] Add `"f4a"` to `FFrame`; route shell `f4 → report-render`, `f4a → report-builder` (stop `f4` rendering the extract workbench).
- [ ] Remove `reportActive = false`; make the Report pill reachable for **all** scenarios (not chapter-gated, not auth-gated). MODIFY the durable "Report locked" step-strip scenario (anon previews).
- [ ] `f4 → f4a` (edit affordance) + `f4a → f4` (back, builder-only).
- [ ] **Transitions:** Extract→Report and Interact→Report set the report scope to the source surface's `ContentScope` (no re-pick).
- [ ] **ScopedViewerWidget contract — CONSUME from `core-data-model-hardening`** (it owns the `ScopedViewerWidget` base class/object + registry + its contract test). Do NOT re-add a `scoped-viewer-contract.test.ts` here; `SmartReportRender`/`SmartReportBuilder` build on the landed base (take a `scope` prop, adapt on scope change, register their `show_*` tool). Dependency: blocks on that base landing.
- [ ] Tests: pill reachable on every scenario incl. anon; f4/f4a route correctly; transition carries scope.

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
- [ ] Report template = the shared `Template` instantiated with section-questions; report results =
  the shared "generated result" shape (parallel to `ExtractedFieldValue`).
- [ ] **CONSUME the landed `ContentScope.filter`** — the composable `filter` on every shape (`bucket(+filter)` · `documents[](+filter)` · `group(+filter)`) + `compileScopeFilter` already shipped in `@groundx/shared` (`shared/src/index.ts`). Do NOT re-extend `ContentScope`; just consume it. `filter` is the same Extract/`search_groundx` filter-field mechanism. No mandatory filter, no forbidden shape.
- [ ] Scope helper resolves any `ContentScope` shape → doc set.
- [ ] ChatStore: report template/section state + `pinToReport` → **existing-or-new template UX** (NO auto-create) via the shared create/edit-template methods.
- [ ] MOCK_MODE **Utility** report fixture — scope `bucket + project filter` (resolves to the bill), sections (billing summary ¶, charge breakdown ▦, anomalies •, recommendation ¶) + cited bodies. Stub a Solar multi-doc fixture.
- [ ] Tests: pin prompts existing/new (no auto); every `ContentScope` shape resolves; Utility uses bucket+project-filter (not document-id list).

## Phase 3 · Render surface (f4 / S3) — reuse Extract/CiteChip

- [ ] `SmartReportRender` viewer-widget (README + sibling test + `role: WidgetRole` + required `scope: WidgetScope` (a real `ContentScope` here), tokens only) — ordered sections, `renderAs` formatters (¶/•/▦), streaming order. Per `widget-role-access`, use `role` (not `mode`).
- [ ] Citations: `CiteChip` + WF-06b tiers; chip click → `highlightCitation` → `PdfViewerWidget` lit-region (reuse the shipped path).
- [ ] `✎ edit §N` per heading → `f4a` with the section pre-selected; `preview_only` badge; export/Save locked-for-anon.
- [ ] `ReportRenderView` wrapper; widget-contract test passes.

## Phase 4 · Builder surface (f4a / S3a) — mirror the schema editor

- [ ] **Generalize the editing overlay HERE (moved from `shared-template-lifecycle` Phase 4, 2026-05-29).** The report builder is the real second consumer, so this is where `PendingSchemaOverlay`→`PendingTemplateOverlay` + `SchemaField*`→`TemplateItem*` + generic ChatStore actions get generalized — driven by the builder's actual requirements, not speculatively. (The shared `Template` types + persistence + route + read API already landed in that change; only the editing-overlay generalization was deferred to here.)
- [ ] `SmartReportBuilder` viewer-widget reusing the F3a chrome (pinned-samples row, `Sections`/`Render` sub-tabs, row list w/ inline editor, proposal cards, `⋮` menu, `export ▾ 🔒 · ↻ render · 💾 Save 🔒`).
- [ ] Inline section editor: name + `renderAs` + question + instructions (**no per-section scope** — the template is scope-independent; render scope is supplied at render time); manual "make variable" only (#12); no version-history UI (#13).
- [ ] Save sign-in-gated via `commitGate`.
- [ ] `ReportBuilderView` wrapper; widget-contract test passes.

## Phase 5 · Chat ⇄ viewer: pin affordance + tools (every control driven from chat)

- [ ] **Allowlist `show_`** in `check-tool-quality`'s `ALLOWED_VERBS` (the canvas-dispatch verb for all ScopedViewerWidgets); any other genuinely new verb added too, never bypassed.
- [ ] `📌 pin to report` chat-widget on every assistant turn (disabled mid-stream; queues if clicked).
- [ ] `*.tools.ts` for every control, **mirrored on middleware `SERVER_TOOL_CATALOG`** (drift guard green): `show_smart_report_render`/`show_smart_report_edit`, `pin_to_report`, `propose_report_section`, and the section-mutation tools — the **same shared family as Extract's field-mutation tools** (allowlisted verbs `propose_`/`accept_`/`reject_`/`edit_`/`delete_`/`run_`). Interim: each calls the same ChatStore action as its UI control (AgentToolBus bridge pending).
- [ ] Report render + section focus emit `ViewerEvent`s into the chat three-axis context.
- [ ] Tests: each tool performs the same mutation as its UI control; pin lands a section; proposal-card accept lands a section.

## Phase 6 · Render endpoint

- [ ] `POST /api/widgets/smart-report/reports/render` (scope = `ContentScope`) — MOCK_MODE returns the Utility fixture; section-subset re-render; `preview_only` for sample; BYO scope → gate envelope (#10).
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
