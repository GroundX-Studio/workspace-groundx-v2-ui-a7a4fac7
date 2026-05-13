/**
 * CommonTextField — wrapped MUI TextField with the GroundX Studio Harness form defaults.
 *
 * White input background, outlined variant, INPUT_BORDER outline,
 * FOCUS_RING outline, and BORDER_RADIUS (6px) corners matching the
 * brand's input radius.
 * Top margin matches the rhythm used in modal forms — pass `dense` to drop
 * it when composing in a Stack with explicit gap spacing.
 *
 * Font family is set explicitly so the native <input> picks up Inter even
 * if the global body-level override doesn't cascade through MUI's outlined
 * variant.
 */

import TextField, { OutlinedTextFieldProps } from "@mui/material/TextField";
import { FC } from "react";

import { BORDER_RADIUS, FOCUS_RING, FONT_FAMILY, GREEN, INPUT_BORDER, NAVY, WHITE } from "../../constants";

// Omit `variant` from the props type — the wrapper hardcodes "outlined" so
// callers don't have to pass it (and can't override it).
export interface CommonTextFieldProps
  extends Omit<OutlinedTextFieldProps, "variant"> {
  /** Drop the default top margin (use inside explicit-spacing layouts). */
  dense?: boolean;
}

export const CommonTextField: FC<CommonTextFieldProps> = ({
  dense = false,
  ...props
}) => {
  return (
    <TextField
      {...props}
      variant="outlined"
      sx={{
        mt: dense ? 0 : 2,
        input: {
          background: WHITE,
          fontFamily: FONT_FAMILY,
        },
        "& .MuiOutlinedInput-root": {
          borderRadius: BORDER_RADIUS,
          backgroundColor: WHITE,
          "& .MuiOutlinedInput-notchedOutline": {
            borderColor: INPUT_BORDER,
          },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: NAVY,
          },
          "&.Mui-focused": {
            outline: `3px solid ${FOCUS_RING}`,
          },
          "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
            borderColor: GREEN,
            borderWidth: 1,
          },
        },
        ...props.sx,
      }}
    />
  );
};

export default CommonTextField;
