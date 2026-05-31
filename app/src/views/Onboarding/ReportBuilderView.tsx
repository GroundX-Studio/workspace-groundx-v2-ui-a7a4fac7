/**
 * ReportBuilderView — the f4a (S3a) Report **builder** route.
 *
 * PLACEHOLDER ONLY (2026-05-29-smart-report-screen Phase 3). The real builder
 * — `SmartReportBuilder` reusing the F3a schema-editor chrome + the
 * `PendingSchemaOverlay`→`PendingTemplateOverlay` generalization — is Phase 4
 * (cross-plan execution step 16). This view exists so the f4 → f4a edit
 * affordance + the f4a → f4 back affordance route correctly now; it is NOT a
 * standalone implementation and will be replaced by the thin wrapper that
 * mounts the production builder widget.
 */

import Box from "@mui/material/Box";
import { type FC, useCallback } from "react";

import {
  BODY_TEXT,
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_LABEL,
  NAVY,
  WHITE,
} from "@/constants";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";

export const ReportBuilderView: FC = () => {
  const { advanceFrame } = useOnboardingSession();

  // f4a → f4 back (builder-only). Mirrors the Extract f3a → f3 back.
  const handleBack = useCallback(() => {
    advanceFrame("f4");
  }, [advanceFrame]);

  return (
    <Box
      data-testid="report-builder-view"
      sx={{
        height: "100%",
        backgroundColor: WHITE,
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      <Box
        component="button"
        type="button"
        data-testid="report-builder-back"
        onClick={handleBack}
        sx={{
          alignSelf: "flex-start",
          border: "none",
          background: "none",
          cursor: "pointer",
          color: NAVY,
          fontWeight: FONT_WEIGHT_LABEL,
          fontSize: FONT_SIZE_CAPTION,
          p: 0,
          "&:focus-visible": { outline: `2px solid ${NAVY}` },
        }}
      >
        ← back
      </Box>
      <Box sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_CAPTION }}>
        Report builder (S3a) — section editor lands in Phase 4.
      </Box>
    </Box>
  );
};

export default ReportBuilderView;
