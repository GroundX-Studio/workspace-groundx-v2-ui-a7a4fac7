import type { AppMode, AuthState, Scenario, UsageCounters } from "@/types/onboarding";

export interface AppModeState {
  mode: AppMode;
  authState: AuthState;
  scenario: Scenario | null;
  usage: UsageCounters;
}

export interface AppModeApi {
  state: AppModeState;
  setScenario: (scenario: Scenario | null) => void;
  promoteToSignedIn: () => void;
  flipToSteady: () => void;
  incrementByoPages: (pages: number) => void;
}
