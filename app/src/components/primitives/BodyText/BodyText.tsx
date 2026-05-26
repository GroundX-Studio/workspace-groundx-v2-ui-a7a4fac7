/**
 * BodyText — primitive typography for body copy.
 *
 * Wraps MUI Typography with brand-locked weight + color defaults
 * pulled from the theme. Use instead of
 * `<Typography variant="body1" sx={{ color: ..., fontWeight: ... }}>`
 * across the codebase.
 *
 * Brand defaults:
 *   - color: BODY_TEXT
 *   - fontWeight: FONT_WEIGHT_BODY (400)
 *   - lineHeight: LINE_HEIGHT_BODY (1.6)
 *
 * Two sizes:
 *   - `size="md"` (default) — standard body copy
 *   - `size="sm"` — smaller body copy / supporting text
 */

import MuiTypography, {
  type TypographyProps as MuiTypographyProps,
} from "@mui/material/Typography";
import { type ElementType, type FC, type ReactNode } from "react";

import { BODY_TEXT, FONT_WEIGHT_BODY, LINE_HEIGHT_BODY } from "@/constants";

export type BodyTextSize = "md" | "sm";

export interface BodyTextProps extends Omit<MuiTypographyProps, "variant" | "component"> {
  size?: BodyTextSize;
  /** HTML element override. Defaults to `<p>`. */
  component?: ElementType;
  children: ReactNode;
}

export const BodyText: FC<BodyTextProps> = ({
  size = "md",
  component = "p",
  children,
  sx,
  ...rest
}) => (
  <MuiTypography
    {...rest}
    variant={size === "md" ? "body1" : "body2"}
    component={component}
    data-typography="body"
    data-typography-size={size}
    sx={{
      color: BODY_TEXT,
      fontWeight: FONT_WEIGHT_BODY,
      lineHeight: LINE_HEIGHT_BODY,
      ...sx,
    }}
  >
    {children}
  </MuiTypography>
);

export default BodyText;
