import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { darken } from "@mui/material/styles";
import { useEffect, useRef, useState, type FC, type ReactNode } from "react";

import { BORDER, BORDER_RADIUS, FONT_WEIGHT_HEADLINE, NAVY, WHITE } from "@/constants";
import { initAnalytics } from "@/lib/analytics";
import { gaSetDefaults, initGa } from "@/lib/ga";

export const ANALYTICS_CONSENT_STORAGE_KEY = "gx.analyticsConsent.v1";

type ConsentState = "accepted" | null;

export interface AnalyticsConsentConfig {
  posthogApiKey?: string | null;
  posthogHost?: string | null;
  gaMeasurementId?: string | null;
  llmProvider?: string | null;
}

export interface AnalyticsConsentProviderProps {
  children: ReactNode;
  config?: AnalyticsConsentConfig;
}

function defaultConfig(): AnalyticsConsentConfig {
  return {
    posthogApiKey: import.meta.env.VITE_POSTHOG_API_KEY,
    posthogHost: import.meta.env.VITE_POSTHOG_HOST,
    gaMeasurementId: import.meta.env.VITE_GA_MEASUREMENT_ID,
    llmProvider: import.meta.env.VITE_LLM_PROVIDER,
  };
}

function readConsent(): ConsentState {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY) === "accepted"
      ? "accepted"
      : null;
  } catch {
    return null;
  }
}

function persistAcceptedConsent(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, "accepted");
  } catch {
    // Storage failures should not block app usage; the banner may reappear.
  }
}

export const AnalyticsConsentProvider: FC<AnalyticsConsentProviderProps> = ({
  children,
  config,
}) => {
  const resolved = config ?? defaultConfig();
  const posthogApiKey = resolved.posthogApiKey ?? undefined;
  const posthogHost = resolved.posthogHost ?? undefined;
  const gaMeasurementId = resolved.gaMeasurementId ?? undefined;
  const llmProvider = resolved.llmProvider ?? undefined;
  const hasConfiguredTracker = Boolean(posthogApiKey || gaMeasurementId);

  const [consent, setConsent] = useState<ConsentState>(() => readConsent());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!hasConfiguredTracker || consent !== "accepted" || initializedRef.current) return;

    initializedRef.current = true;
    if (posthogApiKey) initAnalytics(posthogApiKey, posthogHost);
    if (gaMeasurementId) {
      initGa(gaMeasurementId);
      if (llmProvider) gaSetDefaults({ llmProvider });
    }
  }, [consent, gaMeasurementId, hasConfiguredTracker, llmProvider, posthogApiKey, posthogHost]);

  const showBanner = hasConfiguredTracker && consent !== "accepted";

  return (
    <>
      {children}
      {showBanner ? (
        <Box
          role="region"
          aria-label="Analytics consent"
          sx={{
            position: "fixed",
            zIndex: (theme) => theme.zIndex.snackbar,
            left: { xs: 12, sm: 24 },
            right: { xs: 12, sm: 24 },
            bottom: { xs: 12, sm: 24 },
            maxWidth: 720,
            mx: "auto",
            p: { xs: 1.5, sm: 2 },
            bgcolor: WHITE,
            border: `1px solid ${BORDER}`,
            borderRadius: BORDER_RADIUS,
            boxShadow: "0 18px 44px rgba(41, 51, 92, 0.14)",
          }}
        >
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ xs: "stretch", sm: "center" }}
            justifyContent="space-between"
          >
            <Typography variant="body2" sx={{ color: NAVY, lineHeight: 1.45 }}>
              Help us improve GroundX Studio with lightweight product analytics. No
              analytics provider loads until you allow it.
            </Typography>
            <Box
              component="button"
              type="button"
              onClick={() => {
                persistAcceptedConsent();
                setConsent("accepted");
              }}
              sx={{
                flexShrink: 0,
                minHeight: 40,
                px: 2,
                border: 0,
                borderRadius: BORDER_RADIUS,
                bgcolor: NAVY,
                color: WHITE,
                cursor: "pointer",
                font: "inherit",
                fontWeight: FONT_WEIGHT_HEADLINE,
                whiteSpace: "nowrap",
                "&:hover": { bgcolor: darken(NAVY, 0.2) },
                "&:focus-visible": {
                  outline: "2px solid #7f96ff",
                  outlineOffset: 2,
                },
              }}
            >
              Allow analytics
            </Box>
          </Stack>
        </Box>
      ) : null}
    </>
  );
};
