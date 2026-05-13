import { useContext } from "react";

import { OnboardingContext, OnboardingContextI } from "./OnboardingContext";

export const useOnboardingContext = (): OnboardingContextI => {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error("useOnboardingContext must be used inside an OnboardingProvider");
  return context;
};
