import type { FFrame, GateTrigger, Scenario } from "@/types/onboarding";

export type GateStatus =
  | { status: "idle" }
  | { status: "open"; trigger: GateTrigger; openedAt: number }
  | { status: "committed"; method: "magic-link" | "sso" | "engineer-call" }
  | { status: "dismissed"; trigger: GateTrigger; dismissedAt: number };

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
  openGate: (trigger: GateTrigger) => void;
  dismissGate: () => void;
  commitGate: (method: "magic-link" | "sso" | "engineer-call") => void;
}
