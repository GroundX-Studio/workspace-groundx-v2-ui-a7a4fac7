import { createContext } from "react";

export interface OnboardingContextI {
  isOnboardingOpen: boolean;
  currentStep: number;
  next: () => void;
  back: () => void;
  finish: () => Promise<void>;
  closeWithoutCompleting: () => void;
}

export const OnboardingContext = createContext<OnboardingContextI | undefined>(undefined);
