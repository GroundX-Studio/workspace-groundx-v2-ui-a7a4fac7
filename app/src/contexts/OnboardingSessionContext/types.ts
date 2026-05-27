import type { FFrame, GateTrigger, Scenario } from "@/types/onboarding";

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
  /** Current F-series frame the user is on. */
  currentFrame: FFrame;
  /** Frames the user has successfully completed (for step strip ✓ states). */
  completedFrames: ReadonlySet<FFrame>;
  /** Active scenario, set when user picks a sample in F1. */
  scenario: Scenario | null;
  /** Gate lifecycle (LC3) — single source of truth for F6. */
  gate: GateStatus;
}

export interface OnboardingSessionApi {
  state: OnboardingSessionState;
  bootstrapSession: (sessionId: string) => void;
  pickScenario: (scenario: Scenario) => void;
  advanceFrame: (frame: FFrame) => void;
  /**
   * Open the F6 gate. Pass `options.cause` to mark the post-commit
   * intent so an effect can fire the dropped action after sign-in
   * succeeds. Today only `"save-schema"` is recognized.
   */
  openGate: (trigger: GateTrigger, options?: { cause?: GateCause }) => void;
  dismissGate: () => void;
  commitGate: (method: "register" | "sso" | "engineer-call") => void;
}
