# Tasks — Onboarding shell adopts the shared main view

> Goal: `OnboardingShell` hosts the SAME `AppShell` main view as `SteadyShell`, with an
> experience/scope-driven `<ScopedCanvas>` replacing the bespoke per-frame canvas switch. Shells stay
> separate; only the VIEW is shared. **DRAFTED — build deferred; FOLLOW-ON, runs after the foundation
> plans.** WIP cap = 3.
>
> **Execution: SEQUENTIAL/TDD.** A coupled refactor of a live shell on top of contracts other plans
> ship. Each phase changes the canvas/shell wiring the next builds on. The review gate (Discipline §10)
> runs after each task.
>
> **Hard dependencies (must land first):** unified-conversation-flow (`ConversationFlow` +
> `makeOnboardingExperience`); core-data-model-hardening (`ScopedViewerWidget` base + the 4 viewer
> widgets); widget-role-access (`role` contract); smart-report-screen (SmartReport widget); the
> `real-data-rewire-gap` fold. In the cross-plan order this is the LAST of the architecture set.

## Phase 1 · `<ScopedCanvas>` selector (the canvas, scope-driven)
- [x] **Failing test:** `<ScopedCanvas scope step>` mounts the correct `ScopedViewerWidget` per `step.kind` (`doc-viewer`→PdfViewer, `extract-workbench`→Extract, `report`→SmartReport, `integrate`→Integrate), fed the scope's `documentId`/`ContentScope` + `role`. No reference to `session.currentFrame`. — DONE (`ScopedCanvas.test.tsx`, failing-first; covers declared kinds + undeclared-kind placeholder).
- [x] Implement `<ScopedCanvas>` over the `ScopedViewerWidget` contract (thin selector, no new abstraction). Gate/book-call widget surfaces (`GateValueProp`/`BookCallView`) handled as widget mounts, not views. — DONE (`components/layout/ScopedCanvas/ScopedCanvas.tsx`; gate/book-call stay shell-mounted widgets).
- [x] ~~**CORRECTION (review 2026-05-30): cover only BUILT kinds** — `CanvasKind` = `doc-viewer|report|report-builder`; placeholder for extract-workbench/integrate.~~ **SUPERSEDED + WRONG (reassessment 2026-05-31, user-flagged).** `extract-workbench` and `integrate` are NOT unbuilt — their production surfaces EXIST: `ExtractView`+`SchemaView` ARE the live extract workbench (live schema/geometry/proposal-cards/save), `InteractView` is the doc-only canvas (chat = the onboarding `ChatExperience` in `ConversationFlow`, already loaded), `IntegrateView` renders the connectors. They were simply never PACKAGED as `ScopedViewerWidget`s. Routing them to a placeholder is the actual regression. **FIX → step 20 (corrected Phase 3):** package the existing surfaces as production ScopedViewerWidgets (give them `scope`/`role` + a descriptor; reuse their existing guts), register them, and map `interact-chat`→`doc-viewer` (Interact canvas is doc-only). NO placeholders for surfaces that exist; per `feedback_no_onboarding_duplicates` onboarding + steady share ONE widget set.
- [x] **DISCHARGE the core-data ScopedViewerWidget orphan HERE — this is the load-bearing wiring (review 2026-05-30; owns the core-data "OUTSTANDING — base is ORPHANED" ticket).** `<ScopedCanvas>` is the SOLE mount path, so wire it up in this change rather than leaving the base unused: (a) stand up the production registry singleton via the shipped `createScopedViewerWidgetRegistry([...])` (Catalog, `id`-keyed) holding the real descriptors — `PdfViewer` now, `SmartReport`(+builder) appended after step 16; (b) refactor `PdfViewerWidget` to build on the base — give its descriptor `kind: "doc-viewer"` + its `tools` set (`open_document`/`jump_to_page`) and use `useScopeAdapter(scope, …)` for scope-identity reload (it currently rolls its own `useEffect`); (c) extend the descriptor with `kind: CanvasKind` + a `tools` SET (replaces single `showTool`). — DONE (`scopedViewerWidgetRegistryProduction.ts` singleton is a `Catalog<ScopedViewerWidgetMount>` over 3 real mounts pairing each descriptor with its component; PdfViewer + SmartReportRender/Builder export descriptors via their `.tools.ts`; PdfViewer reload now `useScopeAdapter`; descriptor = `{ id, kind, slot, tools[] }`, `show_`-verb throw dropped). LOAD-BEARING consumer chain (REFINE-hardened): `<ScopedCanvas>` resolves the component it mounts via `componentForKind(kind)` → `scopedViewerWidgetRegistry.all()` → `mount.component` — there is NO parallel `CanvasKind→component` Record, so the catalog singleton is on the live render path (not a dormant parallel structure). Chain: OnboardingShell → ScopedCanvas → componentForKind → registry singleton → mounts.
- [x] **Direction-1 coverage:** `<ScopedCanvas>`'s `switch (step.kind)` over `CanvasKind` gets a `never` default (compiler), and the registry asserts exactly one mount per declared `CanvasKind` at construction. Guarantees every *declared* kind resolves to a widget (NOT that the widget set is complete — see core-data bullet for the honest scope + Direction-2 mitigations). — DONE (`switch (kind)` over `CanvasKind` with `never` default; `assertOneMountPerDeclaredKind` runs at module load over the catalog singleton itself).
- [x] **Runtime mount test + import ban:** one test mounts every *declared* `CanvasKind` through `<ScopedCanvas>` and asserts a real widget renders + receives `scope`; add an ESLint `no-restricted-imports` rule forbidding `components/viewer-widgets/*` imports outside the registry + each widget's own test, so "unregistered" = "unreachable". — DONE (ScopedCanvas.test mounts every declared kind + asserts scope/role on the widget; eslint `no-restricted-imports` bans the 3 ScopedViewerWidget components outside the registry + their own tests — proven red-on-injection, green otherwise; 6 legacy importers grandfathered pending step-20).

## Phase 2 · `OnboardingShell` mounts `AppShell` (delete the per-frame canvas fork)
- [x] **Failing test:** `OnboardingShell` renders via `AppShell` (`nav`+`chat`+`canvas`); the canvas is `<ScopedCanvas>` (not `UnderstandView`/`ExtractView`/…); F1 shows the picker overlay with `hideChat`; StepStrip pills still derive from frame/viewer-step state. — DONE (`OnboardingShell.test.tsx` retargeted: doc-viewer/report/report-builder assert `pdf-viewer-widget`/`smart-report-render`/`smart-report-builder` via `<ScopedCanvas>`; citation-click asserts `scoped-canvas[data-canvas-kind="doc-viewer"]`; F1 overlay + StepStrip pins preserved).
- [x] Refactor `OnboardingShell` to mount `AppShell` with `chat={<ConversationFlow experience={makeOnboardingExperience(...)} />}` and `canvas={<ScopedCanvas .../>}`; **delete the `canvasContent` per-frame switch**. Keep the F1 overlay entry + StepStrip. `OnboardingShell.test` retargeted (not "stays green" — assertions on the old canvas views change). — DONE (chat slot stays `<ChatColumn>` — the production assembly that composes `makeOnboardingExperience` → `ConversationFlow` internally; canvas slot now `<ScopedCanvas scope step role reportSurface>`; per-frame switch over Understand/Extract/Interact/Integrate/Report views deleted; F1 ingest overlay + StepStrip kept; gate/book-call stay shell-mounted widgets).

## Phase 3 · Package the existing surfaces as production widgets (reassessed 2026-05-31)
> REASSESSMENT: the per-frame views are NOT scenario.manifest stubs to delete — `ExtractView`/`SchemaView`
> ARE the live extract workbench, `InteractView` is the doc-only canvas (chat = the onboarding
> `ChatExperience`), `IntegrateView` is the connectors surface. Step 19 wrongly routed them to a
> placeholder. The job is to PACKAGE their guts as production `ScopedViewerWidget`s (onboarding + steady
> share one set) and register them so `<ScopedCanvas>` mounts the REAL surfaces — not delete them, not placeholder them.
- [ ] **Extract workbench → a production `ScopedViewerWidget`** (`components/viewer-widgets/Extract*`): lift the `ExtractView`/`SchemaView` guts into a widget that takes `scope: ContentScope` + `role` (derive the doc set from scope, not scenario context), `useScopeAdapter` for reload, a descriptor (`kind: "extract-workbench"`, its existing field-mutation `*.tools.ts`). Add `"extract-workbench"` to `CanvasKind`; register the mount; ScopedCanvas now renders it (placeholder gone). The old `ExtractView` becomes a thin wrapper or is removed.
- [ ] **Interact → `doc-viewer`**: map `interact-chat` to the `doc-viewer` mount (the Interact canvas is doc-only PdfViewer; the conversation is the onboarding `ChatExperience` already loaded in `ConversationFlow`). No new widget; remove the interact placeholder.
- [ ] **Integrate → a production `ScopedViewerWidget`** (`components/viewer-widgets/Integrate*`): package `IntegrateView`'s connectors surface with `scope`/`role` + descriptor (`kind: "integrate"`); add `"integrate"` to `CanvasKind`; register; placeholder gone.
- [ ] **Failing test + grep guard:** every onboarding frame canvas renders its REAL surface through `<ScopedCanvas>` (no `scoped-canvas-unavailable` placeholder on f3/f5/f7); no `scenario.manifest.extractionSchema`/`sampleExtractionValues` reads remain in `views/Onboarding/`; the ScopedCanvas placeholder path is reserved for genuinely-future kinds only. Update `real-data-rewire-gap.md`.

## Phase 4 · Align SteadyShell to the same selector
- [ ] **Failing test:** `SteadyShell`'s canvas is the same `<ScopedCanvas>` (not a bespoke `PdfViewerWidget`-only branch), so both shells share one canvas selector.
- [ ] Point `SteadyShell` at `<ScopedCanvas>`; confirm RT-01..05 + steady-shell canvas tests green.

## Closeout
- [ ] `validate --all --strict` green; app + middleware suites green; widget-contract + no-hardcoded-styles guards green; `npm run build` clean.
- [ ] Update `docs/agents/architecture.md` + `real-data-rewire-gap.md` (fold complete) + memory (`feedback_no_onboarding_duplicates` — the canvas is now one shared scope-driven surface across both shells).
- [ ] Archive.

## Out of scope / deferred (tracked, NOT this change)
- [ ] Author the **Workspace/Project/document** experiences + ENABLE the nav-rail entries (today disabled stubs) to compose them — tracked in unified-conversation-flow deferred.
- [ ] Collapsing the shells (explicitly NOT done — per-context shells by design).
- [ ] Per-entry `chat_sessions` **session selection** for nav-rail entries.
