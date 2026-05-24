/**
 * F2 UnderstandView — canvas surface during document processing.
 *
 * Per spec-chapters.jsx · Flow_Processing the canvas hosts:
 *
 *   • LIVE PARSE label row: "LIVE PARSE · <filename>" + animated
 *     progress bar + "processing…" status.
 *   • PDF page silhouette with the scan-line animation overlay
 *     (cyan wash above the line, gradient scan line sweeping top→bottom).
 *   • Page thumbnails strip showing parse progress per page
 *     (first page "parsing", subsequent pages "queued").
 *
 * The narrative content — the streaming "thinking notes", the
 * "Done. Ready to analyze." beat, the Pick-a-view affordance — lives
 * in OnboardingChatColumn. This view is purely the visual proof that
 * GroundX is doing the work; the chat is where the agent talks.
 *
 * BYO branch (no scenario picked) still renders a sign-in placeholder
 * — this only surfaces if a frame transitions to F2 without an active
 * entity, defensive against an edge case the gate flow normally guards.
 */

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { keyframes } from "@mui/material/styles";
import { motion, useReducedMotion } from "framer-motion";
import type { FC } from "react";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";

export interface UnderstandViewProps {
  /**
   * Override the scenario id read from session/appMode context. Used by
   * the OnboardingShell during the F2->F1 slide-out so the canvas can
   * show what was just there, not what session state has flipped to.
   */
  overrideScenarioId?: string | null;
}

export const UnderstandView: FC<UnderstandViewProps> = ({ overrideScenarioId }) => {
  const reduceMotion = useReducedMotion();
  const { state: appMode } = useAppMode();
  const { state: session } = useOnboardingSession();
  const scenarioId =
    overrideScenarioId !== undefined
      ? overrideScenarioId
      : appMode.scenario ?? session.scenario;
  const { byId } = useScenarioRegistry();
  const scenario = scenarioId ? byId(scenarioId) : undefined;

  // BYO branch — no scenario picked yet. The chat column carries the
  // gate / sign-in flow; the canvas just shows orientation copy.
  if (!scenario) {
    return (
      <Box
        sx={{
          p: { xs: 3, md: 5 },
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 1,
          maxWidth: 560,
          mx: "auto",
        }}
        aria-label="Understand · sign in to upload"
      >
        <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
          UNDERSTAND
        </Typography>
        <Typography variant="h4">Sign in to start uploading your own docs.</Typography>
        <Typography variant="body1" sx={{ color: BODY_TEXT, mt: 1 }}>
          Once you're signed in, this surface streams the same parse + extract
          experience over your documents. Use the chat column to send a magic
          link, log in with SSO, or book a call with an engineer.
        </Typography>
      </Box>
    );
  }

  const docTitle = scenario.documents[0]?.fileName ?? "Sample";
  const pageCount = scenario.documents[0]?.pageCount ?? 3;
  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <Box
      data-testid="understand-canvas"
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        backgroundColor: WHITE,
      }}
      aria-label="Understand"
    >
      {/* LIVE PARSE row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: { xs: 2, md: 3 },
          py: 1.25,
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <Typography
          data-testid="understand-live-parse-label"
          variant="caption"
          sx={{
            color: NAVY,
            letterSpacing: LETTER_SPACING_LABEL,
            fontWeight: FONT_WEIGHT_HEADLINE,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          LIVE PARSE · {docTitle}
        </Typography>
        <ProgressBar reduceMotion={!!reduceMotion} />
        <Typography
          data-testid="understand-processing-status"
          variant="caption"
          sx={{ color: NAVY, fontWeight: FONT_WEIGHT_HEADLINE, fontStyle: "italic", whiteSpace: "nowrap" }}
        >
          processing…
        </Typography>
      </Box>

      {/* PDF silhouette + scan animation */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          px: { xs: 2, md: 3 },
          py: 2,
          overflow: "hidden",
        }}
      >
        <Card
          data-testid="understand-pdf-card"
          sx={{
            position: "relative",
            backgroundColor: WHITE,
            overflow: "hidden",
            aspectRatio: "8.5 / 11",
            minHeight: 0,
            maxHeight: "100%",
            width: "100%",
            maxWidth: 560,
            boxShadow: "none",
            border: `1px solid ${BORDER}`,
          }}
          aria-label="Document preview"
        >
          {/* Page silhouette content lines — visual filler for the
              flat-WHITE PDF placeholder until pdfjs-dist plugs in. */}
          <SilhouetteContent />
          {/* Parsed-region wash above the scan line */}
          <motion.div
            aria-hidden
            initial={{ height: "0%" }}
            animate={reduceMotion ? { height: "100%" } : { height: ["0%", "100%"] }}
            transition={reduceMotion ? { duration: 0.08 } : { duration: 4, ease: "linear", repeat: Infinity }}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              backgroundColor: CYAN,
              opacity: 0.18,
            }}
          />
          {/* The scan line itself */}
          {!reduceMotion ? (
            <motion.div
              data-testid="understand-scan-line"
              aria-hidden
              initial={{ top: "0%" }}
              animate={{ top: ["0%", "100%"] }}
              transition={{ duration: 4, ease: "linear", repeat: Infinity }}
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                height: 2,
                background: `linear-gradient(90deg, ${GREEN}, ${CYAN}, ${GREEN})`,
                zIndex: 2,
              }}
            />
          ) : (
            <Box data-testid="understand-scan-line" aria-hidden sx={{ display: "none" }} />
          )}
        </Card>
      </Box>

      {/* Page thumbnails strip */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          gap: 1,
          px: { xs: 2, md: 3 },
          py: 1.5,
          borderTop: `1px solid ${BORDER}`,
        }}
        aria-label="Pages"
      >
        {pages.map((n, idx) => (
          <PageThumb key={n} pageNumber={n} state={idx === 0 ? "parsing" : "queued"} />
        ))}
      </Box>
    </Box>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────

const slideRight = keyframes`
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(0); }
`;

const ProgressBar: FC<{ reduceMotion: boolean }> = ({ reduceMotion }) => (
  <Box
    data-testid="understand-progress-bar"
    role="progressbar"
    aria-label="Document parse progress"
    aria-valuenow={62}
    aria-valuemin={0}
    aria-valuemax={100}
    sx={{
      flex: 1,
      position: "relative",
      height: 5,
      borderRadius: BORDER_RADIUS_PILL,
      backgroundColor: BORDER,
      overflow: "hidden",
    }}
  >
    <Box
      sx={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: "62%",
        background: `linear-gradient(90deg, ${GREEN}, ${CYAN})`,
        // A short sweep-in motion at mount so the bar reads as live;
        // disabled under prefers-reduced-motion.
        animation: reduceMotion ? "none" : `${slideRight} 1.2s ease-out`,
      }}
    />
  </Box>
);

const PageThumb: FC<{ pageNumber: number; state: "parsing" | "queued" }> = ({ pageNumber, state }) => (
  <Box
    data-testid={`understand-page-thumb-${pageNumber}`}
    data-state={state}
    sx={{
      width: 44,
      height: 56,
      backgroundColor: WHITE,
      border: `1.5px solid ${state === "parsing" ? NAVY : BORDER}`,
      borderRadius: BORDER_RADIUS_SM,
      position: "relative",
      opacity: state === "queued" ? 0.55 : 1,
      boxShadow: state === "parsing" ? `0 0 0 3px rgba(161, 236, 131, 0.4)` : "none",
    }}
    aria-label={`Page ${pageNumber} · ${state}`}
  >
    {/* Tiny content lines so the thumb reads as a page */}
    <Box sx={{ position: "absolute", top: 4, left: 4, right: 4, height: 2, backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
    <Box sx={{ position: "absolute", top: 10, left: 4, right: 4, height: 1.5, backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
    <Box sx={{ position: "absolute", top: 14, left: 4, right: 8, height: 1.5, backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
    <Typography
      variant="caption"
      sx={{
        position: "absolute",
        bottom: 3,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 9,
        fontWeight: FONT_WEIGHT_HEADLINE,
        color: NAVY,
      }}
    >
      p.{pageNumber}
    </Typography>
  </Box>
);

const SilhouetteContent: FC = () => (
  <Stack
    aria-hidden
    spacing={1}
    sx={{
      position: "absolute",
      inset: 0,
      p: { xs: 2, md: 3 },
      opacity: 0.4,
    }}
  >
    <Box sx={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
      <Box sx={{ height: 14, width: "32%", backgroundColor: MUTED_ON_LIGHT, borderRadius: BORDER_RADIUS_SM }} />
      <Box sx={{ height: 8, width: "20%", backgroundColor: BORDER, borderRadius: BORDER_RADIUS_SM }} />
    </Box>
    <Box sx={{ height: 5, width: "60%", backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
    <Box sx={{ height: 5, width: "70%", backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
    <Box sx={{ height: 5, width: "40%", backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
    <Box sx={{ border: `1px solid ${BORDER}`, p: 0.75, mt: 0.5 }}>
      {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
        <Box key={row} sx={{ display: "flex", gap: 0.75, mb: 0.5 }}>
          <Box sx={{ height: 4, flex: 2, backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
          <Box sx={{ height: 4, flex: 1, backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
          <Box sx={{ height: 4, flex: 1, backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
          <Box sx={{ height: 4, flex: 1, backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
        </Box>
      ))}
    </Box>
    <Box sx={{ height: 5, width: "55%", backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
    <Box sx={{ height: 5, width: "75%", backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
    <Box sx={{ height: 5, width: "45%", backgroundColor: BORDER, borderRadius: BORDER_RADIUS_PILL }} />
  </Stack>
);
