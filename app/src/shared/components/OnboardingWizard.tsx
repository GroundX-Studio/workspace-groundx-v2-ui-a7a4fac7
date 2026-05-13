import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MobileStepper from "@mui/material/MobileStepper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { APP_CONFIG, AppOnboardingStepConfig } from "@/appConfig";
import { CommonCancelButton } from "@/shared/components/CommonCancelButton";
import { CommonSubmitButton } from "@/shared/components/CommonSubmitButton";
import { useOnboardingContext } from "@/contexts/OnboardingContext";
import { BODY_TEXT, BORDER, BORDER_RADIUS_CARD, FONT_WEIGHT_LABEL, NAVY, PADDING } from "@/constants";

export interface OnboardingWizardProps {
  steps?: AppOnboardingStepConfig[];
}

export function OnboardingWizard({ steps = APP_CONFIG.onboarding.steps }: OnboardingWizardProps) {
  const { isOnboardingOpen, currentStep, next, back, finish, closeWithoutCompleting } = useOnboardingContext();
  const safeStepIndex = Math.min(currentStep, Math.max(steps.length - 1, 0));
  const step = steps[safeStepIndex];
  const isFirstStep = safeStepIndex === 0;
  const isLastStep = safeStepIndex === steps.length - 1;

  if (!APP_CONFIG.onboarding.enabled || steps.length === 0 || !step) return null;

  return (
    <Dialog
      open={isOnboardingOpen}
      onClose={closeWithoutCompleting}
      fullWidth
      maxWidth="sm"
      aria-labelledby="onboarding-wizard-title"
    >
      <DialogTitle id="onboarding-wizard-title" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
        Welcome to {APP_CONFIG.appName}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Box
            sx={{
              border: `1px solid ${BORDER}`,
              borderRadius: BORDER_RADIUS_CARD,
              p: PADDING,
            }}
          >
            <Typography variant="overline" sx={{ color: BODY_TEXT, fontWeight: FONT_WEIGHT_LABEL }}>
              Step {safeStepIndex + 1} of {steps.length}
            </Typography>
            <Typography variant="h5" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL, mt: 0.5 }}>
              {step.title}
            </Typography>
            <Typography variant="body1" sx={{ mt: 1 }}>
              {step.body}
            </Typography>
            {step.routeHint && (
              <Typography variant="body2" sx={{ mt: 1.5, color: NAVY }}>
                {step.routeHint}
              </Typography>
            )}
            {step.educationLabel && (
              <Typography variant="caption" sx={{ display: "block", color: BODY_TEXT, mt: 1.5 }}>
                {step.educationLabel}
              </Typography>
            )}
          </Box>
          <MobileStepper
            variant="dots"
            steps={steps.length}
            position="static"
            activeStep={safeStepIndex}
            nextButton={<span />}
            backButton={<span />}
            sx={{
              backgroundColor: "transparent",
              justifyContent: "center",
              p: 0,
            }}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: PADDING, pb: PADDING, flexWrap: "wrap", gap: 1 }}>
        <CommonCancelButton onClick={closeWithoutCompleting}>Not now</CommonCancelButton>
        <CommonCancelButton onClick={back} disabled={isFirstStep}>
          Back
        </CommonCancelButton>
        {isLastStep ? (
          <CommonSubmitButton onClick={() => void finish()} isUppercase={false}>
            Finish
          </CommonSubmitButton>
        ) : (
          <CommonSubmitButton onClick={next} isUppercase={false}>
            {step.primaryActionLabel ?? "Next"}
          </CommonSubmitButton>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default OnboardingWizard;
