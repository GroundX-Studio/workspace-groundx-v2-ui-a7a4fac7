import Chip from "@mui/material/Chip";
import { useCallback, type FC } from "react";

import {
  CYAN,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  NAVY,
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
 * The shared citation chip. Used wherever the spec calls for `[N]` —
 * chat bubbles, schema rows, report sections, risk roll-up rows.
 *
 * clickable-citations Phase 5: the chip's default click behavior is
 * now "jump the viewer to the cited region." Phase 3 wired the
 * orchestrator to handle `highlightCitation` end-to-end (push/swap a
 * `doc-viewer` ViewerStep + highlight slot). Phase 4 made
 * `PdfViewerWidget` controlled-page + bbox-overlay aware. This
 * component drops the pre-UI-04 Popover fallback — the chip now does
 * the single thing the wireframes asked for: opens the source.
 *
 * Hover tooltip is the native `title` attribute, so users still get
 * a "source · page N" hint without a JS-rendered floating peek.
 *
 * When `onActivate` is supplied (callers wiring their own surface),
 * the orchestrator dispatch is suppressed — the caller's affordance
 * owns the click.
 */
export const CiteChip: FC<CiteChipProps> = ({ citation, index, onActivate }) => {
  const { dispatch } = useCanvasOrchestrator();

  const handle = useCallback(() => {
    // OB-02 — cite.peeked fires on every citation chip activation
    // regardless of which surface it sits in (F3 fields, F5 chat, etc.).
    track("cite.peeked", {
      documentId: citation.documentId,
      page: citation.page,
      index,
    });
    if (onActivate) {
      onActivate(citation);
      return;
    }
    // The orchestrator's built-in handler picks this up (no adapter
    // registration required) and calls ChatStore.gotoDocViewer to
    // push/swap a doc-viewer step. Shells re-render with the new
    // step → PdfViewerWidget mounts with targetPage + highlightBbox.
    dispatch(
      {
        kind: "highlightCitation",
        documentId: citation.documentId,
        page: citation.page,
        ...(citation.bbox ? { bbox: citation.bbox } : {}),
      },
      "user",
    );
  }, [citation, dispatch, onActivate, index]);

  const tooltip = citation.snippet
    ? `Source · page ${citation.page} — ${citation.snippet}`
    : `Source · page ${citation.page}`;

  return (
    <Chip
      label={`[${index}]`}
      size="small"
      onClick={handle}
      clickable
      title={tooltip}
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
  );
};
