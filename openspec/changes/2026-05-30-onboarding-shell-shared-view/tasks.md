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
- [x] **CORRECTION (review 2026-05-30): the failing test above must cover only BUILT kinds.** `extract-workbench`→Extract and `integrate`→Integrate widgets are NOT built in this run — `CanvasKind` declares only `"doc-viewer"` (+ `"report"`/`"report-builder"` once smart-report lands at step 16). `<ScopedCanvas>` renders a labelled "not yet available" placeholder for any not-yet-declared step kind; the test asserts the declared kinds mount a real widget AND that an undeclared kind hits the placeholder (not a crash). Do NOT assert Extract/Integrate mounts — those join when their widgets exist. — DONE (`CanvasKind` = `doc-viewer|report|report-builder` in `@groundx/shared`; placeholder `scoped-canvas-unavailable` for extract-workbench/integrate/ingest-picker).
- [x] **DISCHARGE the core-data ScopedViewerWidget orphan HERE — this is the load-bearing wiring (review 2026-05-30; owns the core-data "OUTSTANDING — base is ORPHANED" ticket).** `<ScopedCanvas>` is the SOLE mount path, so wire it up in this change rather than leaving the base unused: (a) stand up the production registry singleton via the shipped `createScopedViewerWidgetRegistry([...])` (Catalog, `id`-keyed) holding the real descriptors — `PdfViewer` now, `SmartReport`(+builder) appended after step 16; (b) refactor `PdfViewerWidget` to build on the base — give its descriptor `kind: "doc-viewer"` + its `tools` set (`open_document`/`jump_to_page`) and use `useScopeAdapter(scope, …)` for scope-identity reload (it currently rolls its own `useEffect`); (c) extend the descriptor with `kind: CanvasKind` + a `tools` SET (replaces single `showTool`). — DONE (`scopedViewerWidgetRegistryProduction.ts` singleton is a `Catalog<ScopedViewerWidgetMount>` over 3 real mounts pairing each descriptor with its component; PdfViewer + SmartReportRender/Builder export descriptors via their `.tools.ts`; PdfViewer reload now `useScopeAdapter`; descriptor = `{ id, kind, slot, tools[] }`, `show_`-verb throw dropped). LOAD-BEARING consumer chain (REFINE-hardened): `<ScopedCanvas>` resolves the component it mounts via `componentForKind(kind)` → `scopedViewerWidgetRegistry.all()` → `mount.component` — there is NO parallel `CanvasKind→component` Record, so the catalog singleton is on the live render path (not a dormant parallel structure). Chain: OnboardingShell → ScopedCanvas → componentForKind → registry singleton → mounts.
- [x] **Direction-1 coverage:** `<ScopedCanvas>`'s `switch (step.kind)` over `CanvasKind` gets a `never` default (compiler), and the registry asserts exactly one mount per declared `CanvasKind` at construction. Guarantees every *declared* kind resolves to a widget (NOT that the widget set is complete — see core-data bullet for the honest scope + Direction-2 mitigations). — DONE (`switch (kind)` over `CanvasKind` with `never` default; `assertOneMountPerDeclaredKind` runs at module load over the catalog singleton itself).
- [x] **Runtime mount test + import ban:** one test mounts every *declared* `CanvasKind` through `<ScopedCanvas>` and asserts a real widget renders + receives `scope`; add an ESLint `no-restricted-imports` rule forbidding `components/viewer-widgets/*` imports outside the registry + each widget's own test, so "unregistered" = "unreachable". — DONE (ScopedCanvas.test mounts every declared kind + asserts scope/role on the widget; eslint `no-restricted-imports` bans the 3 ScopedViewerWidget components outside the registry + their own tests — proven red-on-injection, green otherwise; 6 legacy importers grandfathered pending step-20).

## Phase 2 · `OnboardingShell` mounts `AppShell` (delete the per-frame canvas fork)
- [x] **Failing test:** `OnboardingShell` renders via `AppShell` (`nav`+`chat`+`canvas`); the canvas is `<ScopedCanvas>` (not `UnderstandView`/`ExtractView`/…); F1 shows the picker overlay with `hideChat`; StepStrip pills still derive from frame/viewer-step state. — DONE (`OnboardingShell.test.tsx` retargeted: doc-viewer/report/report-builder assert `pdf-viewer-widget`/`smart-report-render`/`smart-report-builder` via `<ScopedCanvas>`; citation-click asserts `scoped-canvas[data-canvas-kind="doc-viewer"]`; F1 overlay + StepStrip pins preserved).
- [x] Refactor `OnboardingShell` to mount `AppShell` with `chat={<ConversationFlow experience={makeOnboardingExperience(...)} />}` and `canvas={<ScopedCanvas .../>}`; **delete the `canvasContent` per-frame switch**. Keep the F1 overlay entry + StepStrip. `OnboardingShell.test` retargeted (not "stays green" — assertions on the old canvas views change). — DONE (chat slot stays `<ChatColumn>` — the production assembly that composes `makeOnboardingExperience` → `ConversationFlow` internally; canvas slot now `<ScopedCanvas scope step role reportSurface>`; per-frame switch over Understand/Extract/Interact/Integrate/Report views deleted; F1 ingest overlay + StepStrip kept; gate/book-call stay shell-mounted widgets).

## Phase 3 · Retire the per-frame views
- [ ] **Failing test:** the 4 per-frame views are gone (or are thin wrappers with zero `scenario.manifest` reads); a grep guard asserts no `scenario.manifest.extractionSchema`/`sampleExtractionValues` reads remain in `views/Onboarding/`.
- [ ] Delete `UnderstandView`/`ExtractView`/`InteractView`/`IntegrateView` (or reduce to thin wrappers) now that `<ScopedCanvas>` mounts the production widgets directly. Update `real-data-rewire-gap.md` to mark the fold complete.

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
