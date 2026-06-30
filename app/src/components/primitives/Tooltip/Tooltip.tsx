/**
 * Tooltip — styled MUI Tooltip with brand chrome.
 *
 * Renamed from `CommonToolTip` in ARCH-16 (2026-05-26) when primitives
 * were reorganized. Use as the low-level tooltip wrapper. For
 * educational widget explanations, prefer `EducationalTooltip` (in
 * `components/brand/`) so the trigger, icon, accessible label, and
 * touch behavior stay consistent.
 *
 * Follows MUI per the locked rule (`memory/feedback_follow_mui.md`):
 * same prop surface as `@mui/material/Tooltip`; brand styling layered
 * on top via `styled()`.
 */

import {
  Tooltip as MuiTooltip,
  type TooltipProps,
  tooltipClasses,
} from "@mui/material";
import { styled } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_BODY,
  NAVY,
  WHITE,
} from "@/constants";

export const Tooltip = styled(({ className, ...props }: TooltipProps) => (
  <MuiTooltip {...props} classes={{ popper: className }} />
))(() => ({
  [`& .${tooltipClasses.tooltip}`]: {
    backgroundColor: NAVY,
    color: WHITE,
    fontSize: FONT_SIZE_CAPTION,
    fontWeight: FONT_WEIGHT_BODY,
    borderRadius: BORDER_RADIUS,
    padding: "6px 10px",
    boxShadow: "none",
  },
  [`& .${tooltipClasses.arrow}`]: {
    color: NAVY,
  },
}));

export default Tooltip;
