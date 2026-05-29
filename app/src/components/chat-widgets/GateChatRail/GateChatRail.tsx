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
import { useCallback, type FC } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { BodyText } from "@/components/primitives/BodyText/BodyText";
import { Button } from "@/components/primitives/Button/Button";
import { Label } from "@/components/primitives/Label/Label";
import {
  BORDER_RADIUS_2X,
  BORDER_RADIUS_CARD,
  EYEBROW_ON_LIGHT,
  GREEN,
  NAVY,
} from "@/constants";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";
import type { GateTrigger } from "@/types/onboarding";

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

export type GateChatRailMode = "onboarding" | "steady";

export interface GateChatRailProps {
  /**
   * Locked-affordance gate per the widget contract.
   * - `onboarding` (default): committed-state card shows
   *   "Continue to Integrate" so the user can advance to F7.
   * - `steady`: same eyebrows + dismiss + book-a-call, but no
   *   onboarding-frame nav CTA on the committed card. Useful if a
   *   user re-encounters the gate from a steady-mode surface.
   */
  mode?: GateChatRailMode;
}

export const GateChatRail: FC<GateChatRailProps> = ({ mode = "onboarding" }) => {
  const { state, dismissGate, advanceFrame } = useOnboardingSession();
  const navigate = useNavigate();
  const location = useLocation();

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
        data-mode={mode}
        data-testid="gate-rail-committed"
        sx={{ p: 3, borderRadius: BORDER_RADIUS_CARD }}
        aria-label="Gate committed"
      >
        <MuiStack spacing={1}>
          <Label sx={{ color: EYEBROW_ON_LIGHT }}>{eyebrow}</Label>
          <BodyText>{body}</BodyText>
          {mode === "onboarding" ? (
            <Button noTool="legacy — Phase 7 backfills tool"
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
    <Card
      data-widget="gate-chat-rail"
      data-mode={mode}
      sx={{ p: 3, borderRadius: BORDER_RADIUS_CARD, maxWidth: 460 }}
      aria-label="Sign-in offer"
    >
      <MuiStack spacing={2}>
        <Label sx={{ color: EYEBROW_ON_LIGHT }}>SIGN UP</Label>

        <BodyText data-testid="gate-rail-preamble" sx={{ color: NAVY }}>
          {preamble}
        </BodyText>

        {/* Book-a-call CTA — secondary affordance for users who don't
            want to fill in the form right now. Setting ?bookCall=1
            lets OnboardingShell swap the viewer to the Calendly embed
            and the sibling BookingStatusCard takes over the chat. */}
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
          <BodyText sx={{ color: NAVY }}>Book a call with an engineer</BodyText>
        </Box>

        {/* ← Keep exploring — LC5 dismiss path. ESC also dismisses
            (wired at the OnboardingShell level so it works regardless
            of which slot has focus). */}
        <Box
          component="button"
          type="button"
          data-testid="gate-rail-dismiss"
          onClick={dismissGate}
          sx={{
            mt: 0.5,
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
  );
};
