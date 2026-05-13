/**
 * CommonToolTip — styled MUI Tooltip with GroundX Studio Harness chrome.
 *
 * Use as the low-level tooltip wrapper. For educational widget explanations,
 * prefer EducationalTooltip so the trigger, icon, accessible label, and touch
 * behavior stay consistent.
 */

import { Tooltip, TooltipProps, tooltipClasses } from "@mui/material";
import { styled } from "@mui/material/styles";

import {
  BORDER_RADIUS,
  FONT_SIZE_CAPTION,
  FONT_WEIGHT_BODY,
  NAVY,
  WHITE,
} from "../../constants";

export const CommonToolTip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
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

export default CommonToolTip;
