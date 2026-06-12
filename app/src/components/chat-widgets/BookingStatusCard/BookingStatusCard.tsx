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
 * widget is the chat-side mirror of the viewer's scheduler.
 *
 * Wireframe contract (F6a · branch from F6):
 *   • Top: ← close booking (clears ?bookCall=1)
 *   • "BOOKING IN PROGRESS" eyebrow + booking-card
 *   • Bot reassurance: ESC or Close booking returns to the current demo
 *     state, work stays preserved, booking ≠ signing in.
 *   • What we'll cover: three bullets (document type / volume / accuracy,
 *     where GroundX fits vs current stack, pilot scope + eval set).
 *
 * Calendly scheduler lifecycle belongs to the viewer-side `BookCallView`.
 * This chat widget stays focused on the status/back affordance while
 * the viewer owns `calendly.event_scheduled` and tells the shell when
 * to commit the gate.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, type FC } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { WidgetRole, WidgetScope } from "@groundx/shared";

import {
  BORDER,
  BORDER_RADIUS_2X,
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

  const clearBookCallParam = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete("bookCall");
    const next = params.toString();
    navigate(
      { pathname: location.pathname, search: next ? `?${next}` : "" },
      { replace: false },
    );
  }, [location.pathname, location.search, navigate]);

  // ESC clears the param too, matching the visible "close booking"
  // affordance and returning to whichever onboarding frame opened the
  // scheduler.
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
        ← close booking
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
          Book a 30-minute engineer call
        </Typography>
        <Typography variant="body2" sx={{ mt: 0.5, color: MUTED_ON_LIGHT }}>
          Choose a time in the calendar.
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
          Your session stays open while you book. Press
          <Box component="span" sx={{ fontWeight: FONT_WEIGHT_HEADLINE }}>{" "}ESC{" "}</Box>
          or use Close booking to return to the current demo state.
        </Typography>
        <Typography variant="caption" sx={{ display: "block", mt: 1, color: MUTED_ON_LIGHT }}>
          Booking a call doesn&apos;t sign you in. The sign-in option stays
          available after you close this.
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
            your document type, volume, and accuracy bar
          </Box>
          <Box component="li" sx={{ mb: 0.5, fontSize: FONT_SIZE_CAPTION }}>
            where GroundX fits in your current stack
          </Box>
          <Box component="li" sx={{ fontSize: FONT_SIZE_CAPTION }}>
            next-step pilot scope and eval set
          </Box>
        </Box>
      </Box>
    </Stack>
  );
};
