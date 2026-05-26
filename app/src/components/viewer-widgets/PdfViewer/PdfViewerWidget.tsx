/**
 * PdfViewerWidget — the production PDF viewer widget.
 *
 * Used identically in onboarding (F2 UnderstandView) and steady-mode
 * source-viewer surfaces. Reads `documentId` + `mode` props; pulls
 * real xray data from GroundX via `DocumentsContext.getDocumentXray`;
 * renders pre-rasterized page images from `xray.documentPages[]`.
 *
 * Per the no-onboarding-duplicates rule
 * (`memory/feedback_no_onboarding_duplicates.md`): this is the one
 * production widget for PDF rendering. Onboarding views are thin
 * layout wrappers that mount this with `mode="onboarding"`.
 *
 * Visible UX (parity with the spec wireframes — same in onboarding
 * and steady):
 *
 *   • Main page-image area showing the currently-selected page,
 *     object-fit:contain so it never overflows the pane (no pan/zoom
 *     scrollbars).
 *   • Page thumbnails strip at the bottom. Click a thumb → main
 *     image switches to that page. The currently-displayed page
 *     thumb gets a highlight ring.
 *   • Error state for upstream failures (inline in the image area).
 *
 * The previous "DOCUMENT [filename]" header row at the top of the
 * widget was removed 2026-05-25 because it ate ~50px of vertical
 * canvas space and duplicated the filename the chat header already
 * shows. Loading + filename state is surfaced via `data-loading` and
 * `aria-label` on the widget root for the shell to consume.
 *
 * `mode` controls editable affordances (none today — placeholder for
 * future toolbar / annotation work):
 *   - "onboarding" → all editable controls hidden.
 *   - "steady"     → editable controls available.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState, type FC } from "react";

import type { DocumentXrayResponse } from "@/api/entities/groundxDocumentsEntity";
import {
  BORDER,
  BORDER_RADIUS_SM,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
  PDF_THUMB_PAGE_NUMBER_FONT_SIZE,
  WHITE,
} from "@/constants";
import { useDocumentsContext } from "@/contexts/DocumentsContext";

export type PdfViewerMode = "onboarding" | "steady";

export interface PdfViewerWidgetProps {
  /** GroundX document UUID. The widget fetches its xray on mount. */
  documentId: string;
  /** UI affordance lock. Onboarding mode hides editable controls. */
  mode: PdfViewerMode;
  /** 1-indexed initial page. Defaults to 1. User clicks on thumbs after that. */
  initialPage?: number;
}

export const PdfViewerWidget: FC<PdfViewerWidgetProps> = ({ documentId, mode, initialPage = 1 }) => {
  const { getDocumentXray } = useDocumentsContext();
  const [xray, setXray] = useState<DocumentXrayResponse | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [activePage, setActivePage] = useState<number>(initialPage);

  useEffect(() => {
    let cancelled = false;
    setXray(null);
    setError(null);
    void (async () => {
      const result = await getDocumentXray(documentId);
      if (cancelled) return;
      if (result.isSuccess && result.response) {
        setXray(result.response);
      } else {
        setError(result.error ?? new Error("xray fetch failed"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [documentId, getDocumentXray]);

  const pages = xray?.documentPages ?? [];
  const activeImage =
    pages.find((p) => p.pageNumber === activePage)?.pageUrl ?? pages[0]?.pageUrl ?? null;
  const fileName = xray?.fileName ?? "";
  const loading = !xray && !error;

  return (
    <Box
      data-testid="pdf-viewer-widget"
      data-mode={mode}
      data-loading={loading ? "true" : "false"}
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        backgroundColor: WHITE,
      }}
      // The filename is surfaced as the widget's accessible name so
      // screen-reader users know which document they're previewing.
      // The visible shell (chat header) reads from the same fileName
      // source via the scenario manifest.
      aria-label={fileName ? `Document viewer · ${fileName}` : "Document viewer"}
    >
      {/* Main page-image area.
          Uses object-fit:contain on an <img> instead of a sized Card
          with overflow:auto, so the page never produces scrollbars
          (the prior "looks like pan/zoom" affordance the user flagged
          2026-05-25). The page scales down to fit whichever pane
          dimension is the bottleneck. */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          px: { xs: 2, md: 3 },
          py: 2,
          overflow: "hidden",
        }}
      >
        {error ? (
          <Box
            data-testid="pdf-viewer-error"
            sx={{
              p: 3,
              display: "flex",
              flexDirection: "column",
              gap: 0.75,
              maxWidth: 480,
              border: `1px solid ${BORDER}`,
              borderRadius: BORDER_RADIUS_SM,
              backgroundColor: WHITE,
            }}
          >
            <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT, fontWeight: FONT_WEIGHT_LABEL }}>
              COULD NOT LOAD DOCUMENT
            </Typography>
            <Typography variant="body2" sx={{ color: NAVY }}>
              The viewer couldn&apos;t fetch the parsed document for{" "}
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                {documentId}
              </Box>
              .
            </Typography>
            {error instanceof Error && error.message && (
              <Typography
                variant="caption"
                sx={{ color: NAVY, fontFamily: "monospace", mt: 0.5, wordBreak: "break-word" }}
              >
                {error.message}
              </Typography>
            )}
          </Box>
        ) : activeImage ? (
          <Box
            component="img"
            data-testid="pdf-viewer-page-image"
            src={activeImage}
            alt={`${fileName || "document"} · page ${activePage}`}
            sx={{
              display: "block",
              // Fit-contain semantics: the image scales to the smaller
              // of the available width / height while preserving its
              // aspect ratio. No scroll, no overflow, no pan/zoom.
              maxWidth: "100%",
              maxHeight: "100%",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              border: `1px solid ${BORDER}`,
              backgroundColor: WHITE,
            }}
          />
        ) : (
          // Loading state placeholder — neither error nor a real image
          // yet. The data-loading="true" attribute on the root carries
          // the contract for tests + screen readers; the visible cell
          // is just a quiet block so the layout doesn't jump when the
          // image arrives.
          <Box
            aria-hidden
            sx={{
              width: "min(100%, 560px)",
              aspectRatio: "8.5 / 11",
              maxHeight: "100%",
              border: `1px solid ${BORDER}`,
              backgroundColor: WHITE,
            }}
          />
        )}
      </Box>

      {/* Page thumbnails strip */}
      {pages.length > 0 && (
        <Stack
          direction="row"
          spacing={1}
          sx={{
            justifyContent: "center",
            px: { xs: 2, md: 3 },
            py: 1.5,
            borderTop: `1px solid ${BORDER}`,
            overflowX: "auto",
          }}
          aria-label="Pages"
        >
          {pages.map((p) => {
            const isActive = p.pageNumber === activePage;
            return (
              <Box
                key={p.pageNumber}
                data-testid={`pdf-viewer-thumb-${p.pageNumber}`}
                role="button"
                tabIndex={0}
                aria-current={isActive ? "page" : undefined}
                aria-label={`Page ${p.pageNumber}`}
                onClick={() => setActivePage(p.pageNumber)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setActivePage(p.pageNumber);
                  }
                }}
                sx={{
                  width: 44,
                  height: 56,
                  flexShrink: 0,
                  cursor: "pointer",
                  border: `1.5px solid ${isActive ? NAVY : BORDER}`,
                  borderRadius: BORDER_RADIUS_SM,
                  overflow: "hidden",
                  backgroundColor: WHITE,
                  boxShadow: isActive ? `0 0 0 3px ${GREEN}40` : "none",
                  position: "relative",
                  "&:focus-visible": { outline: `2px solid ${GREEN}`, outlineOffset: 2 },
                }}
              >
                <Box
                  component="img"
                  src={p.pageUrl}
                  alt=""
                  aria-hidden
                  sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    position: "absolute",
                    bottom: 1,
                    left: 0,
                    right: 0,
                    textAlign: "center",
                    fontSize: PDF_THUMB_PAGE_NUMBER_FONT_SIZE,
                    fontWeight: FONT_WEIGHT_HEADLINE,
                    color: NAVY,
                    backgroundColor: `${WHITE}cc`,
                  }}
                >
                  p.{p.pageNumber}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      )}
    </Box>
  );
};
