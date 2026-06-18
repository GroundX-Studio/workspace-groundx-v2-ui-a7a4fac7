import type { ViewerStep } from "@/contexts/ChatStoreContext";
import type { GateTrigger, Scenario } from "@/types/onboarding";

/**
 * `f3a-save-signin-gate-handoff`: optional discriminator carried on the
 * gate state. Tells post-commit consumers what the user was trying to
 * do when the gate opened so they can pick up the dropped action after
 * sign-in succeeds. `save-schema` is the F3a Save → sign-in → persist
 * → F1 handoff path; future causes can be added without changing the
 * gate API.
 */
export type GateCause = "save-schema";

export type GateStatus =
  | { status: "idle" }
  | { status: "open"; trigger: GateTrigger; openedAt: number; cause?: GateCause }
  | { status: "committed"; method: "register" | "sso" | "engineer-call"; cause?: GateCause }
  | { status: "dismissed"; trigger: GateTrigger; dismissedAt: number; cause?: GateCause };

export interface OnboardingSessionState {
  /** Server-issued session ID — `null` until the anonymous session is bootstrapped. */
  sessionId: string | null;
  /** Active scenario, set when user picks a sample in F1. */
  scenario: Scenario | null;
  /** Gate lifecycle (LC3) — single source of truth for F6. */
  gate: GateStatus;
  /**
   * The report section the builder (f4a) should pre-open its inline editor on.
   * Set by the render→builder `✎ edit §N` hand-off (and the
   * `show_smart_report_edit` tool). `null` when the builder opens with no
   * pre-selection. Cleared whenever the user leaves the builder frame.
   */
  selectedReportSectionId: string | null;
}

export interface OnboardingSessionApi {
  state: OnboardingSessionState;
  bootstrapSession: (sessionId: string) => void;
  pickScenario: (scenario: Scenario) => void;
  /**
   * standardized-viewer-control — advance the onboarding JOURNEY STATE for a
   * destination VIEWER STEP, WITHOUT pushing it (FRAME-FREE; replaced both
   * `advanceFrame` and the old `markFrameReached`). The orchestrator's
   * de-forked `show*`/`editTemplate` handlers (and the `presentExperienceBeat`
   * understand-scanning beat) push the viewer step themselves (the one canvas
   * outcome, both experiences) and call this to layer onboarding
   * journey-progress on top: the resume anchor (`lastStep`) + the reached-stage
   * SET (`reachedStages`) + the journey-advanced event + the integrate gate-pop
   * + the report-builder section pre-select (all read off the step). The
   * ingest-picker return (entity-deactivate) is `returnToIngestPicker`.
   */
  markStageReached: (step: ViewerStep) => void;
  /**
   * standardized-viewer-control deletion-phase — return to the Ingest picker AND
   * deactivate the active entity (the f1 BACKWARD-transition side effects: gate
   * reset, the "left" viewer event, the ingest-picker step push). The
   * `presentExperienceBeat` `ingest-picker` beat handler calls this; the optional
   * `attachedSchema` rides onto the picker step (the F3a Save → sign-in → persist
   * → picker hand-off). Onboarding-only.
   */
  returnToIngestPicker: (attachedSchema?: { schemaId: string; name: string }) => void;
  /**
   * standardized-viewer-control T5 (R1/R6) — the Extract first-reach signal. The
   * orchestrator's `showExtract` handler calls this; it fires `understand.completed`
   * EXACTLY ONCE per session, decided from a synced ref (never a setState-flag).
   * The payload is frame-free (journey stage + active step). Onboarding-only.
   */
  notifyExtractReached: () => void;
  /**
   * Open the F6 gate. Pass `options.cause` to mark the post-commit
   * intent so an effect can fire the dropped action after sign-in
   * succeeds. Today only `"save-schema"` is recognized.
   */
  openGate: (trigger: GateTrigger, options?: { cause?: GateCause }) => void;
  dismissGate: () => void;
  commitGate: (method: "register" | "sso" | "engineer-call") => void;
}
