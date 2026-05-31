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
- [ ] **Failing test:** `<ScopedCanvas scope step>` mounts the correct `ScopedViewerWidget` per `step.kind` (`doc-viewer`→PdfViewer, `extract-workbench`→Extract, `report`→SmartReport, `integrate`→Integrate), fed the scope's `documentId`/`ContentScope` + `role`. No reference to `session.currentFrame`.
- [ ] Implement `<ScopedCanvas>` over the `ScopedViewerWidget` contract (thin selector, no new abstraction). Gate/book-call widget surfaces (`GateValueProp`/`BookCallView`) handled as widget mounts, not views.

## Phase 2 · `OnboardingShell` mounts `AppShell` (delete the per-frame canvas fork)
- [ ] **Failing test:** `OnboardingShell` renders via `AppShell` (`nav`+`chat`+`canvas`); the canvas is `<ScopedCanvas>` (not `UnderstandView`/`ExtractView`/…); F1 shows the picker overlay with `hideChat`; StepStrip pills still derive from frame/viewer-step state.
- [ ] Refactor `OnboardingShell` to mount `AppShell` with `chat={<ConversationFlow experience={makeOnboardingExperience(...)} />}` and `canvas={<ScopedCanvas .../>}`; **delete the `canvasContent` per-frame switch**. Keep the F1 overlay entry + StepStrip. `OnboardingShell.test` retargeted (not "stays green" — assertions on the old canvas views change).

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
