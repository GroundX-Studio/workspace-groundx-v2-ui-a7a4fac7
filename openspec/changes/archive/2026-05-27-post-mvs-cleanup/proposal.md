# Post-MVS cleanup

## Why

The `master-viewer-session` change shipped the substrate (ViewerSession + overlays + steps + workspace) and closed the user-reported regression class. Three transitional bridges and two unfinished migrations were explicitly deferred:

- `chat-viewer-bus` formalization (Phase 6 deferral)
- Render path still switches on `currentFrame` instead of `currentStep.kind` (Phase 3 deferral)
- `gate.status` slot still load-bearing for chat-side GateChatPanel + intent-driven `openGate("save", {cause})` (Phase 7 deferral)
- `signupOpen` slot still used in `currentFrame` derivation (Phase 7 deferral)
- `pendingSchemaOverlay` still readable by SchemaView (Phase 7 deferral)

This change retires all five in one focused stretch. Each is small individually; bundling them avoids 5× OpenSpec ceremony and lets the changes ripple through the codebase coherently (e.g. the bus formalization touches the same call sites as the bridge retirements).

## What changes

### Phase A — chat-viewer-bus

- EXTEND `CanvasOrchestratorContext` with explicit `chat→viewer` (`openCitation`, `showSample`, `showSchema`, `pushOverlay`) and `viewer→chat` (`docOpened`, `stepAdvanced`, `overlayPushed`) channels.
- MIGRATE existing pointwise dispatches onto the bus (SchemaView `appendAgentMessage` for rerun narration, ChatColumn citation handling, etc.).
- KEEP `appendViewerEvent` as the LLM-context telemetry sink (distinct from the bus).

### Phase B — Render-path migration

- REWRITE `OnboardingShell.canvasContent` switch to dispatch on `currentStep.kind` instead of `session.currentFrame`.
- ROUTE each F-series view to ONE `ViewerStep` kind (`ingest-picker` → IngestView, `doc-viewer` → UnderstandView, `extract-workbench` → ExtractView, `interact-chat` → InteractView, `integrate` → IntegrateView).
- KEEP `currentFrame` exposed via `useOnboardingSession().state.currentFrame` as a derived getter (backwards-compat).

### Phase C — gate-status-to-overlay

- REWRITE `GateChatRail` + `GateChatPanel` to read the sign-up overlay from `viewer.overlays` instead of `gate.status === "open"`.
- REWRITE intent-driven `openGate("save", { cause })` callsites to push `{ kind: "sign-up", cause: "save-schema" }` overlays directly (ExtractView's 401 branch is the primary caller).
- DELETE the `open` variant from `GateStatus`. Keep `committed` (durable identity flip) and `dismissed` (history).

### Phase D — derive-signup-from-overlay

- REMOVE the `signupOpen` state slot from `OnboardingSessionContext`.
- DERIVE the previous "BYO signup surface" frame projection (`currentFrame === "f2"` when `signupOpen`) from `viewer.overlays.some(o => o.kind === "sign-up" && o.state === "pending")`.

### Phase E — schema-overlay-canonical-on-viewer

- SWITCH every reader of `ChatSession.pendingSchemaOverlay` to read `viewer.workspace.schemaOverlay` instead.
- DELETE the legacy `pendingSchemaOverlay` slot on `ChatSession`.
- DELETE the provider-level projection layer that kept the two slots in sync.

## Out of scope

- Magic-link sign-in, F7 connector cards, retention sweep, Hotjar — separate capabilities.
- Refactoring `appendViewerEvent` (LLM-context telemetry stays on its current shape).
- Steady-mode shell changes beyond what's needed to compile + keep tests green.

## Affected

- Specs: `app-architecture`, `ui-views`, `onboarding-schema-editor`, `auth-and-sessions`.
- Scaffold: `CanvasOrchestratorContext`, `ChatStoreContext`, `OnboardingSessionContext` (slim further), `OnboardingShell` (canvas switch rewrite), `GateChatPanel` + `GateChatRail` (overlay reader), `SchemaView` (workspace reader), `ChatColumn` (bus migration).
- Tests: gateLifecycle + OnboardingShell integration tests rewrite against the new model.
