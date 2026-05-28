# Tasks — master-viewer-session

Seven phases. Each phase ends at a green vitest + tsc gate; phases CAN be archived independently if priorities shift. The bug class the user reported closes at the end of Phase 2.

## Phase 1 — ViewerSession foundation (types + storage)

- [x] Failing test: `apiRouteContract.test.ts` round-trips viewerHistory + viewerOverlays + viewerWorkspace through PATCH → getChatSession; default-null behavior on session creation. Frontend `ChatStoreServerHydrator.test.tsx` verifies viewer slot hydrates from the server payload.
- [x] Define `ViewerSession`, `ViewerStep`, `ViewerOverlay`, `ViewerWorkspace`, `EMPTY_VIEWER_SESSION` in `app/src/contexts/ChatStoreContext/types.ts`.
- [x] Extend `ChatSession` with `viewer: ViewerSession`; updated all 6 session-construction sites + the EntityRegistry seed path.
- [x] Server: chose single-row JSON columns (`viewer_history_json`, `viewer_overlays_json`, `viewer_workspace_json`). Row-size impact negligible; paired-table can be revisited if size grows.
- [x] Extended `ChatSessionRecord` type, `mysqlRepository` schema/upsert/select, `memoryRepository` (carries verbatim).
- [x] Extended `PATCH /api/chat-sessions/:id` to validate + merge the three new fields with the same null-preserving semantics as `currentIntent`.
- [x] Extended `POST /api/chat-sessions` to default the three fields to null on creation, preserve existing values on upsert.
- [x] Extended `patchChatSession` client API + `PersistedChatSessionSummary` type to carry the three fields.
- [x] `hydrateFromServer` projects null → EMPTY_VIEWER_SESSION; populates `viewer.history`, `viewer.overlays`, `viewer.workspace.schemaOverlay`.
- [x] Cross-check: dead-column / dead-endpoint pass — `viewerHistory`/`viewerOverlays`/`viewerWorkspace` are READ by `hydrateFromServer`, WRITTEN by `patchChatSession`; both new server columns are read+written by `mysqlRepository`.
- [x] Tests: 410/410 middleware, 893/893 app (added 3 new tests). No behavior change in any rendered surface — type extension only.

## Phase 2 — Gate as overlay (closes user-reported regression class)

- [x] Failing test: URL `/onboarding/signup` pushes `{ kind: "sign-up", state: "pending" }` onto active session's `viewer.overlays`.
- [x] Failing test: navigating away from `/onboarding/signup` pops the overlay.
- [x] Implemented `pushOverlay`, `mutateOverlay`, `popOverlay` actions on `ChatStoreApi`. All three idempotent + null-safe.
- [x] URL-driven push: `OnboardingShell` URL→state effect, on `/onboarding/signup`, pushes the sign-up overlay AND calls legacy `openGate("byo")` (transitional bridge for chat-side `GateChatPanel`); on `/onboarding`, pops the overlay AND calls `advanceFrame("f1")`.
- [x] Rewrote `OnboardingShell` canvas: introduced `signupSurfaceActive = signupOverlay != null || legacyGateOpenOrCommitted`. The canvas-swap path is now the overlay reader; legacy `gate.status` is a transitional bridge until Phase 6.
- [x] ExistingPhase 2-related tests pass: `ARCH-05B` (canvas swap on legacy openGate) + the new master-viewer-session Phase 2 overlay push/pop assertions.
- [ ] **Deferred to Phase 6**: full removal of the `gate.status` legacy bridge. Intent-driven `openGate("save", {cause})` (ExtractView Save 401) still uses the legacy slot — both paths render correctly today, but converting Save-401 to push the overlay directly belongs alongside the chat-side migration.
- [ ] **Deferred to Phase 7**: delete the two `setGate({status:"idle"})` patches in `advanceFrame("f1")` and `pickScenario`. They're load-bearing for the chat-side `GateChatPanel` until Phase 6 reshapes that into a widget message.
- [ ] **Deferred to Phase 7**: delete `OnboardingSessionContext.signupOpen` (derived from overlay state).
- [ ] **Deferred to Phase 7**: drift guard test `no-stored-gate-mode.test.ts` asserting zero `setGate({status:"open"})` calls.

**Phase 2 close-out**: The new architecture is in place and demonstrably works. Two new tests verify the overlay model. The user-reported regression class is closed — the canvas swap now reads from the overlay slot, so URL-driven push/pop fully owns the canvas-side lifecycle. The chat-side `GateChatPanel` flow remains on the legacy `gate.status` channel and will be reshaped in Phase 6. App tests: 895/895; middleware: 410/410; tsc clean.

## Phase 3 — Frame surfaces become viewer steps

- [x] Failing test: `advanceFrame` accumulates a `ViewerStep` per call onto `viewer.history`; pick utility → advance F3 → F3a → F1 lands `doc-viewer` + `extract-workbench` × 2 + `ingest-picker` (history never erased).
- [x] Implemented `pushStep(step)` action on `ChatStoreApi`. Idempotent on structural equality with the current step so re-renders don't pollute history.
- [x] Added `frameToStep(frame, scenario)` mapping in `OnboardingSessionContext`. F1 → ingest-picker; F2 → doc-viewer(scenario); F3/F3a/F4 → extract-workbench(scenario); F5/F6 → interact-chat(scenario); F7 → integrate.
- [x] `pickScenario` and `advanceFrame` now call `pushStep(...)` alongside their existing entity / frame writes. The viewer step is accumulated; nothing reads it for render yet (deferred to a future change — render path remains on `currentFrame`).
- [ ] **Deferred to Phase 7**: `OnboardingSession.currentFrame` becomes a derived getter over `ViewerSession.currentStep.kind`. Today it stays derived from `EntityRegistry.entities[].lastFrame` for backwards-compat; the viewer-step accumulation is a parallel substrate.
- [ ] **Deferred to follow-up change**: rewrite `OnboardingShell.canvasContent` switch to dispatch on `currentStep.kind`. The pieces are in place; the render rewrite is held until the chat↔viewer bus (Phase 6) so the two changes ship together.

**Phase 3 close-out**: ViewerSession.history accumulates correctly. 896/896 app suite; tsc clean. The step-as-substrate is laid; render path remains on `currentFrame` until a focused render-rewrite change.

## Phase 4 — Schema overlay moves to viewer session

- [x] Failing test: `addSchemaField` mutation lands on BOTH `viewer.workspace.schemaOverlay.addedFields` AND `pendingSchemaOverlay.addedFields` (lockstep migration contract).
- [x] Implementation: rather than rewriting all 12+ overlay-mutation callsites, added a Phase-4 projection in the provider's exposed state. After every mutation, the provider re-projects `viewer.workspace.schemaOverlay := pendingSchemaOverlay` so the new slot stays in lockstep. The same reference is shared via identity short-circuit to avoid render churn.
- [x] Hydrator inverts the projection: when the server returns `viewer_workspace_json.schemaOverlay`, it's set as the source of truth on BOTH the legacy `pendingSchemaOverlay` slot and the new `viewer.workspace.schemaOverlay` slot so the Phase-4 projection sees them in sync.
- [x] Both `ChatStoreContext` (combined API) and `ChatStoreStateContext` (split API) expose the projected state so `useChatStore().state === useChatStoreState()` invariant holds.
- [ ] **Deferred to Phase 7**: delete the legacy `pendingSchemaOverlay` slot. Today both slots are live; SchemaView still reads from the legacy slot (which is kept in sync by the projection). After downstream readers migrate, the legacy slot can go away.

**Phase 4 close-out**: 897/897 app tests; tsc clean. Schema overlay now lives in TWO places, kept in lockstep by the provider's exposed-state projection. Phase 7 inverts the relationship (viewer slot becomes canonical) and removes the legacy slot.

## Phase 5 — preAttachedSchemaId as chat widget + step annotation

- [x] `ViewerStep.kind === "ingest-picker"` annotation slot already shipped in Phase 1.
- [x] Test: pushing an ingest-picker step with `attachedSchema` annotation lands on the active session's viewer; IngestView surfaces the banner from the step.
- [x] ExtractView's signed-in Save path now pushes the F1 step with the attachment annotation AND appends an agent chat message ("Schema attached: <name>") instead of calling `setPreAttachedSchemaId`.
- [x] ExtractView's post-commit (Save 401 → gate → retry) path does the same. Order: advanceFrame("f1") first (pushes a bare ingest-picker step), then pushStep with the annotation, then appendAgentMessage.
- [x] IngestView reads the attachment from `viewer.history[currentStep].attachedSchema?.schemaId` instead of `session.preAttachedSchemaId`.
- [x] Deleted `OnboardingSessionContext.preAttachedSchemaId` + `setPreAttachedSchemaId`. Type field removed. Existing test `setPreAttachedSchemaId starts null and persists when set` rewritten as `pushStep with attachedSchema annotation` (the new source of truth).
- [x] Used the existing `appendAgentMessage` action for the chat side rather than introducing a new `schema-attached` widget kind — that's a richer-rendering follow-up, not load-bearing for the architecture.

**Phase 5 close-out**: 897/897 app tests; tsc clean. preAttachedSchemaId is gone. The pre-attach signal lives on the viewer-step annotation + the chat agent message — both naturally survive navigation, both flow through the bus established in Phase 1-4.

## Phase 6 — Chat↔viewer event bus

- [ ] **Deferred to a follow-up OpenSpec change `chat-viewer-bus`**: formalize `CanvasOrchestratorContext` as a peer bus with `chat→viewer` + `viewer→chat` channels and migrate ad-hoc dispatches onto it.

**Why deferred**: Phases 1-5 closed the user-reported bug class and put the master ViewerSession + overlay + step + workspace substrate in place. The remaining pointwise wires (SchemaView's direct `appendAgentMessage`, ChatColumn's direct `enqueueFieldProposal`) work correctly today; the bus formalization is an aesthetic refactor whose value is type-safety / centralized analytics rather than user-visible behavior. Shipping it inside this already-large change inflates risk surface; landing it as its own change keeps the diff reviewable.

The substrate IS in place — `ViewerOverlay` + `ViewerStep` + the push/pop/mutate actions + the projection layer all exist and are exercised by Phase 2-5 tests. A future `chat-viewer-bus` change can build the formal bus on top without touching the substrate.

## Phase 7 — Cleanup + spec consolidation

- [x] Deleted `OnboardingSessionState.preAttachedSchemaId` + `setPreAttachedSchemaId` (Phase 5).
- [ ] **Deferred**: `OnboardingSessionState.signupOpen` removal. Still load-bearing for derived `currentFrame === "f2"` projection while the BYO surface is active. Removing it requires a parallel refactor of `useSessionFacade`'s frame derivation. Tracked for the same follow-up that retires the legacy `gate.status` slot.
- [ ] **Deferred**: `gate.open` removal. Still load-bearing for the chat-side `GateChatPanel` + intent-driven `openGate("save", { cause })` flows. The `OnboardingShell.signupSurfaceActive = signupOverlay != null || legacyGateOpenOrCommitted` bridge keeps the canvas rendering correctly under both paths; the chat-side gate panel reads the legacy slot only.
- [ ] **Deferred**: `pendingSchemaOverlay` slot removal. Today it's kept in lockstep with `viewer.workspace.schemaOverlay` via the provider's projected-state layer. SchemaView still reads from it. Removing it means migrating SchemaView's reads to the viewer slot.
- [x] Merged five capability spec deltas via `openspec archive master-viewer-session`: `app-architecture`, `ui-views`, `data-tier`, `onboarding-schema-editor`, `auth-and-sessions`. Spec deltas tightened to describe the SHIPPED state (substrate + URL-driven overlay path), not aspirational rewrites — to keep the durable spec honest.
- [x] Full vitest green: app 897/897, middleware 410/410. tsc clean. `openspec validate master-viewer-session --strict` green.

**Phase 7 close-out**: change archived in honest shape. Three legacy slots (`signupOpen`, `gate.open`, `pendingSchemaOverlay`) remain transitionally load-bearing; each is documented as deferred in the durable spec. The substrate they'll eventually be replaced by — `ViewerSession.overlays` + `viewer.workspace.schemaOverlay` — is in place and proven. Follow-up changes can pick them off one at a time without architectural risk.
