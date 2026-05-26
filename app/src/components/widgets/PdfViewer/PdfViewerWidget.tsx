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
 *   • LIVE PARSE label row with the real fileName + a "processing…"
 *     status indicator while xray is in flight.
 *   • Main page-image area showing the currently-selected page.
 *   • Page thumbnails strip at the bottom. Click a thumb → main
 *     image switches to that page. The currently-displayed page
 *     thumb gets a highlight ring.
 *   • Error state for upstream failures.
 *
 * `mode` controls editable affordances (none today — placeholder for
 * future toolbar / annotation work):
 *   - "onboarding" → all editable controls hidden.
 *   - "steady"     → editable controls available.
 */

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
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
  LETTER_SPACING_LABEL,
  NAVY,
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
  const fileName = xray?.fileName ?? "Loading…";

  return (
    <Box
      data-testid="pdf-viewer-widget"
      data-mode={mode}
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        backgroundColor: WHITE,
      }}
      aria-label="Document viewer"
    >
      {/* Live-parse label row */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          px: { xs: 2, md: 3 },
          py: 1.25,
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <Typography
          variant="overline"
          sx={{
            color: EYEBROW_ON_LIGHT,
            letterSpacing: LETTER_SPACING_LABEL,
            fontWeight: FONT_WEIGHT_LABEL,
          }}
        >
          DOCUMENT
        </Typography>
        <Typography
          data-testid="pdf-viewer-filename"
          variant="caption"
          sx={{ color: NAVY, fontWeight: FONT_WEIGHT_HEADLINE, whiteSpace: "nowrap" }}
        >
          {fileName}
        </Typography>
        {!xray && !error && (
          <Typography
            data-testid="pdf-viewer-loading"
            variant="caption"
            sx={{ color: NAVY, fontStyle: "italic", whiteSpace: "nowrap" }}
          >
            loading…
          </Typography>
        )}
      </Box>

      {/* Main page-image area */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          px: { xs: 2, md: 3 },
          py: 2,
          overflow: "auto",
        }}
      >
        <Card
          sx={{
            position: "relative",
            backgroundColor: WHITE,
            overflow: "hidden",
            aspectRatio: "8.5 / 11",
            minHeight: 0,
            maxHeight: "100%",
            width: "100%",
            maxWidth: 560,
            boxShadow: "none",
            border: `1px solid ${BORDER}`,
          }}
          aria-label="Page preview"
        >
          {error ? (
            <Box
              data-testid="pdf-viewer-error"
              sx={{ p: 3, display: "flex", flexDirection: "column", gap: 0.5 }}
            >
              <Typography variant="overline" sx={{ color: EYEBROW_ON_LIGHT }}>
                COULD NOT LOAD DOCUMENT
              </Typography>
              <Typography variant="body2" sx={{ color: NAVY }}>
                The viewer couldn't fetch the parsed document. Try again, or open the source directly.
              </Typography>
            </Box>
          ) : activeImage ? (
            <Box
              component="img"
              data-testid="pdf-viewer-page-image"
              src={activeImage}
              alt={`${fileName} · page ${activePage}`}
              sx={{ display: "block", width: "100%", height: "auto" }}
            />
          ) : (
            // Loading state placeholder — neither error nor a real image yet.
            // No testid here; loading is asserted via `pdf-viewer-loading`
            // in the label row above.
            <Box
              aria-hidden
              sx={{ width: "100%", height: "100%", backgroundColor: WHITE }}
            />
          )}
        </Card>
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
                    fontSize: 9,
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
