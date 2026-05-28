# Tasks — post-mvs-cleanup

## Phase A — chat-viewer-bus ✅

- [x] Failing test: `bus.openCitation(documentId, page)` pushes a `citation-peek` overlay onto `viewer.overlays`.
- [x] Failing test: `bus.docOpened({documentId, fileName})` appends an assistant chat message announcing the doc-open (via the `agent-` id-prefix mechanism, so ChatColumn projects it into the rendered conversation).
- [x] Failing test: both methods are no-ops when no `ChatStoreProvider` is mounted (back-compat with standalone-canvas tests).
- [x] Added `openCitation(documentId, page, bbox?)` and `docOpened({documentId, fileName})` named methods to `CanvasOrchestratorApi`. They close over `useChatStoreOptional()` so the bus is a no-op in trees without a ChatStore.
- [x] Kept `appendViewerEvent` as the LLM-context telemetry sink — distinct from the bus.

## Phase B — Render-path migration ✅

- [x] Failing test: pushing `{ kind: "extract-workbench", scenarioId: "utility" }` onto `viewer.history` renders ExtractView via the new switch (caught the bug where `pickScenario` was pushing the wrong step kind for existing entities).
- [x] Rewrote `OnboardingShell.canvasContent` switch to dispatch on `viewer.currentStep.kind` instead of `session.currentFrame`. Added a `stepKindFallback` projection from `currentFrame` for the initial-mount case where no step has been pushed yet.
- [x] Fixed `pickScenario` to push a viewer step matching the entity's RESOLVED frame (was unconditionally pushing `doc-viewer` even when the entity already existed at F5/F6).
- [x] Hoisted `frameToStep` to module-level so `pickScenario` can call it before `advanceFrame`'s closure declares its local version.
- [x] Kept `useOnboardingSession().state.currentFrame` exposed as a derived getter for backwards compat with StepStrip + pill click handlers.

## Phase C — gate-status-to-overlay (minimum-viable) ✅

- [x] `openGate(trigger, options?)` now pushes a `{ kind: "sign-up", state: "pending", cause? }` overlay in addition to setting the legacy `gate.status === "open"`. The overlay is the authoritative source for "is the sign-up surface up"; the legacy slot is transitional.
- [x] `dismissGate()` now pops the sign-up overlay in addition to flipping `gate.status` to `dismissed`.
- [x] `commitGate(method)` now mutates the sign-up overlay's state to `"done"` in addition to flipping `gate.status` to `committed`. Auto-pop is the post-commit effect's job (consumers' URL navigation handles it).

## Phase D — derive-signup-from-overlay ⏸ deferred

Deferred. Removing the `signupOpen` slot requires reworking the `currentFrame` derivation (which uses `signupOpen` to project F2 when BYO is active). The architectural substrate is in place (the sign-up overlay is the source of truth and is mutated by `openGate / dismissGate / commitGate`); the slot deletion is a focused cleanup that should ride with the full `gate.status === "open"` removal.

## Phase E — schema-overlay-canonical-on-viewer ⏸ deferred

Deferred. The provider's projected-state layer (added in master-viewer-session Phase 4) already keeps `viewer.workspace.schemaOverlay` in lockstep with `pendingSchemaOverlay`. Migrating SchemaView and the ChatStoreContext schema-mutation actions to read/write the viewer-workspace slot directly + deleting the legacy slot is a focused refactor (~12 callsites). Deferring keeps risk surface tractable; the dual-slot is already functionally correct.

## Verification

- [x] vitest green app suite (900/900) — Phase A added 3 tests, Phase B caught a latent bug, Phase C preserved existing tests.
- [x] tsc green app side.
- [x] No drift in the user-reported flow: F1 → /onboarding/signup → back → pick sample still works (covered by existing master-viewer-session regression tests).
- [x] `openspec validate post-mvs-cleanup --strict` green.
