/**
 * Label — primitive typography for labels, eyebrows, and form labels.
 *
 * Wraps MUI Typography with brand-locked tracking + weight for the
 * "smaller all-caps marker" treatment used throughout the codebase
 * (capability badges, eyebrows above headings, form input labels).
 *
 * Brand defaults:
 *   - color: NAVY (or EYEBROW_ON_LIGHT for eyebrow variant)
 *   - fontWeight: FONT_WEIGHT_LABEL (600)
 *   - letterSpacing: LETTER_SPACING_LABEL ("0.12em")
 *   - textTransform: uppercase for eyebrow; mixed-case for form labels
 *
 * Two variants:
 *   - `variant="form"` (default) — form input label / inline marker
 *   - `variant="eyebrow"` — uppercase eyebrow above a heading
 */

import MuiTypography, {
  type TypographyProps as MuiTypographyProps,
} from "@mui/material/Typography";
import { type ElementType, type FC, type ReactNode } from "react";

import {
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_LABEL,
  LETTER_SPACING_LABEL,
  NAVY,
} from "@/constants";

export type LabelVariant = "form" | "eyebrow";

export interface LabelProps extends Omit<MuiTypographyProps, "variant" | "component"> {
  variant?: LabelVariant;
  /** HTML element override. Defaults to `<label>` only when htmlFor is present. */
  component?: ElementType;
  /** When variant="form", what input this label is for. */
  htmlFor?: string;
  children: ReactNode;
}

export const Label: FC<LabelProps> = ({
  variant = "form",
  component,
  htmlFor,
  children,
  sx,
  ...rest
}) => {
  const isEyebrow = variant === "eyebrow";
  const defaultElement: ElementType = !isEyebrow && htmlFor ? "label" : "span";
  return (
    <MuiTypography
      {...rest}
      variant={isEyebrow ? "overline" : "subtitle2"}
      component={component ?? defaultElement}
      htmlFor={!isEyebrow && htmlFor ? htmlFor : undefined}
      data-typography="label"
      data-typography-variant={variant}
      sx={{
        color: isEyebrow ? EYEBROW_ON_LIGHT : NAVY,
        fontWeight: FONT_WEIGHT_LABEL,
        letterSpacing: LETTER_SPACING_LABEL,
        textTransform: isEyebrow ? "uppercase" : "none",
        ...sx,
      }}
    >
      {children}
    </MuiTypography>
  );
};

export default Label;
