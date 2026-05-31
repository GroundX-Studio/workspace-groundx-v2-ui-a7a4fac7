/**
 * SuggestedActionChips — chat-widget that renders the middleware's
 * `reply.suggestedActions[]` array as a row of clickable chips beneath
 * an assistant bubble.
 *
 * widget-llm-integration Phase 1 (2026-05-27): closes the dark loop
 * where the chat router emitted suggestions and the frontend silently
 * dropped them. Click invokes the host-supplied `onAction(action)`
 * callback; the host translates the action into an orchestrator
 * dispatch (e.g., `suggested-intent` → `switchFrame` for "show-extract").
 *
 * Phase 3 will retire host-side translation in favor of the declarative
 * tool registry — each action will carry its full `CanvasIntent`
 * payload in `detail.intent` and dispatch via the registry directly.
 * For now the host owns the mapping so we can ship this floor without
 * the full registry.
 *
 * Mode semantics:
 *   • `onboarding` (default): same chip rendering; reserved for future
 *     onboarding-only locks (e.g. dimming destructive actions during
 *     guided steps).
 *   • `steady`: same chips; reserved for future steady-only affordances
 *     (e.g. a settings shortcut chip).
 *   The two modes render identically today — the prop exists for the
 *   widget contract and to absorb future mode-conditional behavior
 *   without changing the API.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import { type FC } from "react";

import {
  BORDER,
  BORDER_RADIUS_PILL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  NAVY,
  WHITE,
} from "@/constants";

export interface SuggestedAction {
  key: string;
  label: string;
  detail?: Record<string, unknown>;
}

export interface SuggestedActionChipsProps {
  actions: SuggestedAction[];
  /** Locked-affordance gate (widget contract). Defaults to "onboarding". */
  mode?: "onboarding" | "steady";
  /** Click handler. Host translates the action into orchestrator behavior. */
  onAction?: (action: SuggestedAction) => void;
}

export const SuggestedActionChips: FC<SuggestedActionChipsProps> = ({
  actions,
  mode = "onboarding",
  onAction,
}) => {
  if (actions.length === 0) return null;
  return (
    <Stack
      direction="row"
      spacing={0.5}
      data-testid="suggested-action-chips"
      data-mode={mode}
      sx={{ pl: 0.25, flexWrap: "wrap", rowGap: 0.5 }}
    >
      {actions.map((action) => (
        <Box
          key={action.key}
          role="button"
          tabIndex={0}
          data-testid={`suggested-action-chip-${action.key}`}
          data-action-key={action.key}
          aria-label={action.label}
          onClick={() => onAction?.(action)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onAction?.(action);
            }
          }}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            height: 22,
            px: 1.25,
            borderRadius: BORDER_RADIUS_PILL,
            backgroundColor: WHITE,
            border: `1px solid ${BORDER}`,
            color: NAVY,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            lineHeight: 1,
            cursor: "pointer",
            transition: "background-color 120ms ease, border-color 120ms ease",
            "&:hover": { backgroundColor: alpha(NAVY, 0.05), borderColor: alpha(NAVY, 0.4) },
            "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
          }}
        >
          {action.label}
        </Box>
      ))}
    </Stack>
  );
};
