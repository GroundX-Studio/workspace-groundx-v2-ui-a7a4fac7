/**
 * CommonSubmitButton — the canonical GroundX Studio Harness primary action button.
 *
 * Green fill, navy text, full-pill shape (BORDER_RADIUS_PILL). On hover the
 * fill flips to navy and the label flips to green — the brand's "rest →
 * intent" convention with WCAG-compliant contrast. Pass `invert` to start in
 * the green state (useful for
 * secondary confirm actions where you don't want to fight the primary CTA on
 * the same screen).
 *
 * Notes on behavior:
 *   - `isUppercase` controls `textTransform` (default true; pass false for
 *     sentence-case labels).
 *   - `type` defaults to "button" so use inside a <form> doesn't accidentally
 *     submit; pass `type="submit"` explicitly when you want submit semantics.
 *   - Every value comes from a brand token — no hex literals, no raw px
 *     radii.
 */

import { FC, MouseEvent, ReactNode } from "react";
import Button, { ButtonProps } from "@mui/material/Button";

import {
  BORDER_RADIUS_PILL,
  FONT_WEIGHT_LABEL,
  GREEN,
  LETTER_SPACING_CHIP,
  NAVY,
} from "../../constants";

interface CommonSubmitButtonProps extends ButtonProps {
  fullWidth?: boolean;
  /** Start in the green-fill / navy-text "inverted" state. */
  invert?: boolean;
  /** Render label in UPPERCASE. Defaults to true because most primary CTAs use it. */
  isUppercase?: boolean;
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLElement>) => void;
}

export const CommonSubmitButton: FC<CommonSubmitButtonProps> = ({
  children,
  onClick,
  fullWidth = false,
  invert = false,
  isUppercase = true,
  type = "button",
  ...props
}) => {
  return (
    <Button
      {...props}
      disableRipple
      fullWidth={fullWidth}
      onClick={onClick}
      type={type}
      variant="contained"
      sx={{
        backgroundColor: invert ? NAVY : GREEN,
        color: invert ? GREEN : NAVY,
        fontWeight: FONT_WEIGHT_LABEL,
        borderRadius: BORDER_RADIUS_PILL,
        boxShadow: "none",
        textTransform: isUppercase ? "uppercase" : "none",
        letterSpacing: isUppercase ? LETTER_SPACING_CHIP : undefined,
        "&:hover": {
          backgroundColor: invert ? GREEN : NAVY,
          color: invert ? NAVY : GREEN,
          boxShadow: "none",
        },
        ...props.sx,
      }}
    >
      {children}
    </Button>
  );
};

export default CommonSubmitButton;
