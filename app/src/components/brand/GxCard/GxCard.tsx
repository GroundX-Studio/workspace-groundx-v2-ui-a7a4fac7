/**
 * GxCard — the canonical GroundX Studio Harness surface.
 *
 * Every card-shaped surface in any GroundX Studio Harness web project — dashboard card, feature
 * tile on a landing page, pricing tier, testimonial block, docs sidebar
 * wrapper — uses this wrapper. Flat white fill, 1px BORDER hairline (10%
 * navy), no shadow, BORDER_RADIUS_CARD (20px) rounding. The wrapper bakes
 * those choices in so a brand-wide tweak (radius, border, padding) updates
 * every card in every project at once.
 *
 * Older codebases sometimes express the same surface inline (raw MUI
 * `<Card>` with elevation undone, or `<Box>` with a copy-pasted `sx` block).
 * Replace those with `GxCard` when you touch the file.
 *
 * Pass a `radius` of "lg" (20px, default) for top-level cards, or "sm" (6px)
 * for nested sub-surfaces like inner table wrappers.
 *
 * Pass `interactive` to get a subtle hover lift for clickable cards.
 */

import { Box, BoxProps } from "@mui/material";
import { forwardRef } from "react";

import {
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_CARD,
  PADDING,
  WHITE,
} from "@/constants";

export interface GxCardProps extends BoxProps {
  /** Corner rounding. "lg" = top-level card, "sm" = nested surface. */
  radius?: "lg" | "sm";
  /** Adds a hover state for clickable cards. */
  interactive?: boolean;
  /** Remove inner padding (use when you fully control the inside). */
  noPadding?: boolean;
}

export const GxCard = forwardRef<HTMLDivElement, GxCardProps>(function GxCard(
  { radius = "lg", interactive = false, noPadding = false, sx, children, ...rest },
  ref,
) {
  const borderRadius = radius === "lg" ? BORDER_RADIUS_CARD : BORDER_RADIUS;

  return (
    <Box
      ref={ref}
      sx={{
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        borderRadius,
        boxShadow: "none",
        padding: noPadding ? 0 : PADDING,
        ...(interactive && {
          cursor: "pointer",
          transition: "border-color 160ms ease, transform 160ms ease",
          "&:hover": {
            borderColor: "primary.main",
          },
        }),
        ...sx,
      }}
      {...rest}
    >
      {children}
    </Box>
  );
});

export default GxCard;
