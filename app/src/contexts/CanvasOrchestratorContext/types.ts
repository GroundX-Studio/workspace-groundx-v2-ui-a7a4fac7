import type { ContentScope, Scenario } from "@/types/onboarding";

/**
 * CanvasIntent — discriminated union of every command the canvas can receive.
 *
 * Three intent sources converge (user UI events / agent tool calls / tour
 * state machine), all stamped with `source` and a monotonic `intentId` so the
 * middleware reducer can establish total order. Server-wins on conflict.
 *
 * Extend this union by adding a new variant + registering a matching
 * `CanvasAdapter` via `registerAdapter`. Zod validation guards the wire format
 * at the middleware boundary; the discriminated union enforces compile-time
 * exhaustiveness inside the app.
 */
export type CanvasIntent =
  | { kind: "showSample"; scenario: Scenario }
  | { kind: "openDocument"; documentId: string; page?: number }
  | { kind: "highlightCitation"; documentId: string; page: number; bbox?: { x: number; y: number; w: number; h: number } }
  /**
   * widget-llm-integration Phase 4 — lighter-weight cousin of
   * `highlightCitation`. Same viewer-step push/swap, but no
   * `bbox` highlight. Produced by `PdfViewer.jump_to_page` (LLM
   * tool) and by future page-navigation affordances inside the
   * viewer pane itself.
   */
  | { kind: "jumpToPage"; documentId: string; page: number }
  | { kind: "showExtract"; scope: ContentScope; schemaId: string }
  | { kind: "editSchema"; schemaId: string }
  | { kind: "showReport"; templateId: string; scope: ContentScope }
  | { kind: "editTemplate"; templateId: string }
  | { kind: "openGate"; trigger: "save" | "export" | "byo" | "threshold" }
  | { kind: "switchFrame"; frame: import("@/types/onboarding").FFrame }
  /**
   * widget-llm-integration follow-up B.1 — schema-field proposal
   * (the LLM-proposed addition). Replaces the fenced-JSON
   * `proposedSchemaField` envelope. The orchestrator handler
   * routes to `ChatStore.enqueueFieldProposal` so the chat scroll
   * + canvas-side ProposalCard both surface the proposal.
   */
  | {
      kind: "proposeSchemaField";
      categoryId: string;
      name: string;
      type: "STRING" | "NUMBER" | "DATE" | "BOOLEAN";
      description: string;
    }
  /**
   * widget-llm-integration follow-up B.1 — accept a queued
   * proposal. The orchestrator handler routes to
   * `ChatStore.acceptFieldProposal(proposalId)`.
   */
  | { kind: "acceptSchemaField"; proposalId: string }
  /**
   * widget-llm-integration follow-up B.1 — reject a queued
   * proposal. The orchestrator handler routes to
   * `ChatStore.dismissFieldProposal(proposalId)`.
   */
  | { kind: "rejectSchemaField"; proposalId: string }
  /**
   * widget-llm-integration follow-up B.2 — commit the sign-up
   * gate via a specific method. Orchestrator routes to
   * `OnboardingSessionContext.commitGate(method)`.
   */
  | { kind: "commitGate"; method: "register" | "sso" | "engineer-call" }
  /**
   * widget-llm-integration follow-up B.2 — dismiss the sign-up
   * gate. Orchestrator routes to `OnboardingSessionContext.dismissGate()`.
   */
  | { kind: "dismissGate" }
  /**
   * widget-llm-integration follow-up B.3 — open the Book Call
   * surface by setting `?bookCall=1` on the URL. The
   * OnboardingShell already watches this param to mount
   * `BookCallView` + `BookingStatusCard`. The orchestrator
   * handler manipulates `window.location.search` directly.
   */
  | { kind: "openBookCall" };

export type IntentSource = "user" | "agent" | "tour";

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
  openCitation: (documentId: string, page: number, bbox?: { x: number; y: number; w: number; h: number }) => void;

  /**
   * **viewer→chat**: announce that a document was just opened in the
   * viewer. Appends an assistant chat message describing the open so
   * the conversation thread carries the user's viewer-side activity
   * (separate from the LLM-context telemetry trail).
   */
  docOpened: (input: { documentId: string; fileName: string }) => void;
}
