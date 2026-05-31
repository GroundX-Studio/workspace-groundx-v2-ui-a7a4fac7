/**
 * PdfViewerWidget — the production PDF viewer widget.
 *
 * Used identically by anonymous + member source-viewer surfaces. Reads
 * a `scope: ContentScope` (the single-doc case is
 * `{ type: "documents", documentIds: [id] }`) + a `role: WidgetRole`;
 * resolves the target documentId from the scope, pulls real xray data
 * from GroundX via `DocumentsContext.getDocumentXray`, and renders
 * pre-rasterized page images from `xray.documentPages[]`.
 *
 * Per the no-onboarding-duplicates rule
 * (`memory/feedback_no_onboarding_duplicates.md`): this is the one
 * production widget for PDF rendering. Onboarding views are thin
 * layout wrappers that mount this with the same `scope` + `role` props.
 *
 * Per the 2026-05-30 widget access matrix
 * (`docs/agents/widget-access-matrix.md`) PdfViewer is a
 * **ScopedViewerWidget**: it takes a real `ContentScope` (NOT a raw
 * `documentId`) and is available to BOTH `anonymous` + `member` with
 * no role-gated affordance today.
 *
 * Visible UX (parity with the spec wireframes — same for both roles):
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
 * `role` is the widget-contract authorization axis (`anonymous` /
 * `member`). It gates editable affordances — none today (placeholder
 * for future toolbar / annotation work); the viewer is read-only for
 * both roles. The value is surfaced via `data-role` on the root.
 */

import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useEffect, useState, type FC } from "react";

import { isResolvedDocumentId } from "@/api/documentId";

import type { ContentScope, NormalizedBbox, WidgetRole } from "@groundx/shared";
import type { DocumentXrayResponse } from "@/api/entities/groundxDocumentsEntity";
import {
  BORDER,
  BORDER_RADIUS_SM,
  CORAL,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_WEIGHT_HEADLINE,
  FONT_WEIGHT_LABEL,
  GREEN,
  NAVY,
  PDF_THUMB_PAGE_NUMBER_FONT_SIZE,
  WHITE,
} from "@/constants";
import { useDocumentsContext } from "@/contexts/DocumentsContext";

export interface PdfViewerWidgetProps {
  /**
   * The document set to view (ScopedViewerWidget contract). The single-doc
   * case — the only shape the viewer renders today — is
   * `{ type: "documents", documentIds: [id] }`; the widget fetches the xray
   * for `documentIds[0]` on mount. `bucket`/`group` scopes resolve to no
   * document and hold the neutral loading state (a future multi-doc picker
   * is out of scope for this widget today).
   */
  scope: ContentScope;
  /**
   * Widget-contract authorization role (`anonymous` / `member`). Gates
   * editable affordances — none today; the viewer is read-only for both
   * roles. Surfaced via `data-role` on the root.
   */
  role: WidgetRole;
  /** 1-indexed initial page. Defaults to 1. User clicks on thumbs after that. */
  initialPage?: number;
  /**
   * clickable-citations Phase 4 — controlled page targeting. When set,
   * the widget navigates to this page on mount AND whenever the prop
   * changes (overrides `initialPage`). Thumb clicks still update the
   * internal `activePage` (so the user can browse freely after a
   * programmatic jump); a subsequent change to `targetPage`
   * re-overrides. Pass `null`/`undefined` to fall back to the
   * uncontrolled default.
   */
  targetPage?: number | null;
  /**
   * clickable-citations Phase 4 — region annotation overlay.
   * Coordinates are 0–1 page-relative (top-left origin). The overlay
   * renders as an absolutely-positioned tinted box atop the active
   * page image. Pass `null` / `undefined` to hide the overlay.
   */
  highlightBbox?: NormalizedBbox | null;
  /**
   * WF-06b — the attribution tier of the highlighted citation. Drives
   * the overlay's visual precision:
   *   - `exact`      → solid (tight) word-level box,
   *   - `paraphrase` → translucent, dashed chunk-region overlay (the
   *                    lower-confidence visual),
   *   - `ambient`    → NO inline span (source chip only) — the overlay
   *                    is suppressed even when a `highlightBbox` is present.
   * Absent → the default solid box (back-compat with pre-WF-06b
   * scenario/citation fixtures that carry a bbox but no tier).
   */
  highlightTier?: import("@/types/onboarding").CitationTier;
  /**
   * WF-01 C5 (2026-05-28). When true, paint a top→bottom sweeping
   * scan-line over the active page image. Used by F2 UnderstandView
   * while the thinking-stream plays in chat. The overlay is purely
   * decorative — it doesn't gate any other UI affordance — and it
   * crossfades instead of sweeping when the OS reports
   * `prefers-reduced-motion: reduce`.
   */
  showScanAnimation?: boolean;
  /**
   * WF-01 C10 (2026-05-28). Multiple lit regions painted on top of
   * the active page image — one per `[N]` citation in an F5 assistant
   * answer. Each region carries 0-1 page-relative coords + a `color`
   * that mirrors the `CiteChip` color the user sees in chat: `green`
   * for the primary citation, `cyan` for secondaries, `coral` for
   * anomaly / low-confidence. Only regions whose `page` matches the
   * currently active page render; the rest are inert.
   */
  litRegions?: Array<{
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
    color: "green" | "cyan" | "coral";
  }>;
}

export const PdfViewerWidget: FC<PdfViewerWidgetProps> = ({
  scope,
  role,
  initialPage = 1,
  targetPage,
  highlightBbox,
  highlightTier,
  showScanAnimation = false,
  litRegions,
}) => {
  // Resolve the single document the viewer renders from the scope. Only the
  // `documents` shape carries a concrete id today; any other scope (bucket /
  // group) resolves to an empty id and holds the neutral loading state. The
  // empty string is intentionally non-resolved (see `isResolvedDocumentId`)
  // so the fetch is gated exactly as the prior placeholder-id path was.
  const documentId = scope.type === "documents" ? scope.documentIds[0] ?? "" : "";
  const { getDocumentXray } = useDocumentsContext();
  const [xray, setXray] = useState<DocumentXrayResponse | null>(null);
  const [error, setError] = useState<unknown | null>(null);
  const [activePage, setActivePage] = useState<number>(targetPage ?? initialPage);

  // clickable-citations Phase 4 — when the caller updates `targetPage`,
  // re-sync the internal `activePage`. This is the controlled-page
  // path used by the citation-click handler in the shell: dispatch
  // `highlightCitation` → ChatStore updates viewer step → shell
  // re-renders the widget with the new `targetPage`. Without this
  // effect the widget would stay on whatever page it mounted at.
  useEffect(() => {
    if (typeof targetPage === "number" && targetPage > 0) {
      setActivePage(targetPage);
    }
  }, [targetPage]);

  useEffect(() => {
    let cancelled = false;
    setXray(null);
    setError(null);
    // WF-15 — gate the fetch on a resolved GroundX documentId. The
    // canvas mounts with a placeholder id (`scenario:utility`) before
    // the active entity resolves the real UUID; fetching an X-Ray for
    // it 406s and flashes "COULD NOT LOAD". Hold the neutral loading
    // state (xray + error both null → `loading` true) until a real id
    // arrives, then re-run via the `documentId` dep.
    if (!isResolvedDocumentId(documentId)) {
      return () => {
        cancelled = true;
      };
    }
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
      data-role={role}
      data-loading={loading ? "true" : "false"}
      // WF-01b C (2026-05-28). Surface the controlled-prop values as
      // data attrs on the root so consumers + tests can assert the
      // prop wiring without waiting on the async xray fetch to resolve.
      data-target-page={typeof targetPage === "number" ? String(targetPage) : undefined}
      data-highlight-page={highlightBbox ? String(targetPage ?? activePage) : undefined}
      data-highlight-bbox={highlightBbox ? JSON.stringify(highlightBbox) : undefined}
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
          position: "relative",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
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
          // clickable-citations Phase 4 — wrap the page image in a
          // position:relative container so the bbox highlight overlay
          // (absolute child) renders proportionally over the image.
          // The container hugs the image's intrinsic fit-contain size,
          // not the available pane area, so the overlay's percentages
          // align with the visible page region.
          <Box sx={{ position: "relative", display: "inline-block", maxWidth: "100%", maxHeight: "100%" }}>
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
                backgroundColor: WHITE,
              }}
            />
            {highlightBbox && highlightTier !== "ambient" && (
              // Cite overlay — absolute-positioned tint atop the page
              // image at the bbox-percent coords. Rendered via inline
              // `style` (not `sx`) so the test can assert the four
              // computed percentages directly against the style attr.
              //
              // WF-06b — the overlay's precision tracks the citation
              // tier: `paraphrase` (verified, chunk-level) draws a
              // more-translucent dashed box to read as lower-confidence;
              // `exact` (and the legacy/no-tier default) draws the tight
              // solid box. `ambient` suppresses the overlay entirely
              // (guarded above) — the source chip is the only affordance.
              <Box
                data-testid="pdf-viewer-highlight"
                data-highlight-tier={highlightTier}
                aria-hidden
                style={{
                  position: "absolute",
                  left: `${highlightBbox.x * 100}%`,
                  top: `${highlightBbox.y * 100}%`,
                  width: `${highlightBbox.w * 100}%`,
                  height: `${highlightBbox.h * 100}%`,
                  backgroundColor: highlightTier === "paraphrase" ? `${CYAN}22` : `${CYAN}55`,
                  border: highlightTier === "paraphrase" ? `1px dashed ${CYAN}` : `2px solid ${CYAN}`,
                  borderRadius: BORDER_RADIUS_SM,
                  pointerEvents: "none",
                }}
              />
            )}
            {/* WF-01 C10 (2026-05-28). One <Box> per litRegion whose
                page matches the currently active page. The color
                tokens map to the same palette as the corresponding
                `[N]` CiteChip in the chat answer. */}
            {(litRegions ?? [])
              .filter((r) => r.page === activePage)
              .map((region, idx) => {
                const bg = region.color === "green" ? GREEN : region.color === "coral" ? CORAL : CYAN;
                return (
                  <Box
                    key={`lit-${idx}`}
                    data-testid={`pdf-viewer-lit-region-${idx}`}
                    data-color={region.color}
                    aria-hidden
                    style={{
                      position: "absolute",
                      left: `${region.x * 100}%`,
                      top: `${region.y * 100}%`,
                      width: `${region.w * 100}%`,
                      height: `${region.h * 100}%`,
                      backgroundColor: `${bg}55`,
                      border: `2px solid ${bg}`,
                      borderRadius: BORDER_RADIUS_SM,
                      pointerEvents: "none",
                      boxShadow: `0 0 10px ${bg}80`,
                    }}
                  />
                );
              })}
          </Box>
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
        {/* WF-01 C5 — F2 "GroundX is reading the doc" scanner. Lives at the
            page-area level (not on the letterboxed image) so the dim overlay
            covers the FULL card. A darker tint reads as "processing"; the
            original thin beam sweeps top↔bottom (CSS `alternate`). */}
        {activeImage && showScanAnimation && (
          <>
            {/* Dimming veil — the doc reads as "not yet processed". Navy at
                ~0.34 is dark enough to be unmistakable while keeping the page
                legible underneath. */}
            <Box
              data-testid="pdf-viewer-scan-overlay"
              aria-hidden
              sx={{ position: "absolute", inset: 0, backgroundColor: alpha(NAVY, 0.46), pointerEvents: "none" }}
            />
            {/* Moving scanner head: a single element sweeps top↔bottom so the
                soft light band and the crisp beam line always travel together.
                The band uses mix-blend `screen` so it visibly LIFTS the veil
                where it passes — reads as a light sweeping over a dimmed doc. */}
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                left: 0,
                right: 0,
                height: 0,
                pointerEvents: "none",
                animation: "pdfScanSweep 2.8s ease-in-out infinite alternate",
                "@keyframes pdfScanSweep": { from: { top: "0%" }, to: { top: "100%" } },
                "@media (prefers-reduced-motion: reduce)": { animation: "none", top: "50%" },
              }}
            >
              {/* Soft glow band centered on the beam. */}
              <Box
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: -80,
                  height: 160,
                  mixBlendMode: "screen",
                  background: `linear-gradient(180deg, ${CYAN}00 0%, ${alpha(CYAN, 0.45)} 50%, ${GREEN}00 100%)`,
                }}
              />
              {/* Crisp beam line. */}
              <Box
                data-testid="pdf-viewer-scan-line"
                sx={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: -1,
                  height: 3,
                  background: `linear-gradient(90deg, ${GREEN}00 0%, ${CYAN} 50%, ${GREEN}00 100%)`,
                  boxShadow: `0 0 18px 3px ${GREEN}, 0 0 9px ${CYAN}`,
                }}
              />
            </Box>
          </>
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
