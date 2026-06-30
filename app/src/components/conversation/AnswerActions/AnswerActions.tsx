/**
 * AnswerActions — report-pin-affordance.
 *
 * The COMPACT per-answer actions control rendered in an answer turn's affordance
 * row (alongside the citation chips), replacing the old full-width "📌 pin to
 * report" pill. Driven by an ACTION LIST so future per-answer actions are added
 * by appending an item, NOT by restructuring:
 *   • 1 action  → a single inline control (icon button, or the action's own node)
 *   • ≥2 actions → a kebab (⋯) overflow menu — same component, keyed off length,
 *                  with NO call-site change.
 * Pin-to-report is the sole action today (its node = the compact
 * `PinToReportAction`). The ≥2 branch ships now (the composable axis is real) and
 * is unit-tested with a synthetic 2-action fixture so it isn't dormant.
 *
 * This is an INTERNAL component under `components/` (so `no-hardcoded-styles`
 * enforces tokens) but OUTSIDE the `chat-widgets/`/`viewer-widgets/` slots (so the
 * widget contract — README + mode prop + `.tools.ts` — does not apply).
 */

import Box from "@mui/material/Box";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { useState, type FC, type ReactNode } from "react";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS_2X,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  NAVY,
  WHITE,
} from "@/constants";

export interface AnswerAction {
  /** Stable id (also the per-action testid suffix). */
  id: string;
  /** Accessible label (the kebab menu row text + the inline button's aria-label). */
  label: string;
  /** Glyph shown on the control. */
  icon: ReactNode;
  /**
   * A self-rendering control (e.g. the compact `PinToReportAction`). When present
   * it is rendered as-is for the single-action inline case.
   */
  node?: ReactNode;
  /** A simple select handler — used for kebab menu items + simple inline actions. */
  onSelect?: () => void;
}

const triggerSx = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: `1px solid ${BORDER}`,
  backgroundColor: WHITE,
  color: NAVY,
  borderRadius: BORDER_RADIUS_2X,
  minWidth: 28,
  height: 28,
  px: 0.75,
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: FONT_SIZE_LABEL,
  fontWeight: FONT_WEIGHT_LABEL,
  "&:focus-visible": { outline: `2px solid ${NAVY}` },
} as const;

export const AnswerActions: FC<{ actions: AnswerAction[] }> = ({ actions }) => {
  // MUI Menu (anchored, focus- + act-correct) for the ≥2 overflow case.
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const open = Boolean(anchorEl);
  if (actions.length === 0) return null;

  return (
    <Box
      data-testid="answer-actions"
      sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.25, flexWrap: "wrap" }}
    >
      {actions.length === 1 ? (
        actions[0].node ?? (
          <Box
            component="button"
            type="button"
            data-testid={`answer-action-${actions[0].id}`}
            aria-label={actions[0].label}
            onClick={actions[0].onSelect}
            sx={triggerSx}
          >
            {actions[0].icon}
          </Box>
        )
      ) : (
        <>
          <Box
            component="button"
            type="button"
            data-testid="answer-actions-kebab"
            aria-label="More actions"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={(e) => setAnchorEl(e.currentTarget)}
            sx={triggerSx}
          >
            ⋯
          </Box>
          <Menu
            anchorEl={anchorEl}
            open={open}
            onClose={() => setAnchorEl(null)}
            transitionDuration={0}
            MenuListProps={{ "aria-label": "Answer actions" }}
          >
            {actions.map((a) =>
              a.node ? (
                <MenuItem key={a.id} data-testid={`answer-action-${a.id}`} disableRipple disableGutters sx={{ gap: 0.75, px: 1 }}>
                  {a.node}
                  <Box component="span" sx={{ color: BODY_TEXT, fontSize: FONT_SIZE_LABEL }}>
                    {a.label}
                  </Box>
                </MenuItem>
              ) : (
                <MenuItem
                  key={a.id}
                  data-testid={`answer-action-${a.id}`}
                  aria-label={a.label}
                  onClick={() => {
                    a.onSelect?.();
                    setAnchorEl(null);
                  }}
                  sx={{ gap: 0.75, fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_LABEL }}
                >
                  <Box component="span" aria-hidden>
                    {a.icon}
                  </Box>
                  {a.label}
                </MenuItem>
              ),
            )}
          </Menu>
        </>
      )}
    </Box>
  );
};

export default AnswerActions;
