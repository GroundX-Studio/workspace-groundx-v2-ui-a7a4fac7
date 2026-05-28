# Master viewer session

## Why

A user-reported regression (sign-up screen stayed mounted after F1 → signup → back → pick-sample) is a symptom of a class of bugs, not a one-off. The class is: `gate` / `signupOpen` / `preAttachedSchemaId` are stored mode flags with no single owner. Multiple navigation paths must independently remember to reset them. Future paths will leak the same way.

Today the chat side is correctly session-shaped: `ChatSession.messages[]` accumulates, persists across navigations, hydrates on mount. The viewer side is stateless and reactive — each frame component owns its own ephemeral state, the gate is a canvas-swap that hides the viewer instead of layering over it, and the few slots that *do* persist (entity `lastFrame`, `pendingSchemaOverlay`, `viewerHistory` telemetry) are scattered across three containers with three different lifetimes.

The viewer should mirror the chat: one master `ViewerSession` per chat session, accumulating `ViewerStep`s as the user moves, with transient `ViewerOverlay`s (sign-up, citation peek) z-stacked on top instead of replacing the canvas. The bug class disappears because there's no "stored gate" to forget to clear — the overlay's lifetime is its own.

## What changes

- DEFINE `ViewerSession = { id, history: ViewerStep[], currentStep: ViewerStepRef, overlays: ViewerOverlay[] }`, paired 1:1 with `ChatSession` (same id; viewer slot lives on the session row).
- DEFINE `ViewerStep` discriminated union covering the F-series surfaces: `ingest-picker`, `doc-viewer`, `extract-workbench`, `interact-chat`, `report`, `integrate`.
- DEFINE `ViewerOverlay` discriminated union: `sign-up`, `citation-peek`, `book-call`. Overlays are transient — they push, mutate, pop — and z-stack over the current step.
- REPLACE `OnboardingShell`'s `if (gateActive) return <SignUpWidget />; switch (frame) { ... }` canvas-swap with: always-render `currentStep` + always-render `overlays.map(...)` on top.
- MIGRATE `OnboardingSessionContext.gate` (open semantics) AND `signupOpen` into `ViewerSession.overlays`. `commitGate`/`dismissGate` mutate the overlay's state instead of a top-level slot. Committed gate (= signed-in identity) stays on `OnboardingSessionContext` because it's identity-scoped, not viewer-scoped.
- MIGRATE `ChatSession.pendingSchemaOverlay` → `ViewerSession.workspace.schemaOverlay`. The schema overlay is viewer state, not chat state, per the user's model.
- MIGRATE `OnboardingSessionContext.preAttachedSchemaId` to a dual representation: a chat widget message (durable in chat history) PLUS a viewer-step annotation on the F1 step (rendered as the existing F1 banner). Both surfaces read from one source.
- FORMALIZE the chat↔viewer event bus by extending `CanvasOrchestratorContext` with explicit chat→viewer and viewer→chat channels. Ad-hoc dispatches migrate onto it.
- PERSIST `ViewerSession` server-side by extending the `chat_sessions` row (or a paired `viewer_sessions` table). RT-style hydrate on mount.
- KEEP `OnboardingSessionContext.currentFrame` exposed for backwards-compat; derive it from `ViewerSession.currentStep.kind` instead of from `EntityRegistry.activeKey.lastFrame`.

## Out of scope

- LLM context bundling: `ChatSession.viewerHistory` (the telemetry trail used for LLM context) keeps its current shape. The new `ViewerSession.history` is render-driving; the two coexist.
- Splitting `ChatStore` and `ViewerStore` at the React-context level. Storage stays unified — sessions hold both axes, types are split.
- Steady-mode UX changes. Steady mode benefits from the new shape transparently (per-session viewer history naturally persists), but no new flows ship here.

## Affected

- Capability specs: `app-architecture`, `ui-views`, `data-tier`, `onboarding-schema-editor`, `auth-and-sessions`.
- Scaffold:
  - `app/src/contexts/ChatStoreContext/` — extend session shape, hydrator, actions
  - `app/src/contexts/OnboardingSessionContext/` — slim (drop `gate.open`, `signupOpen`, `preAttachedSchemaId`)
  - `app/src/contexts/CanvasOrchestratorContext/` — formalize as the chat↔viewer bus
  - `app/src/views/Onboarding/OnboardingShell.tsx` — overlay z-stack replaces canvas-swap
  - `app/src/contexts/EntityRegistryContext/` — `lastFrame` becomes a projection of viewer-history
  - All F-series view components — read from `ViewerStep` instead of from frame-derived state
- Middleware: persist viewer state on the `chat_sessions` row OR a sibling table; extend the RT-* hydrate endpoints.
