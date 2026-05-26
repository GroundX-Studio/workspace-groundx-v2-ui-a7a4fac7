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
import { useCallback, useEffect, useState, type FC } from "react";

import {
  BODY_TEXT,
  FONT_WEIGHT_LABEL,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
} from "@/constants";
import { useChatStore } from "@/contexts/ChatStoreContext";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import { LoadingDots } from "@/components/primitives/LoadingDots/LoadingDots";

/**
 * Persisted "the gate has already finished composing for this anon
 * user" flag. Keyed by ChatStore.ownerKey so a different anon user
 * (e.g. a fresh incognito session) still sees the typing
 * animation the first time. The composing beat is part of the
 * agent-typing-back UX — it shouldn't replay every time the user
 * navigates back to F1 and re-clicks Sign Up.
 */
const COMPOSED_STORAGE_KEY_PREFIX = "groundx-onboarding.gate-composed.";

function useGateComposedPersisted(ownerKey: string): [boolean, () => void] {
  const storageKey = `${COMPOSED_STORAGE_KEY_PREFIX}${ownerKey}`;
  const [composed, setComposed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });
  const markComposed = useCallback(() => {
    setComposed(true);
    try {
      window.localStorage.setItem(storageKey, "true");
    } catch {
      // localStorage disabled — in-memory state still works for the
      // current session; replay across reload is the worst case.
    }
  }, [storageKey]);
  return [composed, markComposed];
}

import { GateChatRail } from "@/components/chat-widgets/GateChatRail/GateChatRail";

/**
 * Composing-delay duration by trigger.
 *
 *   - "save" / "export" / "threshold": the gate interrupts an in-progress
 *     conversation. Short pause (~600ms) keeps the flow snappy.
 *   - "byo": the gate IS the destination. User just clicked Sign Up from
 *     F1 with no prior chat context. A short pause feels rushed; the
 *     longer beat (~1500ms) lets the bot's "thinking" read as a real
 *     reply, and gives the user time to read the richer typing copy.
 */
const COMPOSING_DELAY_MS = {
  byo: 1500,
  save: 600,
  export: 600,
  threshold: 600,
} as const;

const TYPING_COPY = {
  byo: "Preparing a quick sign-up so you can save your work and keep going",
  save: "GroundX is composing",
  export: "GroundX is composing",
  threshold: "GroundX is composing",
} as const;

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

const TypingIndicator: FC<{ trigger: keyof typeof TYPING_COPY }> = ({ trigger }) => (
  <Box
    data-testid="gate-typing-indicator"
    sx={{ display: "flex", alignItems: "center", gap: 1, py: 1, flexWrap: "wrap" }}
  >
    <Typography variant="caption" sx={{ color: BODY_TEXT }}>
      {TYPING_COPY[trigger]}
    </Typography>
    <LoadingDots size={5} aria-label="GroundX is composing a response" />
  </Box>
);

export const GateChatPanel: FC = () => {
  const { state: session } = useOnboardingSession();
  const { state: chatState } = useChatStore();
  const status = session.gate.status;
  const reduceMotion = useReducedMotion();
  // Trigger drives both the delay and the typing copy. For
  // `committed` / `dismissed` states the gate isn't actively
  // animating, but we still read the trigger off the state for
  // consistency. Default `save` when the gate is somehow active
  // without a trigger — short delay, generic copy.
  const trigger: keyof typeof TYPING_COPY =
    session.gate.status === "open" || session.gate.status === "dismissed"
      ? session.gate.trigger
      : "save";

  // Persisted-per-anon-user "the gate finished composing once" flag.
  // First open: typing → markComposed(). Subsequent opens (after a
  // dismiss + re-trigger, or after a reload) read it as true and
  // skip the typing indicator entirely.
  const [composed, markComposed] = useGateComposedPersisted(chatState.ownerKey);

  useEffect(() => {
    if (status !== "open" && status !== "committed") return;
    if (composed) return;
    if (status === "committed" || reduceMotion) {
      markComposed();
      return;
    }
    const delay = COMPOSING_DELAY_MS[trigger];
    const id = window.setTimeout(() => markComposed(), delay);
    return () => window.clearTimeout(id);
  }, [status, composed, reduceMotion, trigger, markComposed]);

  if (status !== "open" && status !== "committed") {
    return <IdleChatPlaceholder />;
  }

  if (!composed) {
    return <TypingIndicator trigger={trigger} />;
  }

  // ARCH-05B (2026-05-26): mounts the new `GateChatRail` widget
  // instead of the old `GateView` monolith. The form half of GateView
  // now lives in `viewer-widgets/SignUpWidget`, which OnboardingShell
  // mounts in the canvas slot whenever the gate is open. GateChatRail
  // is the chat-side half (preamble, book-a-call CTA, dismiss,
  // committed-state success card).
  return (
    <motion.div
      key="gate-fade-in"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
    >
      <GateChatRail />
    </motion.div>
  );
};
