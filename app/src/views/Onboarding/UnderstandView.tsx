import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type FC } from "react";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_PILL,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
  WHITE,
} from "@/constants";
import { useAppMode } from "@/contexts/AppModeContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { useScenarioRegistry } from "@/contexts/ScenarioRegistryContext";

const THINKING_NOTE_INTERVAL_MS = 1100;
const REVEAL_DELAY_MS = 4500;

/**
 * F2 UnderstandView — placeholder PDF surface + scan animation + thinking
 * notes streaming. The real Phase 7 wire-up uses pdfjs-dist for actual page
 * rendering and SSE-streamed thinking notes from the agent.
 *
 * Scan animation per spec:
 *   • Thin horizontal scan-line sweeps top→bottom over 4s, looping.
 *   • Above the line: faint cyan wash (parsed region).
 *   • Reduced-motion fallback: replace with a single 80ms crossfade.
 *
 * After ~4.5s of thinking notes, the "Show me the extract" affordance
 * appears, which advances to F3.
 */
export const UnderstandView: FC = () => {
  const reduceMotion = useReducedMotion();
  const { state: appMode } = useAppMode();
  const { state: session, advanceFrame } = useOnboardingSession();
  const [noteIndex, setNoteIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  // A user can land on F2 without a scenario when they click Sign Up
  // from F1's BYO row — the BYO path advances to F2 + opens the gate
  // but never picks a sample. In that case we render a BYO-specific
  // placeholder instead of falling back to the utility scenario.
  const scenarioId = appMode.scenario ?? session.scenario;
  const { byId } = useScenarioRegistry();
  const scenario = scenarioId ? byId(scenarioId) : undefined;
  const isByoPlaceholder = scenarioId == null;
  const thinkingScript = scenario?.manifest.thinkingScript ?? [];
  const docTitle = scenario?.documents[0]?.fileName ?? "Sample";

  useEffect(() => {
    if (!thinkingScript.length) return;
    if (noteIndex >= thinkingScript.length - 1) return;
    const id = window.setTimeout(() => {
      setNoteIndex((current) => Math.min(current + 1, thinkingScript.length - 1));
    }, THINKING_NOTE_INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [thinkingScript.length, noteIndex]);

  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), REVEAL_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  if (isByoPlaceholder) {
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

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateRows: "auto 1fr auto",
        gap: 2,
        p: { xs: 2, md: 4 },
        height: "100%",
        overflow: "hidden",
      }}
      aria-label="Understand"
    >
      <Stack spacing={0.5}>
        <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
          UNDERSTAND
        </Typography>
        <Typography variant="h4">{docTitle}</Typography>
        <Typography variant="body2" sx={{ color: BODY_TEXT }}>
          GroundX is parsing the document. You'll see the extract in a moment.
        </Typography>
      </Stack>

      <Card
        sx={{
          position: "relative",
          backgroundColor: WHITE,
          overflow: "hidden",
          aspectRatio: "8.5 / 11",
          minHeight: 0,
          maxHeight: "100%",
          mx: "auto",
          width: "100%",
          maxWidth: 560,
        }}
        aria-label="Document preview"
      >
        {/* Placeholder page surface — a clean off-white sheet. Phase 7 plugs
            pdfjs-dist here to render the real first page. Per brand rule
            "no shadows / no non-sanctioned gradients" the placeholder is a
            flat WHITE fill with no overlay. */}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            backgroundColor: WHITE,
          }}
        />
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
        {/* The scan line itself. Two tokens of green flank a cyan core; the
            line is intentionally narrow (2px) to read as a process indicator,
            not a sanctioned brand surface. No box-shadow per the brand
            "flat / no shadows" rule — the line gets visual prominence from
            color contrast against the WHITE page beneath. */}
        {!reduceMotion ? (
          <motion.div
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
        ) : null}
      </Card>

      <Stack spacing={1} aria-live="polite">
        <Typography variant="overline" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_LABEL }}>
          THINKING
        </Typography>
        <Stack
          spacing={0.5}
          sx={{
            border: `1px solid ${BORDER}`,
            borderRadius: BORDER_RADIUS_2X,
            p: 1.5,
            backgroundColor: WHITE,
            maxHeight: 120,
            overflow: "hidden",
          }}
        >
          <AnimatePresence initial={false}>
            {thinkingScript.slice(0, noteIndex + 1).map((note) => (
              <motion.div
                key={note}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <Typography variant="caption" sx={{ color: BODY_TEXT }}>
                  · {note}
                </Typography>
              </motion.div>
            ))}
          </AnimatePresence>
        </Stack>
        <Box>
          {revealed ? (
            <Box
              role="button"
              tabIndex={0}
              data-testid="advance-to-f3"
              onClick={() => advanceFrame("f3")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  advanceFrame("f3");
                }
              }}
              sx={{
                display: "inline-block",
                px: 2,
                py: 1,
                mt: 1,
                borderRadius: BORDER_RADIUS_PILL,
                backgroundColor: GREEN,
                color: NAVY,
                fontWeight: 600,
                cursor: "pointer",
                "&:hover": { filter: "brightness(0.95)" },
              }}
            >
              Show me the extract →
            </Box>
          ) : null}
        </Box>
      </Stack>
    </Box>
  );
};
