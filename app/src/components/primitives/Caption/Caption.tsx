/**
 * Caption — primitive typography for captions + microcopy.
 *
 * The smallest typography size in the brand system. Use for:
 *   - image / figure captions
 *   - microcopy ("we won't email you", "powered by Calendly")
 *   - timestamp / metadata lines
 *   - field-help text below inputs
 *
 * Brand defaults:
 *   - color: MUTED_ON_LIGHT (lower-contrast for de-emphasized text)
 *   - fontWeight: FONT_WEIGHT_BODY (400)
 *   - lineHeight: LINE_HEIGHT_TIGHT_BODY (1.5)
 */

import MuiTypography, {
  type TypographyProps as MuiTypographyProps,
} from "@mui/material/Typography";
import { type ElementType, type FC, type ReactNode } from "react";

import {
  FONT_WEIGHT_BODY,
  LINE_HEIGHT_TIGHT_BODY,
  MUTED_ON_LIGHT,
} from "@/constants";

export interface CaptionProps extends Omit<MuiTypographyProps, "variant" | "component"> {
  /** HTML element override. Defaults to `<span>`. */
  component?: ElementType;
  children: ReactNode;
}

export const Caption: FC<CaptionProps> = ({
  component = "span",
  children,
  sx,
  ...rest
}) => (
  <MuiTypography
    {...rest}
    variant="caption"
    component={component}
    data-typography="caption"
    sx={{
      color: MUTED_ON_LIGHT,
      fontWeight: FONT_WEIGHT_BODY,
      lineHeight: LINE_HEIGHT_TIGHT_BODY,
      display: "inline-block",
      ...sx,
    }}
  >
    {children}
  </MuiTypography>
);

export default Caption;
