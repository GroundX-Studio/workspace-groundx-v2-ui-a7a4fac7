/**
 * OnboardingFlow — the chat-driven onboarding product surface (pre-auth).
 *
 * Lays out the app shell: NavRail on the left, a step-strip top bar, and a body
 * that switches between the full-width P1 Ingest screen and the P2+ split
 * (chat | canvas). This is the foundation slice; later frames (P3–P7, gate,
 * Calendly, integrate) plug into the same shell.
 */

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Stack from "@mui/material/Stack";
import { Helmet } from "react-helmet-async";

import { getPageTitle } from "@/appConfig";
import { BORDER, FONT_WEIGHT_LABEL, MAIN_BACKGROUND, NAVY, WHITE } from "@/constants";

import { NavRail } from "./components/NavRail";
import { SplitLayout } from "./components/SplitLayout";
import { StepStrip } from "./components/StepStrip";
import { FlowProvider, useFlow } from "./flow/FlowContext";
import { P1Ingest } from "./screens/P1Ingest";

const OnboardingFlowInner = () => {
  const { step, activePhase, openGate, showIntegrate } = useFlow();
  const isIngest = step === "P1";

  return (
    <Box sx={{ display: "flex", height: "100vh", width: "100%", backgroundColor: MAIN_BACKGROUND, overflow: "hidden" }}>
      <NavRail />

      <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        {/* Step-strip top bar */}
        <Stack
          direction="row"
          alignItems="center"
          spacing={2}
          sx={{
            px: { xs: 2, md: 3 },
            py: 1.25,
            borderBottom: `1px solid ${BORDER}`,
            backgroundColor: WHITE,
            minHeight: 56,
          }}
        >
          <StepStrip activePhase={activePhase} onIntegrate={isIngest ? undefined : showIntegrate} />
          <Box sx={{ flex: 1 }} />
          {/* Opens the inline gate in the split; on P1 the bring-your-own CTAs handle sign-up. */}
          <ButtonBase
            onClick={isIngest ? undefined : openGate}
            disableRipple
            sx={{ fontSize: 13, fontWeight: FONT_WEIGHT_LABEL, color: NAVY, px: 1, py: 0.5, borderRadius: 1 }}
          >
            Sign in
          </ButtonBase>
        </Stack>

        {/* Body */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: isIngest ? "auto" : "hidden" }}>
          {isIngest ? <P1Ingest /> : <SplitLayout />}
        </Box>
      </Box>
    </Box>
  );
};

export function OnboardingFlow() {
  return (
    <FlowProvider>
      <Helmet>
        <title>{getPageTitle("Get started")}</title>
      </Helmet>
      <OnboardingFlowInner />
    </FlowProvider>
  );
}

export default OnboardingFlow;
