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
 * Role + scope (2026-05-30-widget-role-access):
 *   • `role: WidgetRole` — authorization, not a chat phase. Per the
 *     widget access matrix this widget is available to ALL roles
 *     (`anonymous` + `member`) and locks NO affordance by role — the
 *     chips render identically. The prop satisfies the widget contract
 *     and reserves space for future role-conditional locks (e.g. dimming
 *     destructive actions for a read-only role) without an API change.
 *     This replaces the retired binary `mode` prop, which was cosmetic
 *     here, so it is simply dropped.
 *   • `scope: WidgetScope` — required by the contract. This is a
 *     display/actions widget, not a ScopedViewerWidget, so it always
 *     takes `{ type: "none" }`.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { alpha } from "@mui/material/styles";
import { type FC } from "react";

import type { SuggestedAction, WidgetRole, WidgetScope } from "@groundx/shared";

import {
  BORDER,
  BORDER_RADIUS_PILL,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  NAVY,
  WHITE,
} from "@/constants";

// 2026-05-31-core-data-followups §4 #13 — the chip shape is single-sourced on
// `@groundx/shared`. Re-export so existing `import { SuggestedAction } from
// "./SuggestedActionChips"` call-sites keep working while the type lives once.
export type { SuggestedAction };

export interface SuggestedActionChipsProps {
  actions: SuggestedAction[];
  /**
   * Authorization role (widget contract). All roles see this widget and
   * no affordance is locked by role today — see the access matrix.
   */
  role: WidgetRole;
  /**
   * Content scope (widget contract, REQUIRED). This is a display/actions
   * widget, not a ScopedViewerWidget, so the host always passes
   * `{ type: "none" }`.
   */
  scope: WidgetScope;
  /** Click handler. Host translates the action into orchestrator behavior. */
  onAction?: (action: SuggestedAction) => void;
}

export const SuggestedActionChips: FC<SuggestedActionChipsProps> = ({
  actions,
  role,
  scope: _scope,
  onAction,
}) => {
  if (actions.length === 0) return null;
  return (
    <Stack
      direction="row"
      spacing={0.5}
      data-testid="suggested-action-chips"
      data-role={role}
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
