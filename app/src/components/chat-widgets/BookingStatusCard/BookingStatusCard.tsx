/**
 * BookingStatusCard — chat-widget for the F6a booking flow.
 *
 * Renamed from `BookCallChatPanel` in ARCH-03 (2026-05-26) when widgets
 * were reorganized into `chat-widgets/` + `viewer-widgets/`. Now lives
 * at `components/chat-widgets/BookingStatusCard/`.
 *
 * When the viewer swaps to the Calendly embed (?bookCall=1 in the URL),
 * the chat column compresses the F6 gate down to a "BOOKING IN
 * PROGRESS" status card. The full gate is preserved server-side — this
 * widget is the chat-side mirror of the viewer's iframe.
 *
 * Wireframe contract (F6a · branch from F6):
 *   • Top: ← back to sign-in (clears ?bookCall=1)
 *   • "BOOKING IN PROGRESS" eyebrow + booking-card
 *   • Bot reassurance: ESC / × from the calendar returns here, work
 *     stays preserved, booking ≠ signing in.
 *   • What we'll cover: three bullets (document type / volume / accuracy,
 *     where GroundX fits vs current stack, pilot scope + eval set).
 *   • Solutions-engineer credibility blurb.
 *
 * On a successful booking (calendly.event_scheduled postMessage from
 * https://calendly.com), this panel transitions the local gate to
 * `committed("engineer-call")` so the chat replays the gate with a
 * pinned call-slot status card. Magic-link / SSO controls remain
 * available — booking ≠ signing in.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useState, type FC } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { WidgetRole, WidgetScope } from "@groundx/shared";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  BORDER_RADIUS_PILL,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { useOnboardingSession } from "@/contexts/OnboardingSessionContext";

/**
 * Origins we trust for the `calendly.event_scheduled` postMessage.
 * Calendly always posts from `https://calendly.com`; the wildcard form
 * `https://*.calendly.com` is also covered to absorb future subdomain
 * routing (e.g. eu.calendly.com). Anything else is silently dropped —
 * a malicious page could embed a fake form and fire the message
 * otherwise.
 */
const TRUSTED_CALENDLY_ORIGINS = /^https:\/\/([a-z0-9-]+\.)?calendly\.com$/i;

export interface BookingStatusCardProps {
  /**
   * Widget-contract authorization role (`anonymous` | `member`).
   * BookingStatusCard is available to BOTH roles and locks NO
   * affordance by role (matrix row, docs/agents/widget-access-matrix.md
   * §1). Accepted to satisfy the contract; behavior is identical across
   * roles. The retired binary onboarding/steady phase prop was
   * cosmetic-only here and was dropped in
   * 2026-05-30-widget-role-access Phase 2b.
   */
  role: WidgetRole;
  /**
   * Widget-contract scope. This chat-side status card is not
   * document-scoped, so it declares `{ type: "none" }` (matrix §1b).
   */
  scope: WidgetScope;
}

export const BookingStatusCard: FC<BookingStatusCardProps> = ({ role, scope }) => {
  void role;
  void scope;
  const navigate = useNavigate();
  const location = useLocation();
  const { commitGate } = useOnboardingSession();
  const [confirmed, setConfirmed] = useState(false);

  const clearBookCallParam = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete("bookCall");
    const next = params.toString();
    navigate(
      { pathname: location.pathname, search: next ? `?${next}` : "" },
      { replace: false },
    );
  }, [location.pathname, location.search, navigate]);

  // Calendly posts `{ event: "calendly.event_scheduled", payload: {...} }`
  // to window.parent after a booking completes. We listen, verify the
  // origin, then commit the gate.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!TRUSTED_CALENDLY_ORIGINS.test(event.origin)) return;
      const data = event.data as { event?: string } | null;
      if (!data || data.event !== "calendly.event_scheduled") return;
      setConfirmed(true);
      try {
        commitGate("engineer-call");
      } catch {
        // commitGate throws if the gate isn't open. If the user
        // already dismissed before booking confirmed, the booking is
        // still real (Calendly sent the email), but the in-app
        // committed-state isn't required. Swallowing here keeps the
        // confirmation card visible without crashing the panel.
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [commitGate]);

  // ESC clears the param too — wireframe says ESC / × from the
  // calendar returns the user here, but the user is already here, so
  // ESC must keep going (back to the gate).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        clearBookCallParam();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearBookCallParam]);

  if (confirmed) {
    return (
      <Box
        data-testid="book-call-confirmed"
        data-widget="booking-status-card"
        sx={{
          p: 2.5,
          borderRadius: BORDER_RADIUS_2X,
          border: `1.5px solid ${GREEN}`,
          backgroundColor: WHITE,
        }}
        aria-label="Booking confirmed"
      >
        <Typography
          variant="overline"
          sx={{
            color: EYEBROW_ON_LIGHT,
            fontWeight: FONT_WEIGHT_LABEL,
            letterSpacing: LETTER_SPACING_LABEL,
          }}
        >
          CALL BOOKED
        </Typography>
        <Typography variant="body1" sx={{ mt: 1, color: NAVY }}>
          Your call is on the calendar. We&apos;ll send a confirmation
          email shortly.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1, color: BODY_TEXT }}>
          Booking a call doesn&apos;t sign you in. You can still send a
          magic link or finish sign-up from here.
        </Typography>
        <Box
          component="button"
          type="button"
          data-testid="book-call-confirmed-back"
          onClick={clearBookCallParam}
          sx={{
            mt: 2,
            border: `1px solid ${BORDER}`,
            borderRadius: BORDER_RADIUS_PILL,
            backgroundColor: WHITE,
            color: NAVY,
            px: 1.5,
            py: 0.5,
            fontSize: FONT_SIZE_CAPTION,
            fontWeight: FONT_WEIGHT_HEADLINE,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← Back to sign-in
        </Box>
      </Box>
    );
  }

  return (
    <Stack
      spacing={1.5}
      aria-label="Book a call · status"
      data-widget="booking-status-card"
    >
      <Box
        component="button"
        type="button"
        data-testid="book-call-back"
        onClick={clearBookCallParam}
        sx={{
          alignSelf: "flex-start",
          border: "none",
          background: "none",
          color: NAVY,
          fontSize: FONT_SIZE_CAPTION,
          fontWeight: FONT_WEIGHT_LABEL,
          cursor: "pointer",
          fontFamily: "inherit",
          padding: 0,
          "&:hover": { textDecoration: "underline" },
        }}
      >
        ← back to sign-in
      </Box>

      <Box
        data-testid="book-call-chat-status"
        sx={{
          p: 2,
          borderRadius: BORDER_RADIUS_2X,
          border: `1.5px solid ${GREEN}`,
          backgroundColor: WHITE,
        }}
      >
        <Typography
          variant="overline"
          sx={{
            color: EYEBROW_ON_LIGHT,
            fontWeight: FONT_WEIGHT_LABEL,
            letterSpacing: LETTER_SPACING_LABEL,
          }}
        >
          BOOKING IN PROGRESS
        </Typography>
        <Typography variant="subtitle1" sx={{ mt: 0.5, fontWeight: FONT_WEIGHT_HEADLINE, color: NAVY }}>
          Book a 15-min engineer call
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: MUTED_ON_LIGHT }}>
          pick a time on the right →
        </Typography>
      </Box>

      <Box
        sx={{
          p: 2,
          borderRadius: BORDER_RADIUS_2X,
          border: `1px solid ${BORDER}`,
          backgroundColor: WHITE,
        }}
      >
        <Typography variant="body2" sx={{ color: NAVY }}>
          No pressure — your session stays open while you book. Press
          <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>{" "}ESC{" "}</Box>
          or hit the <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>×</Box> on the
          calendar to come back here and keep exploring.
        </Typography>
        <Typography variant="caption" sx={{ display: "block", mt: 1, color: MUTED_ON_LIGHT }}>
          Booking a call doesn&apos;t sign you in. You can still send a
          magic link after.
        </Typography>
      </Box>

      <Box
        sx={{
          p: 2,
          borderRadius: BORDER_RADIUS_2X,
          border: `1px solid ${BORDER}`,
          backgroundColor: WHITE,
        }}
      >
        <Typography
          variant="overline"
          sx={{
            color: EYEBROW_ON_LIGHT,
            fontWeight: FONT_WEIGHT_LABEL,
            letterSpacing: LETTER_SPACING_LABEL,
          }}
        >
          WHAT WE&apos;LL COVER
        </Typography>
        <Box component="ul" sx={{ mt: 1, pl: 2.5, mb: 0, color: NAVY }}>
          <Box component="li" sx={{ mb: 0.5, fontSize: FONT_SIZE_CAPTION }}>
            your document type · volume · accuracy bar
          </Box>
          <Box component="li" sx={{ mb: 0.5, fontSize: FONT_SIZE_CAPTION }}>
            where GroundX fits vs. your current stack
          </Box>
          <Box component="li" sx={{ fontSize: FONT_SIZE_CAPTION }}>
            next-step: pilot scope + eval set
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          p: 2,
          borderRadius: BORDER_RADIUS_2X,
          border: `1px solid ${BORDER}`,
          backgroundColor: WHITE,
        }}
      >
        <Typography variant="body2" sx={{ color: NAVY }}>
          You&apos;ll meet a{" "}
          <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>solutions engineer</Box>
          , not a sales rep. They&apos;ve shipped GroundX into
          production at 4 of the AmLaw 100 and a handful of
          regulated-industry buyers. Bring questions.
        </Typography>
      </Box>
    </Stack>
  );
};
