import { createContext, useContext, type FC, type ReactNode } from "react";

import type { OnboardingSkillState } from "./types";

const STUB_STATE: OnboardingSkillState = { loaded: false };

const OnboardingSkillContext = createContext<OnboardingSkillState>(STUB_STATE);

interface OnboardingSkillProviderProps {
  children: ReactNode;
}

export const OnboardingSkillProvider: FC<OnboardingSkillProviderProps> = ({ children }) => {
  return <OnboardingSkillContext.Provider value={STUB_STATE}>{children}</OnboardingSkillContext.Provider>;
};

export const useOnboardingSkill = (): OnboardingSkillState => {
  return useContext(OnboardingSkillContext);
};
