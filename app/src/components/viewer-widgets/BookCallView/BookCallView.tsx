/**
 * BookCallView — F6a canvas surface.
 *
 * The Calendly embed that takes over the canvas pane when the user
 * clicks "Book a call with an engineer" inside the F6 gate. Renders
 * inline (NOT in a new tab) per the F6a wireframe, so the chat column's
 * BOOKING IN PROGRESS card remains visible and the user can ESC back to
 * the gate without leaving the page.
 *
 * URL contract: this component is rendered by OnboardingShell whenever
 * `?bookCall=1` is present in the URL. The shell mounts it inside the
 * normal canvas pane (StepStrip stays on top), so reload + back-button
 * preserve the F6a screen.
 */

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { FC } from "react";

import {
  BODY_TEXT,
  BORDER,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_LABEL,
  LETTER_SPACING_LABEL,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";

/**
 * Per-deploy Calendly link. Set via `VITE_CALENDLY_URL` in
 * `app/.env.local` (or the per-env GitHub vars + Helm values). When
 * unset we render an inline empty-state instead of a broken `src=""`
 * iframe — the CTA still works, the booking surface just shows a
 * "configure VITE_CALENDLY_URL" placeholder until someone wires the
 * per-deploy link.
 */
function readCalendlyUrl(): string {
  const raw = import.meta.env.VITE_CALENDLY_URL as string | undefined;
  return (raw ?? "").trim();
}

export type BookCallViewMode = "onboarding" | "steady";

export interface BookCallViewProps {
  /**
   * Locked-affordance gate per the widget contract. In onboarding the
   * iframe is non-resizable and floats centered; steady mode allows
   * the same surface to be embedded inside a settings drawer where the
   * surrounding chrome (close button, breadcrumbs) is the steady-mode
   * caller's concern.
   */
  mode?: BookCallViewMode;
}

export const BookCallView: FC<BookCallViewProps> = ({ mode = "onboarding" }) => {
  const calendlyUrl = readCalendlyUrl();

  if (!calendlyUrl) {
    return (
      <Box
        data-testid="book-call-calendly-unset"
        data-widget="book-call-view"
        data-mode={mode}
        sx={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
          backgroundColor: WARM_OFFWHITE,
          p: 4,
          textAlign: "center",
        }}
        aria-label="Book a call · placeholder"
      >
        <Typography
          variant="overline"
          sx={{
            color: EYEBROW_ON_LIGHT,
            fontWeight: FONT_WEIGHT_LABEL,
            letterSpacing: LETTER_SPACING_LABEL,
          }}
        >
          BOOK A CALL
        </Typography>
        <Typography variant="h6" sx={{ color: NAVY }}>
          Booking is not configured for this deploy yet.
        </Typography>
        <Typography variant="body2" sx={{ color: BODY_TEXT, maxWidth: 420 }}>
          Set <code>VITE_CALENDLY_URL</code> in the frontend env (or the
          deploy's Helm values) to wire this surface to a real Calendly
          link.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      data-widget="book-call-view"
      data-mode={mode}
      sx={{
        height: "100%",
        width: "100%",
        backgroundColor: WHITE,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
      aria-label="Book a call · Calendly embed"
    >
      <Box
        component="iframe"
        data-testid="book-call-calendly"
        // The iframe `title` is required for a11y (WCAG 2.1 SC 2.4.1).
        // Including "Calendly" in the title also helps screen-reader
        // users orient themselves when focus first lands inside the
        // iframe.
        title="Calendly — book a call with a GroundX engineer"
        src={calendlyUrl}
        // Calendly's parent → iframe origin check needs the iframe to
        // be in the same window-origin tree; sandbox flags that strip
        // forms/scripts/popups break the booking flow.
        allow="camera; microphone; clipboard-read; clipboard-write"
        sx={{
          flex: 1,
          width: "100%",
          height: "100%",
          border: `1px solid ${BORDER}`,
          backgroundColor: WHITE,
        }}
      />
    </Box>
  );
};
