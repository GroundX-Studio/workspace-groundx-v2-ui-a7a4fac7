/**
 * Widget Template — canonical starting point for a new widget.
 *
 * **COPY THIS DIR** to `components/chat-widgets/<Name>/` (chat surface)
 * or `components/viewer-widgets/<Name>/` (viewer pane), rename
 * `Template` → `<Name>` everywhere, fill in the TODO markers, and
 * delete this header. The drift-guard test
 * (`app/src/test/widget-contract.test.ts`) skips any directory
 * starting with `_` so this file is exempt by placement.
 *
 * Mandatory contract surfaces are exercised here so a fresh agent
 * can see them in one place:
 *
 *   • `mode: "onboarding" | "steady"` prop
 *   • Locked affordance under `mode="onboarding"` (the demo button)
 *   • `data-mode` attribute for visual + drift-guard inspection
 *   • Stable testids of the form `template-<slug>`
 *
 * See `Template.test.tsx` for the canonical three tests and
 * `Template.tools.ts` for the read + mutate tool declaration.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { type FC } from "react";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  FONT_SIZE_CAPTION,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
  WHITE,
} from "@/constants";

export interface TemplateProps {
  /**
   * Locked-affordance gate. `onboarding` HIDES the demo edit button;
   * `steady` exposes it. Mirror this pattern when adding a new widget:
   * any edit / save / destructive control is conditional on
   * `mode === "steady"`.
   */
  mode?: "onboarding" | "steady";
  /** Display label (replace with real widget props). */
  label?: string;
  /** Fired when the demo edit button activates (steady mode only). */
  onEdit?: () => void;
}

export const Template: FC<TemplateProps> = ({
  mode = "onboarding",
  label = "Hello, widget.",
  onEdit,
}) => {
  return (
    <Box
      data-testid="template-root"
      data-mode={mode}
      sx={{
        px: 1.25,
        py: 0.75,
        borderRadius: BORDER_RADIUS_2X,
        backgroundColor: WHITE,
        border: `1px solid ${BORDER}`,
        color: BODY_TEXT,
        fontSize: FONT_SIZE_CAPTION,
      }}
    >
      <Stack spacing={0.75}>
        <Box data-testid="template-label">{label}</Box>
        {mode === "steady" && (
          <Box
            role="button"
            tabIndex={0}
            data-testid="template-edit"
            onClick={onEdit}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onEdit?.();
              }
            }}
            sx={{
              alignSelf: "flex-start",
              px: 1,
              py: 0.25,
              borderRadius: BORDER_RADIUS_2X,
              backgroundColor: GREEN,
              color: NAVY,
              fontSize: FONT_SIZE_LABEL,
              fontWeight: FONT_WEIGHT_LABEL,
              cursor: "pointer",
              "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
            }}
          >
            Edit
          </Box>
        )}
      </Stack>
    </Box>
  );
};
