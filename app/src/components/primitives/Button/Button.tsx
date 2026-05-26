/**
 * Button — the canonical text-bearing button primitive.
 *
 * Two variants, mirroring MUI's `contained` / `text` split but with
 * brand-locked styling baked in:
 *
 *   • `<Button variant="primary">` — green pill, navy text, full-pill
 *     radius, uppercase by default. Replaces `CommonSubmitButton`.
 *   • `<Button variant="secondary">` — text-style body-color label
 *     that lifts to green-on-navy on hover. Replaces `CommonCancelButton`.
 *
 * For icon-only actions, use the sibling `IconButton` primitive
 * (`@/components/primitives/IconButton/IconButton`). The split mirrors
 * MUI's own `Button` / `IconButton` separation — semantics differ
 * (one labels by text, the other by aria-label + glyph) and so the
 * APIs are intentionally split too.
 *
 * Brand rules: every value resolves to a theme token. No hex literals,
 * no raw px radii. Enforced by the `no-hardcoded-styles.test.ts`
 * drift guard once ARCH-17 expands coverage to `components/primitives/`.
 */

import MuiButton, { type ButtonProps as MuiButtonProps } from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { type FC, type MouseEvent, type ReactNode } from "react";

import {
  BODY_TEXT,
  BORDER_RADIUS_PILL,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_CHIP,
  NAVY,
  WHITE,
} from "@/constants";

export type ButtonVariant = "primary" | "secondary";

export interface ButtonProps extends Omit<MuiButtonProps, "variant"> {
  /**
   * Which visual treatment to render. `primary` = green pill for
   * "do the thing" CTAs; `secondary` = text-style for cancel actions.
   * Defaults to `primary`.
   */
  variant?: ButtonVariant;
  /** Required label content. */
  children: ReactNode;
  /**
   * Disable + show inline spinner for in-flight form submissions.
   * Only meaningful on `primary` — secondary doesn't render the spinner.
   */
  submitting?: boolean;
  /**
   * Start in the inverted state (navy fill + green text).
   * `primary`-only. Useful for secondary confirm actions on a screen
   * where the un-inverted green CTA would fight visually.
   */
  invert?: boolean;
  /**
   * UPPERCASE the label. Defaults to `true` for primary, `false` for
   * secondary, matching the brand's CTA typography contract.
   */
  isUppercase?: boolean;
}

export const Button: FC<ButtonProps> = ({
  variant = "primary",
  children,
  submitting = false,
  invert = false,
  isUppercase,
  onClick,
  type = "button",
  ...rest
}) => {
  const isPrimary = variant === "primary";
  const upper = isUppercase ?? isPrimary;
  const disabled = Boolean(rest.disabled || submitting);
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!onClick) return;
    onClick(event);
  };

  return (
    <MuiButton
      {...rest}
      type={type}
      aria-busy={submitting || undefined}
      disableRipple
      disabled={disabled}
      onClick={handleClick}
      variant={isPrimary ? "contained" : "text"}
      data-button-variant={variant}
      sx={{
        ...(isPrimary
          ? {
              backgroundColor: invert ? NAVY : GREEN,
              color: invert ? GREEN : NAVY,
              "&:hover": {
                backgroundColor: invert ? GREEN : NAVY,
                color: invert ? NAVY : GREEN,
                boxShadow: "none",
              },
              "&.Mui-disabled": {
                backgroundColor: invert ? NAVY : GREEN,
                color: invert ? GREEN : NAVY,
                opacity: 0.7,
              },
            }
          : {
              color: BODY_TEXT,
              border: `1px solid ${WHITE}`,
              "&:hover": {
                color: NAVY,
                backgroundColor: GREEN,
                boxShadow: "none",
              },
            }),
        fontWeight: FONT_WEIGHT_LABEL,
        borderRadius: BORDER_RADIUS_PILL,
        boxShadow: "none",
        textTransform: upper ? "uppercase" : "none",
        letterSpacing: upper ? LETTER_SPACING_CHIP : undefined,
        ...rest.sx,
      }}
    >
      {submitting && isPrimary ? (
        <CircularProgress
          aria-hidden="true"
          size={16}
          thickness={5}
          sx={{ color: "currentColor", mr: 1 }}
        />
      ) : null}
      {children}
    </MuiButton>
  );
};

export default Button;
