/**
 * SuggestedActionChips — chat-widget that renders the middleware's
 * `reply.suggestedActions[]` array as a row of clickable chips beneath
 * an assistant bubble.
 *
 * widget-llm-integration Phase 1 (2026-05-27): closes the dark loop
 * where the chat router emitted suggestions and the frontend silently
 * dropped them. Click invokes the host-supplied `onAction(action)`
 * callback; the host translates the action into an orchestrator dispatch.
 *
 * Each action carries its full server-validated `CanvasIntent` payload on
 * `detail.intent` (mutate chips + standardized-viewer-control T7's OFFERED
 * navigation chips); the host's `suggestedActionToIntent` reads it and
 * dispatches through the orchestrator.
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
  LETTER_SPACING_PILL,
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
      sx={{ flexWrap: "wrap", rowGap: 0.5, minWidth: 0, maxWidth: "100%" }}
    >
      {actions.map((action) => (
        <Box
          key={action.key}
          role="button"
          tabIndex={0}
          data-testid={`suggested-action-chip-${action.key}`}
          data-action-key={action.key}
          aria-label={action.label}
          title={action.label}
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
            justifyContent: "center",
            height: 26,
            px: 1.25,
            // minWidth:0 lets this flex item shrink below its text's intrinsic
            // width so the inner span's ellipsis can engage instead of forcing
            // the row wider than the pane.
            minWidth: 0,
            // Stay a tidy single-line pill: labels are meant to be short, so a
            // long one truncates with an ellipsis (full text on hover / a11y)
            // rather than wrapping into a tall multi-line block. Cap width to
            // the pane so it never overflows horizontally either.
            maxWidth: "100%",
            borderRadius: BORDER_RADIUS_PILL,
            backgroundColor: WHITE,
            border: `1px solid ${BORDER}`,
            color: NAVY,
            fontSize: FONT_SIZE_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
            lineHeight: 1,
            letterSpacing: LETTER_SPACING_PILL,
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "background-color 120ms ease, border-color 120ms ease",
            "&:hover": { backgroundColor: alpha(NAVY, 0.05), borderColor: alpha(NAVY, 0.4) },
            "&:focus-visible": { outline: `2px solid ${NAVY}`, outlineOffset: 1 },
          }}
        >
          {/* NOTE: text-overflow:ellipsis works here ONLY because this span is a
              DIRECT flex child of the inline-flex chip (a flex item is blockified,
              giving the span the block formatting context ellipsis needs). If this
              markup changes so the span is no longer a direct flex child,
              truncation silently breaks — jsdom can't measure layout, so no unit
              test catches it (browser/e2e-verified instead). */}
          <Box
            component="span"
            sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {action.label}
          </Box>
        </Box>
      ))}
    </Stack>
  );
};
