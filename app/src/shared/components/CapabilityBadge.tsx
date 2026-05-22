/**
 * CapabilityBadge — a small square chip displaying one of E / I / R
 * (Extract / Interact / Report) and whether that capability is "live"
 * (filled green) or "off" (hollow grey).
 *
 * Used in:
 *   • F1 sample-card capability row
 *   • F1 capability legend
 *   • Any future place that needs to advertise E/I/R chapter status
 *
 * The two size variants (default 20px, dense 16px) cover the two contexts
 * the spec uses today — card chrome and inline legend.
 */

import Box from "@mui/material/Box";
import { alpha } from "@mui/material/styles";
import type { FC } from "react";

import {
  BORDER_RADIUS_SM,
  CAPABILITY_BADGE_SIZE,
  CAPABILITY_BADGE_SIZE_SM,
  FONT_FAMILY_MARKETING,
  GREEN,
  NAVY,
  WHITE,
} from "@/constants";

export type CapabilityLetter = "E" | "I" | "R";
export type CapabilityKey = "extract" | "interact" | "report";

export interface CapabilityBadgeProps {
  letter: CapabilityLetter;
  /** When true, the chip is filled green; when false, hollow grey. */
  live: boolean;
  /** Tooltip + accessible label context. */
  name?: string;
  /** "default" = 20px (card chrome) · "sm" = 16px (legend). */
  size?: "default" | "sm";
}

export const CapabilityBadge: FC<CapabilityBadgeProps> = ({ letter, live, name, size = "default" }) => {
  const px = size === "sm" ? CAPABILITY_BADGE_SIZE_SM : CAPABILITY_BADGE_SIZE;
  const fontSize = size === "sm" ? 9 : 11;
  const borderWidth = size === "sm" ? 1.2 : 1.5;
  return (
    <Box
      title={name ? `${name}${live ? " · live in this sample" : " · not in this sample"}` : undefined}
      aria-hidden
      sx={{
        width: px,
        height: px,
        borderRadius: BORDER_RADIUS_SM,
        backgroundColor: live ? GREEN : WHITE,
        border: `${borderWidth}px solid ${live ? NAVY : alpha(NAVY, 0.25)}`,
        color: live ? NAVY : alpha(NAVY, 0.4),
        fontSize,
        fontWeight: 700,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT_FAMILY_MARKETING,
      }}
    >
      {letter}
    </Box>
  );
};
