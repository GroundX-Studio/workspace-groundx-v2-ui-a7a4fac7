/**
 * IconButton — primitive icon-only button.
 *
 * Mirrors MUI's `IconButton` / `Button` split: this primitive is the
 * icon-only sibling of `Button`. Use for close affordances, dismiss
 * actions, edit buttons, etc. — anything that's labeled by aria-label
 * + a glyph rather than visible text.
 *
 * Defaults are tuned for the dominant use case (a dismiss "×" button
 * inside a card / dialog header):
 *
 *   • `icon` defaults to `<CloseIcon />` since that's the most common
 *     usage in the codebase. Pass `icon={<EditIcon />}` etc. for others.
 *   • `aria-label` defaults to `"close"` — override for semantic
 *     accuracy ("dismiss notification", "edit field", etc.).
 *   • `size="small"` by default.
 *
 * Inherits the theme's `MuiIconButton` override (CYAN background +
 * GREEN hover) via the brand theme.
 *
 * Replaces `CommonCloseIcon` (ARCH-16).
 */

import CloseIcon from "@mui/icons-material/Close";
import MuiIconButton, {
  type IconButtonProps as MuiIconButtonProps,
} from "@mui/material/IconButton";
import { type FC, type ReactNode } from "react";

export interface IconButtonProps extends Omit<MuiIconButtonProps, "children"> {
  /** The icon glyph. Defaults to `<CloseIcon />` since close is dominant. */
  icon?: ReactNode;
  /** Optional children — typically a badge overlay over the icon. */
  children?: ReactNode;
}

export const IconButton: FC<IconButtonProps> = ({
  icon,
  size = "small",
  "aria-label": ariaLabel,
  children,
  ...rest
}) => {
  const glyph =
    icon ?? <CloseIcon fontSize={size === "large" ? "medium" : "small"} />;
  return (
    <MuiIconButton
      {...rest}
      size={size}
      aria-label={ariaLabel ?? "close"}
      disableRipple
      data-button-variant="icon"
    >
      {glyph}
      {children}
    </MuiIconButton>
  );
};

export default IconButton;
