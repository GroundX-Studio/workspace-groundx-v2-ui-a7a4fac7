# Design — master-viewer-session

## Source of truth

The architectural intent comes directly from the user's framing (transcript reference):

> "the viewer window should have a similar structure and approach to the chat window. there should be the same master viewer session. with an onboarding overlay … one coherent session. the chat and viewer have relationships with each other as well."

This proposal formalizes that into the durable spec.

## Shape

### ViewerSession (new)

```ts
interface ViewerSession {
  id: string;                       // same id as the paired ChatSession
  history: ViewerStep[];            // accumulated; never erased
  currentStep: { stepIndex: number }; // pointer into history
  overlays: ViewerOverlay[];        // z-stacked over currentStep
  workspace: {
    schemaOverlay: PendingSchemaOverlay;  // moved from ChatSession
    // future workspace state (pinned docs, draft reports, …) lands here
  };
}
```

### ViewerStep (discriminated union)

Every "place the user is looking at" is a step. Frames are projections of step.kind:

```ts
type ViewerStep =
  | { kind: "ingest-picker" }                                  // F1
  | { kind: "doc-viewer"; documentId: string; page?: number }  // F2 / source peek
  | { kind: "extract-workbench"; scenarioId: string; focusedCategoryId?: string } // F3 / F3a / F4
  | { kind: "interact-chat"; scenarioId: string }              // F5
  | { kind: "report" }                                         // (future)
  | { kind: "integrate" };                                     // F7
```

### ViewerOverlay (discriminated union)

Overlays sit on top of `currentStep`. They have their own lifecycle: push → (commit | dismiss) → pop or mutate. Multiple overlays may stack (rare; e.g. book-call over sign-up).

```ts
type ViewerOverlay =
  | { kind: "sign-up"; state: "pending" | "done" | "dismissed"; cause?: GateCause }
  | { kind: "citation-peek"; documentId: string; page: number; bbox?: BBox }
  | { kind: "book-call" };
```

`gate.status === "committed"` (signed-in identity) is **not** an overlay — it's identity-scoped, durable, lives on `OnboardingSessionContext` (or the auth slice). The overlay represents the *transient sign-up surface*, not the persistent fact of being signed-in.

## The bug class this kills

Today: `gate.status === "open"` is a stored slot. Every navigation path that should clear it has to call `setGate({status:"idle"})`. We just shipped two patches (`advanceFrame("f1")` and `pickScenario`) for this. Future paths will leak the same way.

After: the sign-up surface is `overlays[i] = { kind: "sign-up", state: "pending" }`. The overlay is the surface — there is no separate stored flag. Navigation doesn't "clear" anything; it just keeps showing whatever's underneath. The overlay only pops when the user explicitly commits (success → `state: "done"` then auto-pop after announcement) or dismisses, OR when the URL-handler that pushed it (e.g. visiting `/onboarding/signup`) detects the user has navigated away.

URL-driven overlays (BYO sign-up from F1) become a thin pattern:
```ts
useEffect(() => {
  if (location.pathname === "/onboarding/signup") pushOverlay({ kind: "sign-up", state: "pending" });
  else dismissOverlay("sign-up", "navigated-away");
}, [location.pathname]);
```

Intent-driven overlays (F3a Save 401) push the overlay imperatively with `cause: "save-schema"`. The same `commitGate(method)` action mutates state from `pending` → `done` and triggers the post-commit handoff.

## Chat↔viewer bus

`CanvasOrchestratorContext` already exists and partially fills this role. We formalize:

- **chat → viewer** intents: `openCitation(doc, page, bbox)` (push citation-peek overlay), `showSample(scenarioId)` (push viewer step), `showSchema(scenarioId, category?)` (push extract-workbench step).
- **viewer → chat** events: `docOpened(doc)` (append chat widget), `stepAdvanced(from, to)` (LLM-context viewer-event), `overlayPushed(kind)` (analytics + viewer-event).

The contract: every chat-driven viewer change passes through `chat→viewer` channels; every viewer-driven chat change passes through `viewer→chat` channels. Pointwise wires (e.g. SchemaView calling `appendAgentMessage` directly) migrate onto the bus as part of this change.

## preAttachedSchemaId: chosen shape

Dual representation, single source:

1. After the F3a Save → sign-in → persist completes, the system:
   - Appends a chat widget message `{ kind: "schema-attached", schemaId, name }` (durable chat history).
   - Pushes a viewer step `{ kind: "ingest-picker", attachedSchema: { schemaId, name } }` (or annotates the next ingest-picker step pushed).
2. The F1 banner reads `currentStep.attachedSchema` (a step annotation), NOT a top-level `preAttachedSchemaId` slot.
3. The chat widget renders the same info in chat history.
4. Sign-out (auth flip) emits a viewer-step push that clears the annotation; the chat widget naturally fades into history as the conversation continues.

Both surfaces consume from the session, not from an ad-hoc slot. `setPreAttachedSchemaId` action is deleted.

## Persistence

The `chat_sessions` row already serializes most session state as JSON columns. Extend with `viewer_history_json` + `viewer_overlays_json` + `viewer_workspace_json`. RT-style writes (debounced) match existing RT-04 PATCH semantics. Hydration on mount pulls all three columns.

If the schema gets unwieldy on one row, split to a sibling `viewer_sessions` table keyed by chat-session id. Decision deferred to Phase 1 task — driven by row-size measurement.

## Phasing

Seven phases, each independently archivable. Earlier phases land foundations; later phases peel off features. The bug class the user reported is closed by Phase 2 alone — phases 3+ are correctness + clarity wins. If priority shifts mid-execution, ship Phase 2 first and pause.

## Backwards compatibility

- `useOnboardingSession().state.currentFrame` keeps working — derived from `ViewerSession.currentStep.kind`.
- `useOnboardingSession().state.scenario` keeps working — same derivation.
- `useChatStore().state.sessions.get(id).pendingSchemaOverlay` keeps reading after Phase 4 because we keep a getter facade pointing at the new location for one release cycle, then delete.
- `openGate(trigger, options)` keeps its public signature but now pushes an overlay; callers don't change.
- `commitGate(method)` keeps its public signature but now mutates the overlay state; identity-level "signed-in" still flips appMode.

## Drift prevention

Three new test families:

1. **Overlay-lifecycle tests** (`viewerSession.overlay.test.tsx`): push → state mutate → pop; URL-driven overlays auto-pop on navigation away.
2. **No-mode-flag drift guard** (`no-stored-gate-mode.test.ts`): scans `OnboardingSessionContext.tsx` AST for any `setGate({status:"open"})` calls outside the overlay-bridge layer; fails if a new caller appears.
3. **Step-projection tests**: pushing a viewer step renders the right frame view without depending on `currentFrame` state changes.
