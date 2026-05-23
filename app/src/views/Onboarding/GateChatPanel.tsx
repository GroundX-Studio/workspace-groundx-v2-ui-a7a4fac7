/**
 * GateChatPanel — the chat-column body for F2 onwards.
 *
 * When the gate is idle, this is just the "Ask anything about the
 * sample…" placeholder. When the gate transitions to `"open"` (e.g. via
 * the F1 BYO Sign Up trigger or a save/export gate), the panel first
 * shows a typing indicator for a brief "composing" beat, then fades in
 * the GateView as if the AI bot just sent a chat message.
 *
 * The animation is quiet per brand: a ~600ms typing pause, a subtle
 * 8px upward translate + opacity fade on the GateView mount. No bounce,
 * no spring. Respects `prefers-reduced-motion` by skipping both the
 * delay and the motion translate.
 *
 * If the gate is already in `"committed"` state on mount (e.g. the user
 * resumes a session post-signin), the typing animation is skipped — the
 * committed view renders immediately. The animation is reserved for
 * the first time the gate becomes open in this session.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type FC } from "react";

import {
  BODY_TEXT,
  FONT_WEIGHT_LABEL,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
} from "@/constants";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { LoadingDots } from "@/shared/components/LoadingDots";

import { GateView } from "./GateView";

/** Composing-delay duration in ms. Calibrated to feel like a quick bot reply. */
const COMPOSING_DELAY_MS = 600;

/**
 * Idle copy when no gate is active — the chat column's "ready for your
 * question" placeholder. Lives here so the OnboardingShell can stay
 * thin.
 */
const IdleChatPlaceholder: FC = () => (
  <Stack spacing={1}>
    <Typography
      variant="overline"
      sx={{
        color: NAVY,
        letterSpacing: LETTER_SPACING_LABEL,
        fontWeight: FONT_WEIGHT_LABEL,
      }}
    >
      CHAT
    </Typography>
    <Typography variant="body2" sx={{ color: MUTED_ON_LIGHT }}>
      Ask anything about the sample. Citations appear next to every answer.
    </Typography>
  </Stack>
);

const TypingIndicator: FC = () => (
  <Box
    data-testid="gate-typing-indicator"
    sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}
  >
    <Typography variant="caption" sx={{ color: BODY_TEXT }}>
      GroundX is composing
    </Typography>
    <LoadingDots size={5} aria-label="GroundX is composing a response" />
  </Box>
);

export const GateChatPanel: FC = () => {
  const { state: session } = useOnboardingSession();
  const status = session.gate.status;
  const reduceMotion = useReducedMotion();

  // `composed` flips to true after the typing-indicator delay. Skipping
  // the delay entirely when status starts at "committed" (resumed
  // session) or when reduced-motion is on (accessibility).
  const [composed, setComposed] = useState<boolean>(
    () => status === "committed" || Boolean(reduceMotion),
  );

  useEffect(() => {
    if (status !== "open" && status !== "committed") {
      // Gate left the active region — reset for the next open. This is
      // how a dismiss → re-trigger replays the typing animation.
      setComposed(false);
      return;
    }
    if (status === "committed") {
      // Already committed — no animation needed.
      setComposed(true);
      return;
    }
    if (composed) return;
    if (reduceMotion) {
      setComposed(true);
      return;
    }
    const id = window.setTimeout(() => setComposed(true), COMPOSING_DELAY_MS);
    return () => window.clearTimeout(id);
  }, [status, composed, reduceMotion]);

  if (status !== "open" && status !== "committed") {
    return <IdleChatPlaceholder />;
  }

  if (!composed) {
    return <TypingIndicator />;
  }

  return (
    <motion.div
      key="gate-fade-in"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <GateView />
    </motion.div>
  );
};
