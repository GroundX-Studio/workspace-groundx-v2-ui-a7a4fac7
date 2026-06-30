/**
 * GxPill — non-interactive status indicator.
 *
 * Use for status, metadata, and source labels where color reinforces a
 * literal word. Pass `onClick` only when the pill is an intentional control.
 */

import { Box, ButtonBase } from "@mui/material";
import { ElementType, MouseEventHandler, ReactNode } from "react";

import {
  BORDER_RADIUS_PILL,
  CYAN,
  FONT_SIZE_LABEL,
  FONT_SIZE_LABEL_DENSE,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_CHIP,
  LIGHTER_RED,
  LINE_HEIGHT_CARD_SUBHEAD,
  NAVY,
  WARNING_AMBER,
} from "@/constants";

type GxPillVariant = "default" | "success" | "warning" | "error" | "info";

export interface GxPillProps {
  children: ReactNode;
  variant?: GxPillVariant;
  onClick?: MouseEventHandler<HTMLElement>;
  dense?: boolean;
}

const STYLES: Record<GxPillVariant, { bg: string; fg: string }> = {
  default: { bg: CYAN, fg: NAVY },
  success: { bg: GREEN, fg: NAVY },
  warning: { bg: WARNING_AMBER, fg: NAVY },
  error: { bg: LIGHTER_RED, fg: NAVY },
  info: { bg: NAVY, fg: GREEN },
};

export function GxPill({
  children,
  variant = "default",
  dense = false,
  onClick,
}: GxPillProps) {
  const { bg, fg } = STYLES[variant];
  const Component: ElementType = onClick ? ButtonBase : Box;

  return (
    <Component
      onClick={onClick}
      {...(onClick ? { disableRipple: true } : {})}
      sx={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bg,
        color: fg,
        fontSize: dense ? FONT_SIZE_LABEL_DENSE : FONT_SIZE_LABEL,
        fontWeight: FONT_WEIGHT_LABEL,
        letterSpacing: LETTER_SPACING_CHIP,
        px: dense ? 1 : 1.25,
        py: dense ? 0.25 : 0.5,
        borderRadius: BORDER_RADIUS_PILL,
        lineHeight: LINE_HEIGHT_CARD_SUBHEAD,
        whiteSpace: "nowrap",
        ...(onClick && {
          cursor: "pointer",
          "&:hover": { filter: "brightness(1.05)" },
        }),
      }}
    >
      {children}
    </Component>
  );
}

export default GxPill;
