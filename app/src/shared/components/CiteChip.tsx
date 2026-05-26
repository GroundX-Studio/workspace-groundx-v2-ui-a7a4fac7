import Chip from "@mui/material/Chip";
import { useCallback, type FC } from "react";

import { CYAN, NAVY } from "@/constants";
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
 * bubbles, schema rows, report sections, risk roll-up rows. Click dispatches
 * a `highlightCitation` canvas intent so the active canvas pane scrolls to
 * the source.
 */
export const CiteChip: FC<CiteChipProps> = ({ citation, index, onActivate }) => {
  const { dispatch } = useCanvasOrchestrator();
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
  }, [citation, dispatch, onActivate, index]);

  return (
    <Chip
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
        fontSize: 11,
        backgroundColor: CYAN,
        color: NAVY,
        fontWeight: 600,
        cursor: "pointer",
        "&:hover": { filter: "brightness(0.95)" },
      }}
    />
  );
};
