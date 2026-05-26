/**
 * Heading — primitive typography for h1-h6 + display headings.
 *
 * Wraps MUI Typography with brand-locked font weight + tracking +
 * color defaults pulled from the theme. Use instead of
 * `<Typography variant="h2" sx={{ fontWeight: ..., color: ... }}>`
 * across the codebase.
 *
 * Brand defaults (see `constants.generated.ts`):
 *   - color: NAVY
 *   - fontWeight: FONT_WEIGHT_HEADLINE (700)
 *   - lineHeight + letterSpacing: per level
 *
 * Eight semantic levels:
 *   - display-lg / display-md — hero copy
 *   - h1 / h2 / h3 / h4 / h5 / h6 — document sections
 */

import MuiTypography, {
  type TypographyProps as MuiTypographyProps,
} from "@mui/material/Typography";
import { type ElementType, type FC, type ReactNode } from "react";

import {
  FONT_WEIGHT_DISPLAY,
  FONT_WEIGHT_HEADLINE,
  LETTER_SPACING_DISPLAY_TIGHT,
  LETTER_SPACING_HEADING_TIGHT,
  LINE_HEIGHT_DISPLAY,
  LINE_HEIGHT_HEADING,
  LINE_HEIGHT_SECTION,
  LINE_HEIGHT_SUBSECTION,
  NAVY,
} from "@/constants";

export type HeadingLevel = "display-lg" | "display-md" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface HeadingProps extends Omit<MuiTypographyProps, "variant" | "component"> {
  level?: HeadingLevel;
  /** HTML element override. Defaults match the level (h1→h1 etc.). */
  component?: ElementType;
  children: ReactNode;
}

// MUI variant + per-level brand defaults.
const LEVEL_CONFIG: Record<HeadingLevel, {
  variant: MuiTypographyProps["variant"];
  defaultElement: ElementType;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: string;
}> = {
  "display-lg": {
    variant: "h1",
    defaultElement: "h1",
    fontWeight: FONT_WEIGHT_DISPLAY,
    lineHeight: LINE_HEIGHT_DISPLAY,
    letterSpacing: LETTER_SPACING_DISPLAY_TIGHT,
  },
  "display-md": {
    variant: "h2",
    defaultElement: "h1",
    fontWeight: FONT_WEIGHT_DISPLAY,
    lineHeight: LINE_HEIGHT_DISPLAY,
    letterSpacing: LETTER_SPACING_DISPLAY_TIGHT,
  },
  h1: {
    variant: "h1",
    defaultElement: "h1",
    fontWeight: FONT_WEIGHT_HEADLINE,
    lineHeight: LINE_HEIGHT_HEADING,
    letterSpacing: LETTER_SPACING_HEADING_TIGHT,
  },
  h2: {
    variant: "h2",
    defaultElement: "h2",
    fontWeight: FONT_WEIGHT_HEADLINE,
    lineHeight: LINE_HEIGHT_HEADING,
    letterSpacing: LETTER_SPACING_HEADING_TIGHT,
  },
  h3: {
    variant: "h3",
    defaultElement: "h3",
    fontWeight: FONT_WEIGHT_HEADLINE,
    lineHeight: LINE_HEIGHT_SECTION,
    letterSpacing: LETTER_SPACING_HEADING_TIGHT,
  },
  h4: {
    variant: "h4",
    defaultElement: "h4",
    fontWeight: FONT_WEIGHT_HEADLINE,
    lineHeight: LINE_HEIGHT_SECTION,
    letterSpacing: LETTER_SPACING_HEADING_TIGHT,
  },
  h5: {
    variant: "h5",
    defaultElement: "h5",
    fontWeight: FONT_WEIGHT_HEADLINE,
    lineHeight: LINE_HEIGHT_SUBSECTION,
    letterSpacing: LETTER_SPACING_HEADING_TIGHT,
  },
  h6: {
    variant: "h6",
    defaultElement: "h6",
    fontWeight: FONT_WEIGHT_HEADLINE,
    lineHeight: LINE_HEIGHT_SUBSECTION,
    letterSpacing: LETTER_SPACING_HEADING_TIGHT,
  },
};

export const Heading: FC<HeadingProps> = ({
  level = "h2",
  component,
  children,
  sx,
  ...rest
}) => {
  const cfg = LEVEL_CONFIG[level];
  return (
    <MuiTypography
      {...rest}
      variant={cfg.variant}
      component={component ?? cfg.defaultElement}
      data-typography="heading"
      data-typography-level={level}
      sx={{
        color: NAVY,
        fontWeight: cfg.fontWeight,
        lineHeight: cfg.lineHeight,
        letterSpacing: cfg.letterSpacing,
        ...sx,
      }}
    >
      {children}
    </MuiTypography>
  );
};

export default Heading;
