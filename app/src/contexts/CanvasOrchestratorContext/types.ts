import type { CanvasIntent, IntentSource as SharedIntentSource, NormalizedBbox } from "@groundx/shared";

/**
 * CanvasIntent — discriminated union of every command the canvas can receive.
 *
 * Three intent sources converge (user UI events / agent tool calls / tour
 * state machine), all stamped with `source` and a monotonic `intentId` so the
 * middleware reducer can establish total order. Server-wins on conflict.
 *
 * Single source of truth: the union itself is `canvasIntentSchema` /
 * `z.infer<typeof canvasIntentSchema>` in `@groundx/shared` — re-exported here
 * unchanged so the orchestrator `dispatch()` switch + `assertNeverIntent`
 * (which drive compile-time exhaustiveness off the `kind` discriminator) and
 * both `current_intent_json` read boundaries (app hydration + middleware row
 * mapper) all derive from the ONE schema. Extend the union by adding a variant
 * to `canvasIntentSchema` THERE + registering a matching `CanvasAdapter` via
 * `registerAdapter` here; the shared `parseCanvasIntent` then guards the wire
 * format at every persistence boundary.
 */
export type { CanvasIntent };

// 2026-05-31-chat-wire-types-shared — `IntentSource` is the shared `Source`
// vocabulary MINUS `"system"` (`Exclude<Source,"system">`), single-sourced via
// the shared `IntentSource` alias rather than re-declared. The
// `Source.contract.test.ts` `Eq<>` guard pins this to the shared union.
export type IntentSource = SharedIntentSource;

export interface StampedIntent {
  intentId: number;
  source: IntentSource;
  ts: number;
  intent: CanvasIntent;
}

export interface CanvasAdapter<K extends CanvasIntent["kind"] = CanvasIntent["kind"]> {
  kind: K;
  apply: (intent: Extract<CanvasIntent, { kind: K }>) => void | Promise<void>;
}

export interface CanvasOrchestratorApi {
  /** Last successfully applied intent (for diff + telemetry). */
  lastAppliedIntentId: number | null;
  /** Dispatch an intent from any source. Returns the stamped intent. */
  dispatch: (intent: CanvasIntent, source?: IntentSource) => StampedIntent;
  /**
   * Register an adapter for a given intent kind. Replaces a previously
   * registered adapter for the same kind (last registration wins — views
   * register on mount and unregister on unmount).
   */
  registerAdapter: <K extends CanvasIntent["kind"]>(adapter: CanvasAdapter<K>) => () => void;

  // ── post-mvs-cleanup Phase A — chat↔viewer bus ──────────────────────
  //
  // Named convenience channels for cross-side dispatch. They formalize
  // the chat→viewer + viewer→chat seams that previously happened via
  // pointwise wires (component callbacks, ad-hoc store mutations).
  //
  // The legacy `dispatch(intent)` + adapter registry stays — it's the
  // generic surface. These named methods are the curated subset that
  // most cross-side flows go through.

  /**
   * **chat→viewer**: open a citation peek over the current viewer step.
   * Pushes a `{ kind: "citation-peek", documentId, page, bbox? }`
   * overlay onto `viewer.overlays`. The viewer surface renders the
   * peek on top of whatever step is active.
   */
  openCitation: (documentId: string, page: number, bbox?: NormalizedBbox) => void;

  /**
   * **viewer→chat**: announce that a document was just opened in the
   * viewer. Appends an assistant chat message describing the open so
   * the conversation thread carries the user's viewer-side activity
   * (separate from the LLM-context telemetry trail).
   */
  docOpened: (input: { documentId: string; fileName: string }) => void;
}
