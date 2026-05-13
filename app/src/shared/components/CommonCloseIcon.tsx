/**
 * CommonCloseIcon — small IconButton with a CloseIcon glyph, pre-labelled.
 *
 * Drops into a modal title row, a panel header, an alert dismiss slot, or
 * any other "close this" affordance. Defaults to `size="small"` and
 * `aria-label="close"` so callers don't have to repeat boilerplate.
 *
 * The IconButton inherits the theme's CYAN background + GREEN hover from
 * the MuiIconButton override in src/theme.ts.
 */

import { IconButton, IconButtonProps } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";

interface CommonCloseIconProps extends IconButtonProps {
  size?: IconButtonProps["size"];
}

export function CommonCloseIcon({
  size = "small",
  "aria-label": ariaLabel = "close",
  ...props
}: CommonCloseIconProps) {
  return (
    <IconButton size={size} aria-label={ariaLabel} disableRipple {...props}>
      <CloseIcon fontSize={size === "large" ? "medium" : "small"} />
    </IconButton>
  );
}

export default CommonCloseIcon;
