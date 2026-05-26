import { FC, ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { APP_CONFIG } from "@/appConfig";
import { useAuthContext } from "@/contexts/AuthContext";
import { OnboardingWizard } from "@/views/Onboarding/OnboardingWizard";

import { OnboardingContext } from "./OnboardingContext";

export const ONBOARDING_COMPLETE_STATE = "complete";

export const OnboardingProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { auth, user, updateAppMetadata } = useAuthContext();
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [isDismissedForSession, setIsDismissedForSession] = useState(false);

  const shouldOpen =
    APP_CONFIG.onboarding.enabled &&
    auth.isLoggedIn &&
    Boolean(user) &&
    user?.appMetadata?.onboardingState !== ONBOARDING_COMPLETE_STATE &&
    !isDismissedForSession;

  useEffect(() => {
    if (shouldOpen) {
      setIsOnboardingOpen(true);
      setCurrentStep(0);
    }
  }, [shouldOpen]);

  const next = useCallback(() => {
    setCurrentStep((step) => Math.min(step + 1, APP_CONFIG.onboarding.steps.length - 1));
  }, []);

  const back = useCallback(() => {
    setCurrentStep((step) => Math.max(step - 1, 0));
  }, []);

  const closeWithoutCompleting = useCallback(() => {
    setIsDismissedForSession(true);
    setIsOnboardingOpen(false);
  }, []);

  const finish = useCallback(async () => {
    const result = await updateAppMetadata({ onboardingState: ONBOARDING_COMPLETE_STATE });
    if (result.isSuccess) {
      setIsOnboardingOpen(false);
    }
  }, [updateAppMetadata]);

  const value = useMemo(
    () => ({
      isOnboardingOpen,
      currentStep,
      next,
      back,
      finish,
      closeWithoutCompleting,
    }),
    [back, closeWithoutCompleting, currentStep, finish, isOnboardingOpen, next]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      <OnboardingWizard />
    </OnboardingContext.Provider>
  );
};
