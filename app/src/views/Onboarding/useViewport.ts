/**
 * Viewport breakpoints for the onboarding flow, matching the spec's responsive
 * system: ultrawide ≥ 1600, desktop 1024–1599, tablet 768–1023, mobile < 768.
 *
 * "compact" (< 1024) is the dividing line: at and above it the chat | canvas
 * split with a drag handle is shown; below it the drag handle disappears and the
 * two panes become a Chat / Workspace tab switch.
 */

import useMediaQuery from "@mui/material/useMediaQuery";

export type Viewport = "mobile" | "tablet" | "desktop" | "ultrawide";

export interface ViewportState {
  viewport: Viewport;
  isMobile: boolean;
  isTablet: boolean;
  /** Tablet portrait or mobile — single pane + tab switch, no drag handle. */
  isCompact: boolean;
  /** Desktop or ultrawide — the resizable split. */
  isDesktopUp: boolean;
  isUltrawide: boolean;
}

export function useViewport(): ViewportState {
  const isMobile = useMediaQuery("(max-width:767px)");
  const isTablet = useMediaQuery("(min-width:768px) and (max-width:1023px)");
  const isUltrawide = useMediaQuery("(min-width:1600px)");
  const isCompact = isMobile || isTablet;
  const viewport: Viewport = isMobile ? "mobile" : isTablet ? "tablet" : isUltrawide ? "ultrawide" : "desktop";
  return { viewport, isMobile, isTablet, isCompact, isDesktopUp: !isCompact, isUltrawide };
}
