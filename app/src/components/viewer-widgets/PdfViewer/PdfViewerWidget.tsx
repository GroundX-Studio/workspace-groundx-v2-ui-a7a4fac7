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
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useRef, useState, type FC } from "react";

import { isResolvedDocumentId } from "@/api/documentId";
import { useScopeAdapter } from "@/widgets/scopedViewerWidget";

import type { ContentScope, NormalizedBbox, WidgetRole } from "@groundx/shared";
import type { DocumentXrayResponse } from "@/api/entities/groundxDocumentsEntity";
import { containContentRect, overlayPxRect } from "./overlayGeometry";
import { ZOOM_MIN, ZOOM_MAX, clampPan, stepZoom, zoomAtPoint, type Vec2 } from "./zoomPan";
import {
  BORDER,
  BORDER_RADIUS_PILL,
  BORDER_RADIUS_SM,
  CORAL,
  CYAN,
  EYEBROW_ON_LIGHT,
  FONT_SIZE_LABEL,
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

  // ScopedViewerWidget contract (core-data base): reload the X-Ray on
  // scope-IDENTITY change via `useScopeAdapter` rather than a bespoke
  // `useEffect` keyed on a derived id. The adapter fires on mount and again
  // only when the `scope` identity changes (`scopeKey`), not on every render.
  // Async cancellation is handled with a monotonically-increasing sequence: a
  // newer adapt run invalidates an in-flight fetch from an older scope.
  const loadSeqRef = useRef(0);
  useScopeAdapter(scope, (nextScope) => {
    const loadSeq = ++loadSeqRef.current;
    const nextDocId =
      nextScope.type === "documents" ? nextScope.documentIds[0] ?? "" : "";
    setXray(null);
    setError(null);
    // WF-15 — gate the fetch on a resolved GroundX documentId. The
    // canvas mounts with a placeholder id (`scenario:utility`) before
    // the active entity resolves the real UUID; fetching an X-Ray for
    // it 406s and flashes "COULD NOT LOAD". Hold the neutral loading
    // state (xray + error both null → `loading` true) until a real id
    // arrives.
    if (!isResolvedDocumentId(nextDocId)) return;
    void (async () => {
      const result = await getDocumentXray(nextDocId);
      // A newer scope took over while we awaited — drop this stale result.
      if (loadSeqRef.current !== loadSeq) return;
      if (result.isSuccess && result.response) {
        setXray(result.response);
      } else {
        setError(result.error ?? new Error("xray fetch failed"));
      }
    })();
  });

  const pages = xray?.documentPages ?? [];
  const activeImage =
    pages.find((p) => p.pageNumber === activePage)?.pageUrl ?? pages[0]?.pageUrl ?? null;
  const fileName = xray?.fileName ?? "";
  const loading = !xray && !error;
  const highlightPage =
    highlightBbox && typeof targetPage === "number" ? targetPage : activePage;
  // Render a region whenever we have a bbox on the active page. Tier controls
  // PRECISION/EMPHASIS (below), not whether a source is shown at all: an answer
  // should always reveal where it came from. `ambient` draws a soft, looser
  // chunk-region ("approximate source area") rather than nothing — for this
  // corpus the backend frequently returns ambient, so suppressing it made
  // citations look broken (a click/auto-jump that highlighted nothing).
  const shouldRenderHighlight = Boolean(highlightBbox) && activePage === highlightPage;

  // Measure the page-image pane so the citation / lit-region overlays can be
  // positioned in PX over the ACTUAL `object-fit: contain` content rect. The
  // overlay used to be a percentage of a wrapper whose height didn't match the
  // rendered image, so every highlight landed ~25% of the page height too high.
  // Callback ref (not useEffect+ref): the pane mounts only after the
  // loading/error early branches resolve.
  const [paneSize, setPaneSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const paneResizeObserverRef = useRef<ResizeObserver | null>(null);
  const paneRef = useCallback((node: HTMLDivElement | null) => {
    paneResizeObserverRef.current?.disconnect();
    if (!node || typeof ResizeObserver === "undefined") return;
    const r = node.getBoundingClientRect();
    setPaneSize({ w: r.width, h: r.height });
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setPaneSize({ w: cr.width, h: cr.height });
    });
    ro.observe(node);
    paneResizeObserverRef.current = ro;
  }, []);
  const activeDims = pages.find((p) => p.pageNumber === activePage);
  const contentRect = activeDims
    ? containContentRect(paneSize.w, paneSize.h, activeDims.width, activeDims.height)
    : null;
  // px against the measured content rect once available; a one-frame percentage
  // fallback (also the jsdom path, which has no layout) before the observer fires.
  const overlayStyleFor = (bbox: NormalizedBbox): import("react").CSSProperties => {
    if (contentRect) {
      const r = overlayPxRect(bbox, contentRect);
      return { position: "absolute", left: r.left, top: r.top, width: r.width, height: r.height };
    }
    return {
      position: "absolute",
      left: `${bbox.x * 100}%`,
      top: `${bbox.y * 100}%`,
      width: `${bbox.w * 100}%`,
      height: `${bbox.h * 100}%`,
    };
  };

  // ── Zoom & pan (add-pdf-zoom-pan) ───────────────────────────────────────
  // Ephemeral view state, held locally and reset on navigation (NOT persisted).
  // The transform layer scales the page image + overlays together, so the
  // citation highlights stay aligned at any zoom.
  const [zoom, setZoom] = useState(ZOOM_MIN);
  const [pan, setPan] = useState<Vec2>({ x: 0, y: 0 });
  // Stable key so the reset effect doesn't re-fire on every render if the
  // parent passes a fresh `highlightBbox` object identity.
  const highlightKey = highlightBbox
    ? `${highlightBbox.x},${highlightBbox.y},${highlightBbox.w},${highlightBbox.h}`
    : "none";
  // Reset to Fit whenever the user navigates (page / document) or a citation is
  // opened — every citation jump lands on the whole page with the highlight.
  useEffect(() => {
    setZoom(ZOOM_MIN);
    setPan({ x: 0, y: 0 });
  }, [activePage, documentId, highlightKey]);
  // Apply a new zoom level (button/keyboard/wheel) and re-clamp the pan so the
  // page can't end up dragged off-screen at the new scale.
  const applyZoom = (nextZoom: number) => {
    setZoom(nextZoom);
    setPan((p) => clampPan(p, nextZoom, paneSize, contentRect));
  };
  const fitPage = () => {
    setZoom(ZOOM_MIN);
    setPan({ x: 0, y: 0 });
  };
  const atFit = zoom === ZOOM_MIN && pan.x === 0 && pan.y === 0;

  // Latest interaction inputs, mirrored to a ref so the window/native listeners
  // below can stay attached once and always read current values (no re-attach
  // churn from contentRect's per-render identity).
  const interactRef = useRef({ zoom, pan, paneSize, contentRect });
  interactRef.current = { zoom, pan, paneSize, contentRect };
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; startPan: Vec2 } | null>(null);

  // Ctrl/Cmd + wheel = zoom toward the cursor. Native non-passive listener so
  // we can preventDefault (the browser's page-zoom). Re-attaches when the page
  // image mounts (the stage only exists once xray resolves). A PLAIN wheel is
  // intentionally ignored — the page never moves on a bare scroll.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const { zoom: z, pan: p, paneSize: ps, contentRect: cr } = interactRef.current;
      const next = stepZoom(z, e.deltaY < 0 ? "in" : "out");
      const rect = el.getBoundingClientRect();
      const res = zoomAtPoint(z, next, { x: e.clientX - rect.left, y: e.clientY - rect.top }, p, ps);
      setZoom(res.zoom);
      setPan(clampPan(res.pan, res.zoom, ps, cr));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [activeImage]);

  // Drag-to-pan (only when zoomed). Window listeners stay attached; they act
  // only while a drag is armed (dragRef set on pointer-down over the stage).
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const { zoom: z, paneSize: ps, contentRect: cr } = interactRef.current;
      setPan(
        clampPan(
          { x: d.startPan.x + (e.clientX - d.startX), y: d.startPan.y + (e.clientY - d.startY) },
          z,
          ps,
          cr,
        ),
      );
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const onStagePointerDown = (e: import("react").PointerEvent<HTMLDivElement>) => {
    if (interactRef.current.zoom <= ZOOM_MIN) return; // pan only when zoomed
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPan: interactRef.current.pan };
  };

  const onViewerKeyDown = (e: import("react").KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "+" || e.key === "=") {
      e.preventDefault();
      applyZoom(stepZoom(zoom, "in"));
    } else if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      applyZoom(stepZoom(zoom, "out"));
    } else if (e.key === "0") {
      e.preventDefault();
      fitPage();
    }
  };

  return (
    <Box
      data-testid="pdf-viewer-widget"
      data-role={role}
      data-loading={loading ? "true" : "false"}
      // WF-01b C (2026-05-28). Surface the controlled-prop values as
      // data attrs on the root so consumers + tests can assert the
      // prop wiring without waiting on the async xray fetch to resolve.
      data-target-page={typeof targetPage === "number" ? String(targetPage) : undefined}
      data-highlight-page={highlightBbox ? String(highlightPage) : undefined}
      data-highlight-bbox={highlightBbox ? JSON.stringify(highlightBbox) : undefined}
      // WF-01 C5 — surface the reading-scan prop so consumers + tests can
      // assert the wiring without waiting on the async xray fetch the visible
      // overlay needs. The overlay itself renders only once an image resolves.
      data-scan-animation={showScanAnimation ? "true" : "false"}
      tabIndex={0}
      onKeyDown={onViewerKeyDown}
      sx={{
        display: "flex",
        flexDirection: "column",
        // Fill the slot on BOTH axes. ScopedCanvas mounts the widget in a
        // block 100%×100% Box (width fills implicitly), but Extract's
        // single-pane `extract-doc-pane` is a `display:flex` row — without
        // an explicit width the widget collapses to its content width
        // (~196px) and the page renders in a skinny column. `width:100%`
        // makes the widget container-agnostic. (2026-06-09)
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: WHITE,
      }}
      // role="group" makes `aria-label` a permitted attribute on this container
      // (a plain Box is role=generic, where aria-label is prohibited — axe
      // `aria-prohibited-attr`). The filename is surfaced as the widget's
      // accessible name so screen-reader users know which document they're
      // previewing. The visible shell (chat header) reads from the same fileName
      // source via the scenario manifest.
      role="group"
      aria-label={fileName ? `Document viewer · ${fileName}` : "Document viewer"}
    >
      {/* Main page-image area.
          Uses object-fit:contain on an <img> instead of a sized Card
          with overflow:auto, so the page never produces scrollbars
          (the prior "looks like pan/zoom" affordance the user flagged
          2026-05-25). The page scales down to fit whichever pane
          dimension is the bottleneck. */}
      <Box
        ref={paneRef}
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
          // The page image fills the (measured) pane with object-fit:contain so
          // it never overflows, and the citation/lit-region overlays are
          // positioned in PX over the actual contained content rect via
          // `overlayStyleFor` — the pane itself is the position:relative
          // containing block (see `paneRef`). Previously the overlay was a % of
          // a wrapper whose height didn't match the image, so highlights landed
          // ~25% of the page height too high.
          <>
            {/* Transform stage — the page image AND its overlays scale/pan
                together (so highlights stay aligned). Reset to Fit on nav. */}
            <Box
              ref={stageRef}
              data-testid="pdf-viewer-stage"
              data-zoom={String(zoom)}
              data-pan={`${pan.x},${pan.y}`}
              onPointerDown={onStagePointerDown}
              sx={{
                position: "absolute",
                inset: 0,
                transformOrigin: "center center",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                cursor: zoom > ZOOM_MIN ? "grab" : "default",
                touchAction: "none",
              }}
            >
            <Box
              component="img"
              data-testid="pdf-viewer-page-image"
              src={activeImage}
              alt={`${fileName || "document"} · page ${activePage}`}
              sx={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "contain",
                backgroundColor: WHITE,
              }}
            />
            {shouldRenderHighlight && highlightBbox && (
              // Cite overlay — absolute-positioned tint over the cited region.
              // WF-06b — precision tracks the citation tier: `paraphrase`
              // (verified, chunk-level) draws a more-translucent dashed box;
              // `exact` (and legacy/no-tier) draws the tight solid box.
              // `ambient` suppresses the overlay (guarded above).
              <Box
                data-testid="pdf-viewer-highlight"
                data-highlight-tier={highlightTier}
                aria-hidden
                style={{
                  ...overlayStyleFor(highlightBbox),
                  // Emphasis by tier: exact (and legacy/no-tier) = tight solid
                  // box; paraphrase = chunk-level dashed; ambient = faint dashed
                  // "approximate source area".
                  backgroundColor:
                    highlightTier === "ambient"
                      ? `${CYAN}1f`
                      : highlightTier === "paraphrase"
                        ? `${CYAN}33`
                        : `${CYAN}55`,
                  border:
                    highlightTier === "exact" || highlightTier == null
                      ? `2px solid ${CYAN}`
                      : `1px dashed ${CYAN}`,
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
                      ...overlayStyleFor(region),
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
            {/* Zoom controls — inline (one caller, not extracted). Sit OUTSIDE
                the transform stage so they don't scale/pan with the page. */}
            <Box
              data-testid="pdf-zoom-controls"
              sx={{
                position: "absolute",
                bottom: 1,
                right: 1,
                display: "flex",
                alignItems: "center",
                gap: 0.25,
                px: 0.5,
                py: 0.25,
                borderRadius: BORDER_RADIUS_PILL,
                border: `1px solid ${BORDER}`,
                backgroundColor: alpha(WHITE, 0.92),
              }}
            >
              <IconButton
                size="small"
                data-testid="pdf-zoom-out"
                aria-label="Zoom out"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => applyZoom(stepZoom(zoom, "out"))}
                sx={{ color: NAVY }}
              >
                <Box component="span" sx={{ fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_HEADLINE, lineHeight: 1 }}>
                  −
                </Box>
              </IconButton>
              <Box
                data-testid="pdf-zoom-level"
                aria-live="polite"
                sx={{ minWidth: 40, textAlign: "center", fontSize: FONT_SIZE_LABEL, color: NAVY }}
              >
                {Math.round(zoom * 100)}%
              </Box>
              <IconButton
                size="small"
                data-testid="pdf-zoom-in"
                aria-label="Zoom in"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => applyZoom(stepZoom(zoom, "in"))}
                sx={{ color: NAVY }}
              >
                <Box component="span" sx={{ fontSize: FONT_SIZE_LABEL, fontWeight: FONT_WEIGHT_HEADLINE, lineHeight: 1 }}>
                  +
                </Box>
              </IconButton>
              <IconButton
                size="small"
                data-testid="pdf-zoom-fit"
                aria-label="Fit page"
                disabled={atFit}
                onClick={fitPage}
                sx={{ color: NAVY }}
              >
                <Box component="span" sx={{ fontSize: FONT_SIZE_LABEL, lineHeight: 1 }}>⤢</Box>
              </IconButton>
            </Box>
          </>
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
              data-testid="pdf-viewer-scan-beam"
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
