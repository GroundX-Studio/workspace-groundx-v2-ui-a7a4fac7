import Chip from "@mui/material/Chip";
import { alpha } from "@mui/material/styles";
import { useCallback, type FC } from "react";

import {
  BORDER_RADIUS_PILL,
  CORAL,
  CYAN,
  FONT_SIZE_LABEL,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
} from "@/constants";
import { useCanvasOrchestrator } from "@/contexts/CanvasOrchestratorContext";
import { track } from "@/lib/analytics";
import type { Citation } from "@/types/onboarding";

export type CiteChipColor = "cyan" | "coral" | "green";

export interface CiteChipProps {
  citation: Citation;
  /** Numeric index shown in the chip (the [N] in copy). */
  index: number;
  /** Optional override for click behavior. Default dispatches highlightCitation. */
  onActivate?: (citation: Citation) => void;
  /**
   * Chip color. Default cyan; coral signals an anomaly / low-confidence
   * citation (used by F3 field-rows per canonical); green is used for
   * the primary citation in synthesis answers (F5). Maps to the design
   * tokens, NOT raw hex.
   */
  color?: CiteChipColor;
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
export const CiteChip: FC<CiteChipProps> = ({ citation, index, onActivate, color = "cyan" }) => {
  const { dispatch } = useCanvasOrchestrator();
  // Single accent per color-key — rendered as a soft tinted pill (tint fill +
  // matching border + navy label) instead of a loud solid chip, so the
  // citation reads as a refined source tag in the answer footer.
  const accent = color === "coral" ? CORAL : color === "green" ? GREEN : CYAN;

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
        // WF-06b — thread the attribution tier so the viewer overlay
        // renders at the citation's precision (ambient → chip only).
        ...(citation.tier ? { tier: citation.tier } : {}),
      },
      "user",
    );
  }, [citation, dispatch, onActivate, index]);

  const tooltip = citation.snippet
    ? `Source · page ${citation.page} — ${citation.snippet}`
    : `Source · page ${citation.page}`;

  return (
    <Chip
      // A clean little footnote-style badge: just the number (no brackets),
      // a small circular pill with a tinted fill + accent ring. Reads as a
      // source reference, not a loud red bubble.
      label={`${index}`}
      size="small"
      onClick={handle}
      clickable
      title={tooltip}
      aria-label={`Citation ${index} — page ${citation.page}`}
      data-testid={`cite-chip-${index}`}
      data-citation-doc={citation.documentId}
      data-citation-page={citation.page}
      data-color={color}
      sx={{
        height: 19,
        minWidth: 19,
        borderRadius: BORDER_RADIUS_PILL,
        fontSize: FONT_SIZE_LABEL,
        fontWeight: FONT_WEIGHT_LABEL,
        color: NAVY,
        backgroundColor: alpha(accent, 0.38),
        border: `1px solid ${alpha(accent, 0.9)}`,
        cursor: "pointer",
        "& .MuiChip-label": { px: 0.5 },
        "&:hover": { backgroundColor: alpha(accent, 0.55) },
      }}
    />
  );
};
