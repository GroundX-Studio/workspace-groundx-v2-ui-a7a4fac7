/**
 * ByoTile — a "locked CTA" tile used on F1 for the BYO row (Upload files /
 * Connect a source / Email it in) and reusable anywhere a section needs a
 * grayed-out "sign up to unlock" affordance with a child preview slot.
 *
 * Visually:
 *   • Tinted background, dashed or solid border (configurable)
 *   • Title + sub stacked top-left
 *   • Optional child slot for an inline preview (icon, logo grid, mono box, etc.)
 *   • Bottom CTA pill with icon + label
 *   • Hover unlocks the grayscale filter slightly
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import type { FC, ReactNode } from "react";

import {
  BORDER_RADIUS,
  BORDER_RADIUS_PILL,
  BYO_TILE_HEIGHT,
  FONT_FAMILY_MARKETING,
  FONT_WEIGHT_HEADLINE,
  GREEN,
  NAVY,
  ONBOARDING_SMALL_TEXT_FONT_SIZE,
  ONBOARDING_TILE_TITLE_FONT_SIZE,
  TINT,
  WHITE,
} from "@/constants";

export interface ByoTileProps {
  /** Stable test identifier; rendered as data-testid. */
  testId: string;
  title: string;
  sub: string;
  cta: string;
  ctaIcon: string;
  onClick: () => void;
  /** When "dashed", the border is dashed and the child preview renders to the left of the title. */
  accent?: "dashed";
  children?: ReactNode;
}

export const ByoTile: FC<ByoTileProps> = ({ testId, title, sub, cta, ctaIcon, onClick, accent, children }) => {
  return (
    <Box
      role="listitem"
      tabIndex={0}
      data-testid={testId}
      aria-label={`${title} (sign-in required)`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      sx={{
        height: BYO_TILE_HEIGHT,
        p: 1.5,
        boxSizing: "border-box",
        borderRadius: BORDER_RADIUS,
        border: accent === "dashed" ? `2px dashed ${alpha(NAVY, 0.25)}` : `1.5px solid ${alpha(NAVY, 0.25)}`,
        backgroundColor: alpha(TINT, 0.6),
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        cursor: "pointer",
        filter: "grayscale(0.35)",
        "&:hover": { filter: "grayscale(0.15)" },
        "&:focus-visible": { outline: `2px solid ${GREEN}`, outlineOffset: 2 },
      }}
    >
      <Box sx={{ display: "flex", gap: 1.25 }}>
        <Box sx={{ flexShrink: 0 }}>{children && accent === "dashed" ? children : null}</Box>
        <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontFamily: FONT_FAMILY_MARKETING,
              fontSize: ONBOARDING_TILE_TITLE_FONT_SIZE,
              fontWeight: FONT_WEIGHT_HEADLINE,
              lineHeight: 1.1,
              color: alpha(NAVY, 0.7),
            }}
          >
            {title}
          </Typography>
          <Typography sx={{ fontSize: ONBOARDING_SMALL_TEXT_FONT_SIZE, color: alpha(NAVY, 0.55) }}>{sub}</Typography>
          {!(children && accent === "dashed") ? <Box sx={{ mt: 0.75 }}>{children}</Box> : null}
        </Stack>
      </Box>
      <Box
        sx={{
          display: "inline-flex",
          alignItems: "center",
          gap: 0.75,
          alignSelf: "stretch",
          justifyContent: "center",
          px: 1.25,
          py: 0.5,
          borderRadius: BORDER_RADIUS_PILL,
          border: `1.5px solid ${GREEN}`,
          color: NAVY,
          backgroundColor: WHITE,
          fontSize: ONBOARDING_SMALL_TEXT_FONT_SIZE,
          fontWeight: 600,
        }}
      >
        <Box component="span" sx={{ color: GREEN, fontWeight: 700 }}>
          {ctaIcon}
        </Box>
        {cta}
      </Box>
    </Box>
  );
};
