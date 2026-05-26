/**
 * EducationalTooltip — standard "what is this widget?" explanation trigger.
 *
 * Use beside widget titles, section headers, metrics, empty states, and
 * unfamiliar controls. It is intentionally icon-only so education is available
 * without crowding dense product surfaces.
 */

import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import IconButton from "@mui/material/IconButton";
import { ReactNode } from "react";

import { DARK_GREY, NAVY } from "@/constants";

import { Tooltip as BrandTooltip } from "@/components/primitives/Tooltip/Tooltip";

export interface EducationalTooltipProps {
  /** Tooltip body. Keep it concise and user-facing. */
  title: ReactNode;
  /** Accessible name for the info trigger, e.g. "About usage metrics". */
  ariaLabel: string;
  /** Placement relative to the trigger. Defaults to right for header use. */
  placement?: "bottom" | "left" | "right" | "top";
}

export function EducationalTooltip({
  title,
  ariaLabel,
  placement = "right",
}: EducationalTooltipProps) {
  return (
    <BrandTooltip
      arrow
      title={title}
      placement={placement}
      enterTouchDelay={0}
      leaveTouchDelay={4000}
    >
      <IconButton
        type="button"
        size="small"
        aria-label={ariaLabel}
        sx={{
          color: DARK_GREY,
          flexShrink: 0,
          height: 24,
          ml: 1,
          p: 0.25,
          width: 24,
          "&:hover": {
            color: NAVY,
          },
        }}
      >
        <InfoOutlinedIcon fontSize="small" />
      </IconButton>
    </BrandTooltip>
  );
}

export default EducationalTooltip;
