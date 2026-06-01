/**
 * GateChatRail — chat-slot half of the sign-up surface.
 *
 * The viewer-side half is `SignUpWidget`. Together they replace the
 * old `GateView` monolith. See `SignUpWidget/README.md` for the full
 * split rationale.
 *
 * Renders:
 *   - When `gate.status === "open"`:
 *       eyebrow + preamble (per trigger) + book-a-call CTA + dismiss
 *       link. The form is in the viewer.
 *   - When `gate.status === "committed"`:
 *       success card with a "Continue to Integrate" CTA (onboarding
 *       only) or a "thanks, we'll call you" card for engineer-call.
 *   - When `gate.status` is `idle` or `dismissed`:
 *       null. The chat shell renders its normal message stream.
 *
 * Wireframe sources:
 *   - F6 (gate) wireframe: preamble per trigger; book-a-call CTA;
 *     dismiss link.
 *   - F6 committed (post-register) wireframe: WELCOME card + Continue.
 *   - F6a (book a call): handled by sibling `BookingStatusCard`
 *     widget; this rail just sets the URL param that triggers it.
 */

import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import MuiStack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState, type FC, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { BodyText } from "@/components/primitives/BodyText/BodyText";
import { Button } from "@/components/primitives/Button/Button";
import { Label } from "@/components/primitives/Label/Label";
import { LoadingDots } from "@/components/primitives/LoadingDots/LoadingDots";
import { TextField } from "@/components/primitives/TextField/TextField";
import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_CARD,
  BORDER_RADIUS_PILL,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  GREEN,
  NAVY,
  WHITE,
} from "@/constants";

/**
 * P1 polish (2026-05-29): the gate is delivered as a SEQUENCE of chat
 * bubbles that arrive one at a time — like an assistant typing back a few
 * messages in a row. A typing indicator ("…" dots) shows BETWEEN messages
 * on an irregular cadence, then each message fades + rises in on mount.
 * `prefers-reduced-motion` renders them all at once with no typing beat.
 */
const GateMessage: FC<{ reduce: boolean; children: ReactNode }> = ({ reduce, children }) => (
  <motion.div
    style={{ width: "100%", display: "flex" }}
    initial={reduce ? false : { opacity: 0, y: 14 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.34, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

// Shared chat-bubble styling — matches ChatColumn's `BotBubble` (white,
// thin border, BORDER_RADIUS_2X, left-aligned) so the gate reads as the
// same chat surface as every other screen. Padding is kept a touch roomier
// than a bare text bubble because bubble 2 wraps form controls.
const BUBBLE_SX = {
  // Span the full chat-pane width like the other chat messages (the rail
  // stack stretches its children; no narrow cap).
  width: "100%",
  px: 1.5,
  py: 1.25,
  backgroundColor: WHITE,
  border: `1px solid ${BORDER}`,
  borderRadius: BORDER_RADIUS_2X,
} as const;

// Bubble body copy must match ChatColumn's `BotBubble` text (FONT_SIZE_CAPTION
// + lineHeight 1.4) — these are chat messages, not big card copy. Without this
// the default BodyText `body1` (1rem) rendered noticeably larger than the rest
// of the chat surface.
const BUBBLE_TEXT_SX = { fontSize: FONT_SIZE_CAPTION, lineHeight: 1.4 } as const;

/** The "GroundX is typing" bubble shown between messages as they arrive. */
const TypingBubble: FC = () => (
  <motion.div
    style={{ display: "flex" }}
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.2, ease: "easeOut" }}
  >
    <Box
      data-testid="gate-rail-typing"
      sx={{
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        px: 1.5,
        py: 1,
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius: BORDER_RADIUS_2X,
      }}
    >
      <LoadingDots size={5} aria-label="GroundX is typing" />
    </Box>
  </motion.div>
);

/**
 * Persisted "the gate's bubble sequence has animated in once" flag. The
 * gate animates in ONCE per visitor — like any received chat message — then
 * renders instantly on every later visit. Cleared by `resetExperience`
 * (it removes every `groundx-onboarding.*` storage key).
 */
const SEQUENCE_PLAYED_KEY = "groundx-onboarding.gate-sequence-played";
function useGateSequencePlayed(): [boolean, () => void] {
  const [played, setPlayed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(SEQUENCE_PLAYED_KEY) === "true";
    } catch {
      return false;
    }
  });
  const mark = useCallback(() => {
    setPlayed(true);
    try {
      window.localStorage.setItem(SEQUENCE_PLAYED_KEY, "true");
    } catch {
      // localStorage disabled — in-memory state still prevents a replay
      // within this session; the worst case is a replay after reload.
    }
  }, []);
  return [played, mark];
}
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import type { GateTrigger } from "@/types/onboarding";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

const PREAMBLE: Record<GateTrigger, string> = {
  save: "Save your work to come back to it. One quick step.",
  export: "Export uses your account so it's tied to you. One quick step.",
  byo: "Bring your own data. Sign in to start uploading.",
  threshold: "You've reached the free-tier ceiling — pages stay free after sign-in.",
};

/**
 * `f3a-save-signin-gate-handoff`: when the gate carries a `cause`,
 * override the generic per-trigger preamble with cause-specific copy.
 * The cause is set by callers like `openGate("save", { cause: "save-schema" })`.
 */
const PREAMBLE_BY_CAUSE: Record<"save-schema", string> = {
  "save-schema": "Sign in to save this schema",
};

/**
 * The onboarding-flow frame at which the gate appears. When the session is
 * on this frame, the committed-state card offers the "Continue to Integrate"
 * nav CTA that advances the flow to F7. This is FLOW chrome, re-sourced from
 * session/gate-state (`currentFrame`) — NOT a widget `role`/`mode` prop
 * (2026-05-30-widget-role-access). A steady re-encounter of the gate is not
 * on this frame, so the nav CTA is absent.
 */
const GATE_FRAME = "f6";

export interface GateChatRailProps {
  /**
   * Widget access role per the role+scope contract
   * (2026-05-30-widget-role-access). GateChatRail is **anonymous-only** by
   * AVAILABILITY — the OnboardingShell mounts it only in the gate (anonymous)
   * context; a signed-in member never sees it. The mount site enforces that.
   * No affordance is locked by role inside this widget today, so `role` is
   * present for the contract and forward-looking roles.
   */
  role: WidgetRole;
  /**
   * Required widget scope. GateChatRail is session/gate-scoped, not
   * document-scoped, so it always declares `{ type: "none" }`.
   */
  scope: WidgetScope;
}

export const GateChatRail: FC<GateChatRailProps> = ({ role: _role, scope: _scope }) => {
  const { state, dismissGate, advanceFrame, commitGate } = useOnboardingSession();
  // FLOW chrome, re-sourced from gate-state — not from a widget prop. The
  // committed "Continue to Integrate" nav CTA shows only while the onboarding
  // flow is on the gate frame.
  const onGateFrame = state.currentFrame === GATE_FRAME;
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const reduceMotion = useReducedMotion() ?? false;

  // P1 polish — progressive reveal: bubble 1 shows immediately, then a
  // typing indicator precedes bubbles 2 and 3 on an irregular cadence.
  // The sequence animates in ONCE per visitor (persisted) — like any
  // received chat message — then renders instantly, until a debug reset.
  // Reduced motion always shows all three at once with no typing beat.
  const TOTAL_MESSAGES = 3;
  const gateOpen = state.gate.status === "open";
  const [seqPlayed, markSeqPlayed] = useGateSequencePlayed();
  // Capture the played-at-mount value so marking it played mid-sequence
  // doesn't re-trigger the effect.
  const playedAtMount = useRef(seqPlayed);
  const animateSequence = !reduceMotion && !playedAtMount.current;
  const [revealed, setRevealed] = useState(animateSequence ? 1 : TOTAL_MESSAGES);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!animateSequence || !gateOpen) return;
    // Mark played at the START so a quick navigate-away-and-back doesn't
    // replay the sequence — it has been "received" once.
    markSeqPlayed();
    const timers: number[] = [
      window.setTimeout(() => setTyping(true), 500),
      window.setTimeout(() => {
        setTyping(false);
        setRevealed(2);
      }, 1300),
      window.setTimeout(() => setTyping(true), 1950),
      window.setTimeout(() => {
        setTyping(false);
        setRevealed(3);
      }, 2850),
    ];
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [animateSequence, gateOpen, markSeqPlayed]);

  // P1 (2026-05-29) — the sign-up doors now live in the chat rail (the
  // wireframe `Flow_Gate` three-door layout), with the value-prop pitch
  // in the canvas. Demo magic-link (owner decision): "Send magic link"
  // captures the email and commits via the existing `register` method —
  // there is no passwordless backend, so this is the same gate commit the
  // old SignUpWidget form drove, surfaced as a one-field chat affordance.
  const handleSendMagicLink = useCallback(() => {
    if (!email.trim()) return;
    commitGate("register");
  }, [email, commitGate]);

  const handleSso = useCallback(() => {
    commitGate("sso");
  }, [commitGate]);

  const handleBookCall = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.set("bookCall", "1");
    navigate(
      { pathname: location.pathname, search: `?${params.toString()}` },
      { replace: false },
    );
  }, [location.pathname, location.search, navigate]);

  const handleContinue = useCallback(() => {
    advanceFrame("f7");
  }, [advanceFrame]);

  if (state.gate.status === "committed") {
    const method = state.gate.method;
    const eyebrow =
      method === "engineer-call"
        ? "THANKS - CALL REQUESTED"
        : method === "register"
        ? "WELCOME - YOU'RE SIGNED IN"
        : "THANKS - SIGNED IN";
    const body =
      method === "engineer-call"
        ? "You'll get a Calendly confirmation shortly. Until then, keep exploring — your work is preserved."
        : method === "register"
        ? "Your sample work is now saved to your account. Continue to Integrate to wire your real data."
        : "You're signed in. Continue to Integrate to wire your real data.";
    return (
      <Card
        data-widget="gate-chat-rail"
        data-testid="gate-rail-committed"
        sx={{ p: 3, borderRadius: BORDER_RADIUS_CARD }}
        aria-label="Gate committed"
      >
        <MuiStack spacing={1}>
          <Label sx={{ color: EYEBROW_ON_LIGHT }}>{eyebrow}</Label>
          <BodyText>{body}</BodyText>
          {onGateFrame ? (
            <Button noTool="onboarding-flow nav chrome (not agent-driven)"
              type="button"
              variant="primary"
              fullWidth
              data-testid="gate-rail-continue-integrate"
              onClick={handleContinue}
              sx={{ mt: 1 }}
            >
              Continue to Integrate
            </Button>
          ) : null}
        </MuiStack>
      </Card>
    );
  }

  if (state.gate.status !== "open") return null;

  const trigger = state.gate.trigger;
  // `f3a-save-signin-gate-handoff`: cause-specific preamble override.
  const preamble = state.gate.cause ? PREAMBLE_BY_CAUSE[state.gate.cause] : PREAMBLE[trigger];

  return (
    <MuiStack
      data-widget="gate-chat-rail"
      spacing={1.25}
      aria-label="Sign-in offer"
      sx={{ alignItems: "stretch" }}
    >
      {/* Bubble 1 — the "why" (arrives first). Carries the GroundX
          identity so the sequence reads as the assistant messaging back. */}
      <GateMessage reduce={reduceMotion}>
        <Card elevation={0} sx={BUBBLE_SX}>
          <BodyText data-testid="gate-rail-preamble" sx={{ color: BODY_TEXT, ...BUBBLE_TEXT_SX }}>
            {preamble}
          </BodyText>
        </Card>
      </GateMessage>

      {/* Bubble 2 — the doors (arrives after a typing beat). Email → magic
          link (field collects the value, hence noTool; send commits via the
          widget's commit_gate tool) + SSO. */}
      {revealed >= 2 && (
        <GateMessage reduce={reduceMotion}>
          <Card elevation={0} sx={BUBBLE_SX}>
          <MuiStack spacing={1.25}>
            <Label sx={{ color: EYEBROW_ON_LIGHT }}>CONTINUE WITH…</Label>
            <TextField
              noTool="value collected by send-magic-link"
              data-testid="gate-rail-email"
              type="email"
              fullWidth
              placeholder="name@company.com"
              aria-label="Email for magic link"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSendMagicLink();
                }
              }}
            />
            <Button
              tool="commit_gate"
              type="button"
              variant="primary"
              fullWidth
              data-testid="gate-rail-send-magic-link"
              onClick={handleSendMagicLink}
              sx={{ py: 1.5 }}
            >
              → Send magic link
            </Button>
            <Button
              tool="commit_gate"
              type="button"
              variant="secondary"
              fullWidth
              data-testid="gate-rail-sso"
              onClick={handleSso}
              sx={{ py: 1.25, border: `1px solid ${alpha(NAVY, 0.24)}`, borderRadius: BORDER_RADIUS_PILL }}
            >
              Continue with SSO
            </Button>
          </MuiStack>
        </Card>
        </GateMessage>
      )}

      {/* Bubble 3 — the soft options (arrives last). Book-a-call +
          keep-exploring dismiss. */}
      {revealed >= 3 && (
        <GateMessage reduce={reduceMotion}>
          <Card elevation={0} sx={BUBBLE_SX}>
          <MuiStack spacing={1.25}>
            <BodyText sx={{ color: NAVY, ...BUBBLE_TEXT_SX }}>Not ready? No problem.</BodyText>
            <Box
              role="button"
              tabIndex={0}
              data-testid="gate-rail-book-call"
              onClick={handleBookCall}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  handleBookCall();
                }
              }}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1.5,
                borderRadius: BORDER_RADIUS_2X,
                border: `1px solid ${GREEN}`,
                color: NAVY,
                cursor: "pointer",
                "&:hover": { backgroundColor: alpha(GREEN, 0.08) },
              }}
            >
              <CalendarMonthOutlinedIcon fontSize="small" />
              <BodyText sx={{ color: NAVY, ...BUBBLE_TEXT_SX }}>Book a call with an engineer</BodyText>
            </Box>
            <Box
              component="button"
              type="button"
              data-testid="gate-rail-dismiss"
              onClick={dismissGate}
              sx={{
                alignSelf: "flex-start",
                background: "none",
                border: "none",
                padding: 0,
                color: NAVY,
                cursor: "pointer",
                fontFamily: "inherit",
                "&:hover": { textDecoration: "underline" },
              }}
            >
              ← Keep exploring
            </Box>
          </MuiStack>
        </Card>
        </GateMessage>
      )}

      {/* Typing indicator — shown between messages as the next one composes. */}
      <AnimatePresence>
        {typing && revealed < TOTAL_MESSAGES && <TypingBubble key="gate-typing" />}
      </AnimatePresence>
    </MuiStack>
  );
};
