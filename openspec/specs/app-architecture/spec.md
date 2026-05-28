# app-architecture Specification

## Purpose

Define the durable architecture invariants of the scaffold — view-thinness
(≤20 LOC of logic per F-series view, with rendering delegated to
production widgets), the widget contract slot taxonomy, and the
ChatStore-as-root context tree. Cross-cuts UI views, contexts, and the
middleware façade.
## Requirements
### Requirement: F3-F7 production-widget collapse SHALL reduce each view to ≤20 LOC of logic

ExtractView, InteractView, and IntegrateView SHALL each be reduced to
the same `≤20 LOC logic body` shape that UnderstandView already meets,
once their respective production widgets ship (UI-01, UI-05, UI-02).
Until those widgets land, this requirement remains in partial state.

#### Scenario: View collapse closure check

- **WHEN** the production widget for a view (e.g. UI-02 for IntegrateView) ships
- **THEN** the view's `.tsx` body SHALL be reduced to ≤20 LOC of logic, with everything else delegated to the widget
- **AND** `grep -c '^' views/Onboarding/<View>.tsx` (post-collapse) confirms the bound

### Requirement: Onboarding overlay SHALL animate out on sign-up commit

When the user completes sign-up, the StepStrip SHALL slide out with a
motion-config-respecting transition AND the canvas header slot SHALL
empty, transitioning the user into the standard product surface.

#### Scenario: Graduation animation

- **GIVEN** the user finishes sign-up via the F6 gate
- **WHEN** the gate transitions to `committed`
- **THEN** StepStrip animates out (or instant when `prefers-reduced-motion: reduce`)
- **AND** the canvas-header slot empties on the next render

### Requirement: views/Auth/ SHALL be audited and dead pages deleted

The `scaffold/app/src/views/Auth/` directory SHALL be audited after
AU-01 / AU-02 ship. The existing
directory (Login, Register, ForgotPassword, ResetPassword, AuthLayout,
Form) SHALL be audited; dead pages SHALL be deleted and load-bearing
pages SHALL be documented in `widget-contract.md` § views.

#### Scenario: Audit dead Auth pages

- **WHEN** AU-01 (magic-link) and AU-02 (SSO) ship
- **THEN** each `/auth/*` page is either documented (route + caller) or removed
- **AND** `widget-contract.md` § views table lists the survivors

### Requirement: contexts/ SHALL be audited and dead contexts deleted

The 18 contexts under `scaffold/app/src/contexts/` SHALL each be
audited after UI-05 follow-on work lands: the 8 scaffold-
default Partner-API state holders that the product doesn't use SHALL
be deleted; the rest SHALL be annotated with their consumer.

#### Scenario: Context audit closure

- **WHEN** UI-05 SteadyShell work continues into context cleanup
- **THEN** every context directory either has a documented consumer in
  the widget-contract table OR is deleted
- **AND** no unused context provider mounts in the App tree

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

### Requirement: Transient surfaces SHALL render as overlays z-stacked over the current viewer step

The sign-up surface SHALL be represented as an entry in
`ViewerSession.overlays` (kind `sign-up`, state `pending | done |
dismissed`, optional `cause`). URL navigation to `/onboarding/signup`
SHALL push the overlay; navigation away SHALL pop it. The overlay is
the source of truth for the sign-up canvas swap.

The previous canvas-swap pattern in `OnboardingShell` — where
`gateActive` caused `<SignUpWidget />` to replace the entire canvas —
SHALL be replaced. `OnboardingShell` SHALL read the overlay stack
first; the legacy `gate.status` slot remains as a transitional bridge
for the chat-side `GateChatPanel` and intent-driven `openGate(...)`
flows until a follow-up change retires it.

#### Scenario: URL navigation to /onboarding/signup pushes a sign-up overlay

- **GIVEN** the user is on F1 with no overlays
- **WHEN** the user navigates to `/onboarding/signup`
- **THEN** a `{ kind: "sign-up", state: "pending" }` overlay is pushed
- **AND** `OnboardingShell.signupSurfaceActive` becomes true
- **AND** `<SignUpWidget />` mounts on top of the (still-mounted) F1 picker

#### Scenario: Navigating away from /onboarding/signup pops the overlay

- **GIVEN** the sign-up overlay is present
- **WHEN** the user navigates to `/onboarding`
- **THEN** the sign-up overlay is popped
- **AND** subsequent sample-pick navigates the canvas to F2 without the overlay blocking it — closing the user-reported "stuck signup screen" regression class

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

