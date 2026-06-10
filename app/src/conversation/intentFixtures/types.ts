import type { ChatReply } from "@/api/chatSessions";
import type { CanvasIntent } from "@/contexts/CanvasOrchestratorContext";
import type { CanvasIntentKind } from "@groundx/shared/intent-catalog";

/**
 * A read-only view of the canvas/chat SINK state after a fixture fires.
 * Every field has ≥1 fixture asserting it (no dormant plumbing).
 */
export interface DocViewerStepView {
  documentId: string;
  /** The doc-viewer step's page — optional on the step, so may be undefined. */
  page: number | undefined;
  hasHighlight: boolean;
  hasBbox: boolean;
  litRegionCount: number;
}

export interface OverlayView {
  pendingProposals: number;
  addedFields: number;
  editedIds: string[];
  removedIds: string[];
}

export interface HarnessState {
  /** The active `doc-viewer` step (highlightCitation / jumpToPage / showCitations). */
  docViewerStep: DocViewerStepView | null;
  /** OnboardingSession current frame (showExtract/Integrate/Report/editTemplate/switchFrame). */
  frame: string | null;
  /** OnboardingSession gate status (openGate/commitGate/dismissGate). */
  gateStatus: string | null;
  /** Schema proposal overlay (proposeSchemaField / accept / reject). */
  schemaOverlay: OverlayView;
  /** Report section overlay (propose/accept/reject/edit/delete report section). */
  reportOverlay: OverlayView;
  /** `?bookCall=1` set on the URL (openBookCall). */
  bookCallActive: boolean;
  /** Kind captured by the spy adapter registered for the fixture (adapter-routed kinds). */
  adapterCapturedKind: string | null;
}

/** Live read access for `script` triggers (to seed + read generated ids). */
export interface ScriptContext {
  dispatch: (intent: CanvasIntent, source: "user" | "agent" | "tour") => void;
  /** The active ChatStore session (raw) — read generated proposal ids etc. */
  getSession: () => unknown;
  /** Await a tick so React flushes the prior dispatch's state + re-renders. */
  flush: () => Promise<void>;
}

/**
 * How the fixture is fired:
 *   • `reply`    — canned `ChatReply` through the REAL `useConversation` derivation
 *                  (P1 citations / P4 reply.intents) via the `makeFakeApi` seam.
 *   • `dispatch` — a direct `dispatch(intent, source)` for UI-originated kinds.
 *   • `script`   — programmatic multi-step (seed then mutate) for accept/reject
 *                  kinds that operate on a pre-existing entity.
 */
export type IntentTrigger =
  | { via: "reply"; reply: ChatReply }
  | { via: "dispatch"; intent: CanvasIntent; source: "user" | "agent" | "tour" }
  | { via: "script"; run: (ctx: ScriptContext) => void | Promise<void> };

export interface IntentFixture {
  kind: CanvasIntentKind;
  trigger: IntentTrigger;
  /** Throws (via `assert`) if the resulting SINK state is wrong. No vitest. */
  assert: (state: HarnessState) => void;
}
