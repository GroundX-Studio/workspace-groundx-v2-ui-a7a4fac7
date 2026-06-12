/**
 * BookCallView — F6a canvas surface.
 *
 * The Calendly embed that takes over the canvas pane when the user
 * clicks "Book a call with an engineer" inside the F6 gate. Renders
 * inline at desktop/tablet widths so the chat column's BOOKING IN
 * PROGRESS card remains visible and the user can ESC back to the gate
 * without leaving the page. Phone widths expose the same Calendly URL as
 * an external action because Calendly's inline surface clips event details
 * in a narrow viewer pane.
 *
 * URL contract: this component is rendered by OnboardingShell whenever
 * `?bookCall=1` is present in the URL. The shell mounts it inside the
 * normal canvas pane (StepStrip stays on top), so reload + back-button
 * preserve the F6a screen.
 */

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import { useEffect, useRef, useState, type FC } from "react";
import type { WidgetRole, WidgetScope } from "@groundx/shared";

import { APP_CONFIG } from "@/appConfig";
import { LoadingDots } from "@/components/primitives/LoadingDots/LoadingDots";
import {
  BODY_TEXT,
  BORDER,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_LABEL,
  FONT_WEIGHT_HEADLINE,
  GREEN,
  LETTER_SPACING_LABEL,
  NAVY,
  WARM_OFFWHITE,
  WHITE,
} from "@/constants";
import {
  isCalendlyScheduledEvent,
  loadCalendlyEmbedAssets,
} from "@/lib/calendlyEmbed";

export interface BookCallViewProps {
  /**
   * Widget access role (widget contract). BookCallView is available to
   * ALL roles and locks NO affordance by role — the Calendly booking
   * surface is identical for anonymous and member (see the access
   * matrix). `role` is carried for contract conformance + future roles.
   *
   * NOTE: the surrounding chrome (close button, breadcrumbs, settings
   * drawer vs. canvas pane) is the HOST's concern, driven by layout/flow
   * — it was the old `mode` prop's only job and was deliberately NOT
   * renamed to `role`.
   */
  role: WidgetRole;
  /**
   * Required scope per the widget contract. BookCallView is not a
   * ScopedViewerWidget — it operates on no document set — so it always
   * declares `{ type: "none" }`.
   */
  scope: WidgetScope;
  /** Browser-safe Calendly scheduling URL. Defaults to APP_CONFIG.calendly.url. */
  calendlyUrl?: string;
  /** Fired when Calendly confirms a scheduled event from a trusted origin. */
  onScheduled?: () => void;
}

export const BookCallView: FC<BookCallViewProps> = ({
  role,
  calendlyUrl = APP_CONFIG.calendly.url,
  onScheduled,
}) => {
  const resolvedCalendlyUrl = calendlyUrl.trim();
  const parentRef = useRef<HTMLDivElement | null>(null);
  const [embedState, setEmbedState] = useState<"idle" | "loading" | "ready" | "error">("loading");
  const theme = useTheme();
  const useExternalMobileCalendar = useMediaQuery(theme.breakpoints.down("sm"), { noSsr: true });

  useEffect(() => {
    if (!onScheduled) return undefined;
    const onMessage = (event: MessageEvent) => {
      if (isCalendlyScheduledEvent(event)) onScheduled();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onScheduled]);

  useEffect(() => {
    if (!resolvedCalendlyUrl || useExternalMobileCalendar) {
      setEmbedState("idle");
      if (parentRef.current) parentRef.current.innerHTML = "";
      return undefined;
    }
    const parentElement = parentRef.current;
    if (!parentElement) return undefined;

    let cancelled = false;
    let iframeLoadCleanup: (() => void) | null = null;
    let observer: MutationObserver | null = null;
    let readyFallbackTimer: number | null = null;

    const markReady = () => {
      if (!cancelled) setEmbedState("ready");
    };

    const attachToCalendlyFrame = (): boolean => {
      const frame = parentElement.querySelector("iframe");
      if (!(frame instanceof HTMLIFrameElement)) return false;
      const onLoad = () => markReady();
      frame.addEventListener("load", onLoad, { once: true });
      iframeLoadCleanup = () => frame.removeEventListener("load", onLoad);
      readyFallbackTimer = window.setTimeout(markReady, 4000);
      return true;
    };

    parentElement.innerHTML = "";
    setEmbedState("loading");

    loadCalendlyEmbedAssets()
      .then(() => {
        if (cancelled) return;
        parentElement.innerHTML = "";
        window.Calendly?.initInlineWidget({
          url: resolvedCalendlyUrl,
          parentElement,
        });
        if (attachToCalendlyFrame()) return;
        if (typeof MutationObserver !== "undefined") {
          observer = new MutationObserver(() => {
            if (attachToCalendlyFrame()) observer?.disconnect();
          });
          observer.observe(parentElement, { childList: true, subtree: true });
        }
      })
      .catch(() => {
        if (!cancelled) setEmbedState("error");
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
      iframeLoadCleanup?.();
      if (readyFallbackTimer !== null) window.clearTimeout(readyFallbackTimer);
      parentElement.innerHTML = "";
    };
  }, [resolvedCalendlyUrl, useExternalMobileCalendar]);

  if (!resolvedCalendlyUrl) {
    return (
      <Box
        data-testid="book-call-calendly-unset"
        data-widget="book-call-view"
        data-role={role}
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
          Set <code>VITE_CALENDLY_URL</code> in the frontend env or Docker build
          args to wire this surface to a real Calendly link.
        </Typography>
      </Box>
    );
  }

  if (useExternalMobileCalendar) {
    return (
      <Box
        data-testid="book-call-calendly-mobile"
        data-widget="book-call-view"
        data-role={role}
        sx={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1.5,
          backgroundColor: WHITE,
          px: 3,
          pt: 8,
          textAlign: "center",
          border: `1px solid ${BORDER}`,
        }}
        aria-label="Book a call viewer"
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
        <Typography variant="h6" sx={{ color: NAVY, fontWeight: FONT_WEIGHT_HEADLINE, maxWidth: 320 }}>
          Open the booking calendar
        </Typography>
        <Typography variant="body2" sx={{ color: BODY_TEXT, maxWidth: 320 }}>
          Calendly needs a little more width than this pane has on phones. The
          same 30-minute GroundX engineer calendar opens in a new tab.
        </Typography>
        <Button
          component="a"
          href={resolvedCalendlyUrl}
          target="_blank"
          rel="noopener noreferrer"
          variant="contained"
          startIcon={<CalendarMonthOutlinedIcon fontSize="small" />}
          data-testid="book-call-mobile-open"
          sx={{
            mt: 1,
            backgroundColor: GREEN,
            color: NAVY,
            fontWeight: FONT_WEIGHT_LABEL,
            boxShadow: "none",
            "&:hover": { backgroundColor: GREEN, boxShadow: "none", filter: "brightness(0.96)" },
          }}
        >
          Open calendar
        </Button>
      </Box>
    );
  }

  return (
    <Box
      data-widget="book-call-view"
      data-role={role}
      sx={{
        height: "100%",
        width: "100%",
        backgroundColor: WHITE,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
      aria-label="Book a call viewer"
    >
      {embedState === "loading" && (
        <Box
          data-testid="book-call-calendly-loading"
          aria-live="polite"
          sx={{
            flexShrink: 0,
            minHeight: 52,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 1.25,
            border: `1px solid ${BORDER}`,
            borderBottom: 0,
            backgroundColor: WARM_OFFWHITE,
            color: NAVY,
          }}
        >
          <LoadingDots size={6} color={GREEN} aria-label="Loading booking calendar" />
          <Typography variant="body2" sx={{ color: BODY_TEXT, fontWeight: FONT_WEIGHT_LABEL }}>
            Loading booking calendar…
          </Typography>
        </Box>
      )}
      <Box
        ref={parentRef}
        data-testid="book-call-calendly"
        aria-label="Book a call · Calendly embed"
        sx={{
          flex: 1,
          width: "100%",
          height: "100%",
          minWidth: 320,
          minHeight: 0,
          overflow: "hidden",
          position: "relative",
          border: `1px solid ${BORDER}`,
          borderTop: embedState === "loading" ? 0 : `1px solid ${BORDER}`,
          backgroundColor: WHITE,
          "& iframe": {
            display: "block",
            width: "100% !important",
            height: { xs: "100% !important", sm: "calc(100% + 48px) !important" },
            marginTop: { xs: 0, sm: "-48px" },
            border: 0,
          },
          "& .calendly-spinner": {
            display: "none !important",
          },
        }}
      />
      {embedState === "error" && (
        <Box
          data-testid="book-call-calendly-error"
          sx={{
            p: 3,
            borderTop: `1px solid ${BORDER}`,
            backgroundColor: WARM_OFFWHITE,
          }}
        >
          <Typography variant="body2" sx={{ color: BODY_TEXT }}>
            We couldn't load the booking calendar. Please try again in a moment.
          </Typography>
        </Box>
      )}
    </Box>
  );
};
