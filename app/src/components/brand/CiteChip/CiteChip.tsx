import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Popover from "@mui/material/Popover";
import Typography from "@mui/material/Typography";
import { useCallback, useRef, useState, type FC } from "react";

import {
  BODY_TEXT,
  BORDER,
  BORDER_RADIUS,
  BORDER_RADIUS_SM,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  LETTER_SPACING_LABEL,
  MUTED_ON_LIGHT,
  NAVY,
  WHITE,
} from "@/constants";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { track } from "@/lib/analytics";
import type { Citation } from "@/types/onboarding";

export interface CiteChipProps {
  citation: Citation;
  /** Numeric index shown in the chip (the [N] in copy). */
  index: number;
  /** Optional override for click behavior. Default dispatches highlightCitation. */
  onActivate?: (citation: Citation) => void;
}

/**
 * The shared citation chip. Used wherever the spec calls for `[N]` — chat
 * bubbles, schema rows, report sections, risk roll-up rows.
 *
 * Default click behavior (no `onActivate`):
 *   1. Fires the OB-02 `cite.peeked` telemetry event.
 *   2. Dispatches a `highlightCitation` canvas intent — when UI-04 ships
 *      a side panel adapter, the side panel will react. Until then no
 *      adapter is registered, so the dispatch is silent at the canvas
 *      level.
 *   3. Opens a per-chip peek popover anchored to the chip — gives the
 *      click an immediate visible response with the source page +
 *      snippet so the chip never feels dead. This is the pre-UI-04
 *      visual fallback; once the F5 side panel renders the highlighted
 *      source, this popover can be retired.
 *
 * When `onActivate` is supplied (callers wiring their own side-panel
 * UX), the popover is suppressed — the caller's affordance owns the
 * click.
 */
export const CiteChip: FC<CiteChipProps> = ({ citation, index, onActivate }) => {
  const { dispatch } = useCanvasOrchestrator();
  const chipRef = useRef<HTMLDivElement | null>(null);
  const [peekOpen, setPeekOpen] = useState(false);

  const handle = useCallback(() => {
    // OB-02 — cite.peeked fires on every citation chip activation
    // regardless of which view it sits in (F3 fields, F5 chat, etc.).
    track("cite.peeked", {
      documentId: citation.documentId,
      page: citation.page,
      index,
    });
    if (onActivate) {
      onActivate(citation);
      return;
    }
    dispatch({ kind: "highlightCitation", documentId: citation.documentId, page: citation.page, bbox: citation.bbox }, "user");
    setPeekOpen(true);
  }, [citation, dispatch, onActivate, index]);

  return (
    <>
      <Chip
        ref={chipRef as unknown as React.Ref<HTMLDivElement>}
        label={`[${index}]`}
        size="small"
        onClick={handle}
        clickable
        aria-label={`Citation ${index} — page ${citation.page}`}
        data-testid={`cite-chip-${index}`}
        data-citation-doc={citation.documentId}
        data-citation-page={citation.page}
        sx={{
          height: 20,
          fontSize: FONT_SIZE_LABEL,
          backgroundColor: CYAN,
          color: NAVY,
          fontWeight: FONT_WEIGHT_LABEL,
          cursor: "pointer",
          "&:hover": { filter: "brightness(0.95)" },
        }}
      />
      <Popover
        open={peekOpen}
        anchorEl={chipRef.current}
        onClose={() => setPeekOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: {
              maxWidth: 320,
              border: `1px solid ${BORDER}`,
              borderRadius: BORDER_RADIUS,
              backgroundColor: WHITE,
              p: 1.5,
            },
          },
        }}
      >
        <Box data-testid="cite-peek">
        <Typography
          variant="overline"
          sx={{
            color: EYEBROW_ON_LIGHT,
            letterSpacing: LETTER_SPACING_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
          }}
        >
          SOURCE · PAGE {citation.page}
        </Typography>
        <Typography
          variant="caption"
          component="div"
          sx={{ color: MUTED_ON_LIGHT, fontFamily: "monospace", mt: 0.25, mb: 0.5, wordBreak: "break-all" }}
        >
          {citation.documentId}
        </Typography>
        {citation.snippet ? (
          <Box
            sx={{
              borderLeft: `3px solid ${CYAN}`,
              pl: 1,
              py: 0.5,
              backgroundColor: `${CYAN}1a`,
              borderRadius: BORDER_RADIUS_SM,
            }}
          >
            <Typography variant="body2" sx={{ color: NAVY }}>
              {citation.snippet}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: BODY_TEXT, fontStyle: "italic" }}>
            No snippet provided. Full source viewer ships with the F5 side panel (UI-04).
          </Typography>
        )}
        </Box>
      </Popover>
    </>
  );
};
