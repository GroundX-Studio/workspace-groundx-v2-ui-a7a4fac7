/**
 * GxSectionHeader — the "TUTORIAL" / "CONTENT" / "FEATURES" style label used
 * anywhere a region of a page needs a header row.
 *
 * Visually:
 *   - UPPERCASE label in navy, fontWeight 600, with a touch of letter-spacing
 *     so the all-caps setting doesn't get claustrophobic.
 *   - Optional education slot beside the label (typically EducationalTooltip).
 *   - Optional action slot on the right (typically a CommonSubmitButton).
 *   - Lives inside a GxCard (or any surface); this component renders the inner
 *     label row only, so the caller controls the surrounding surface.
 *
 * Usage:
 *   <GxCard>
 *     <GxSectionHeader
 *       label="FEATURES"
 *       education={<EducationalTooltip ariaLabel="About features" title="..." />}
 *       action={<CommonSubmitButton>+ Add</CommonSubmitButton>}
 *     />
 *   </GxCard>
 */

import { Box, Typography } from "@mui/material";
import { ReactNode } from "react";

import {
  FONT_SIZE_BODY,
  FONT_WEIGHT_LABEL,
  LETTER_SPACING_CHIP,
  NAVY,
} from "@/constants";

export interface GxSectionHeaderProps {
  /** The section label. Passed literally — write it UPPERCASE in the caller. */
  label: string;
  /** Optional education trigger explaining the section's purpose or data source. */
  education?: ReactNode;
  /** Optional right-aligned action (usually a button). */
  action?: ReactNode;
}

export function GxSectionHeader({ label, education, action }: GxSectionHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: 0.5,
          minWidth: 0,
        }}
      >
        <Typography
          component="h2"
          sx={{
            color: NAVY,
            fontWeight: FONT_WEIGHT_LABEL,
            fontSize: FONT_SIZE_BODY,
            letterSpacing: LETTER_SPACING_CHIP,
            // We deliberately don't apply textTransform: "uppercase" here. The
            // brand convention is to write "CONTENT" literally in JSX so that
            // translations and a11y tools see the shouty casing as content,
            // not a CSS afterthought (see eyelevel-design-standards/references/
            // typography.md ALL-CAPS rule).
          }}
        >
          {label}
        </Typography>
        {education}
      </Box>
      {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
    </Box>
  );
}

export default GxSectionHeader;
