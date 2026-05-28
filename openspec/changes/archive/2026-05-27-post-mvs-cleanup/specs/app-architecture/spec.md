# Spec Delta — app-architecture

## ADDED Requirements

### Requirement: CanvasOrchestrator SHALL expose explicit chat→viewer and viewer→chat channels

`CanvasOrchestratorContext` SHALL provide two named channels for cross-side dispatch:

- **chat→viewer**: `openCitation(documentId, page, bbox?)`.
- **viewer→chat**: `docOpened({ documentId, fileName })`.

These named channels are convenience methods that close over `useChatStoreOptional()` so they are no-ops in trees where no `ChatStoreProvider` is mounted (preserving back-compat with standalone-canvas tests). The legacy `dispatch(intent)` + adapter-registry surface remains for cases where a more flexible kind-based routing is needed.

`appendViewerEvent` (LLM-context telemetry sink) is distinct from the bus and continues to handle telemetry without coupling to cross-side dispatch.

#### Scenario: Citation click pushes a citation-peek overlay

- **GIVEN** the chat surface renders an assistant turn with a citation chip referencing `documentId: "util-1", page: 3`
- **WHEN** `bus.openCitation("util-1", 3)` dispatches
- **THEN** a `{ kind: "citation-peek", documentId: "util-1", page: 3 }` overlay is pushed onto the active session's `viewer.overlays`

#### Scenario: Doc opened in viewer appends a chat message

- **GIVEN** the viewer opens a document via its doc switcher
- **WHEN** `bus.docOpened({ documentId: "util-1", fileName: "utility-bill.pdf" })` dispatches
- **THEN** an assistant chat message announcing the doc-open is appended to the active session's `messages` (with the `agent-` id prefix so ChatColumn projects it into the rendered conversation)

#### Scenario: Bus methods are no-ops without ChatStoreProvider

- **GIVEN** a `CanvasOrchestratorProvider` mounted WITHOUT a parent `ChatStoreProvider` (e.g. a standalone-canvas test)
- **WHEN** `bus.openCitation(...)` or `bus.docOpened(...)` fires
- **THEN** the call does not throw
- **AND** nothing is mutated (no overlays, no messages)

## MODIFIED Requirements

### Requirement: ViewerSession SHALL be the master viewer-state record per chat session

Every `ChatSession` SHALL carry a paired `ViewerSession` slot containing `history: ViewerStep[]`, `currentStep: { stepIndex: number }`, `overlays: ViewerOverlay[]`, and `workspace` (schema overlay + future workspace state).

Frame surfaces SHALL be rendered by switching on `viewer.currentStep.kind`. `OnboardingShell.canvasContent` SHALL dispatch on the latest viewer step's kind, with a `stepKindFallback` projection from `session.currentFrame` for the initial-mount case before any step has been pushed. `useOnboardingSession().state.currentFrame` is preserved as a backwards-compat derived getter (driven by entity activation), but is NOT on the render hot path.

Schema overlay state continues to be available on BOTH `ChatSession.pendingSchemaOverlay` (legacy) AND `ViewerSession.workspace.schemaOverlay` (canonical), kept in lockstep by the provider's projected-state layer. Removing the legacy slot is deferred to a follow-up `schema-overlay-canonical-on-viewer` change.

#### Scenario: ViewerSteps drive the canvas switch

- **GIVEN** a session with `viewer.currentStep.kind === "extract-workbench"`
- **WHEN** `OnboardingShell` renders
- **THEN** `<ExtractView />` mounts (regardless of what `session.currentFrame` says)
- **AND** the legacy `currentFrame` is consulted only when no viewer step has been pushed yet

#### Scenario: pickScenario pushes a step matching the entity's resolved frame

- **GIVEN** an entity for `sample:utility` that already exists with `lastFrame: "f5"`
- **WHEN** `pickScenario("utility")` is called
- **THEN** the entity is re-activated (lastFrame is preserved at f5 — upsertAndActivate's existing semantics)
- **AND** the pushed viewer step is `interact-chat` (matching f5), NOT `doc-viewer` (the brand-new-entity default)
