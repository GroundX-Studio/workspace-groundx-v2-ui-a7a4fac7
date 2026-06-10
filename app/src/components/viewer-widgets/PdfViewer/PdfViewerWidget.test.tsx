import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope, WidgetRole } from "@groundx/shared";

import { DocumentsProvider } from "@/contexts/DocumentsContext/DocumentsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";
import { withApiProvider } from "@/test/withApiProvider";

/**
 * PdfViewerWidget — the production PDF viewer.
 *
 * Used identically by anonymous + member surfaces. Reads a
 * `scope: ContentScope` (a single doc is
 * `{ type: "documents", documentIds: [id] }`) + a `role: WidgetRole`;
 * pulls real xray data from GroundX via DocumentsContext; renders
 * pre-rasterized page images from `xray.documentPages[].pageUrl`.
 *
 * Per the no-onboarding-duplicates rule
 * (`memory/feedback_no_onboarding_duplicates.md`): this is the one
 * production widget for PDF rendering — the onboarding views are thin
 * layout wrappers that mount it. Per the 2026-05-30 widget access
 * matrix (`docs/agents/widget-access-matrix.md`) PdfViewer is a
 * **ScopedViewerWidget**: available to BOTH `anonymous` + `member`
 * (no affordance lock today) and takes a real `ContentScope` rather
 * than a raw `documentId`.
 */

const getXrayMock = vi.fn();

beforeEach(() => {
  getXrayMock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

import { PdfViewerWidget } from "./PdfViewerWidget";

/** Single-doc scope helper — the canonical ScopedViewerWidget shape for one document. */
const docScope = (id: string): ContentScope => ({ type: "documents", documentIds: [id] });

const wrapper = ({ children }: { children: React.ReactNode }) => (
  withApiProvider(
    <LoadingProvider>
      <MessageBarProvider>
        <DocumentsProvider>{children}</DocumentsProvider>
      </MessageBarProvider>
    </LoadingProvider>,
    { groundxDocuments: { getGroundXDocumentXray: getXrayMock } },
  )
);

const fakeXray = {
  fileName: "utility-bill-april-2026.pdf",
  fileType: "pdf",
  fileSummary: "City of Windom utility bill",
  language: "English",
  sourceUrl: "https://upload.eyelevel.ai/prod/file/ssp/abc.pdf",
  documentPages: [
    { pageNumber: 1, pageUrl: "https://upload.eyelevel.ai/prod/page/1.jpg", width: 1700, height: 2200, chunks: [] },
    { pageNumber: 2, pageUrl: "https://upload.eyelevel.ai/prod/page/2.jpg", width: 1700, height: 2200, chunks: [] },
    { pageNumber: 3, pageUrl: "https://upload.eyelevel.ai/prod/page/3.jpg", width: 1700, height: 2200, chunks: [] },
  ],
  chunks: [],
};

describe("PdfViewerWidget", () => {
  // 2026-06-09 — the widget root must fill its slot on BOTH axes. It
  // declared only `height: 100%`, so in a `display:flex` (row) parent
  // (Extract's single-pane `extract-doc-pane`) it collapsed to its
  // content width (~196px in a 686px pane) — the page rendered in a
  // skinny column with the rest of the pane wasted. ScopedCanvas wraps
  // it in a block 100%×100% Box so the bug was invisible there; only a
  // flex-row parent surfaced it. jsdom has no layout, so this guards the
  // *declared* fill invariant rather than the measured px (the px
  // regression was caught in a real browser).
  it("fills its container on both axes so it never collapses in a flex-row parent", () => {
    getXrayMock.mockResolvedValue(fakeXray);
    render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });
    const root = screen.getByTestId("pdf-viewer-widget");
    expect(root).toHaveStyle({ width: "100%", height: "100%" });
  });

  it("renders a loading state immediately and then the first page image once xray resolves", async () => {
    let resolveXray: (v: unknown) => void = () => {};
    getXrayMock.mockReturnValue(
      new Promise((resolve) => {
        resolveXray = resolve;
      }),
    );

    render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });

    // While the call is in flight the widget surfaces loading via a
    // data-attribute on the root (the prior visible "DOCUMENT" + file
    // name header was removed 2026-05-25 — too much vertical space;
    // filename now lives in the chat header instead).
    const root = screen.getByTestId("pdf-viewer-widget");
    expect(root).toBeInTheDocument();
    expect(root.getAttribute("data-loading")).toBe("true");
    expect(screen.queryByTestId("pdf-viewer-page-image")).not.toBeInTheDocument();

    await act(async () => {
      resolveXray(fakeXray);
    });

    const pageImage = await screen.findByTestId("pdf-viewer-page-image");
    expect(pageImage.getAttribute("src")).toBe(fakeXray.documentPages[0]?.pageUrl);
    expect(screen.getByTestId("pdf-viewer-widget").getAttribute("data-loading")).toBe("false");
  });

  // 2026-05-30 widget access matrix — PdfViewer is available to BOTH
  // roles with NO affordance lock today. Mount under each role and
  // assert it renders identically (its matrix row: ✅ anonymous, ✅
  // member; no role-gated control).
  describe("widget access matrix (role availability)", () => {
    const ROLES: WidgetRole[] = ["anonymous", "member"];
    for (const role of ROLES) {
      it(`mounts and renders for role="${role}" (available to both roles, no affordance lock)`, async () => {
        getXrayMock.mockResolvedValue(fakeXray);

        render(<PdfViewerWidget scope={docScope("doc-1")} role={role} />, { wrapper });

        // Widget mounts for the role, fetches its xray, and exposes the
        // full read-only affordance set (page image + thumbnail strip).
        await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
        expect(screen.getByTestId("pdf-viewer-thumb-1")).toBeInTheDocument();
        // No control is gated by role — the thumbnail strip (the only
        // interactive affordance) is present for both roles.
        expect(screen.getByTestId("pdf-viewer-thumb-2")).toBeInTheDocument();
      });
    }
  });

  it("resolves the single-doc scope to the document id and fetches its xray", async () => {
    getXrayMock.mockResolvedValue(fakeXray);

    render(<PdfViewerWidget scope={docScope("some-doc-uuid")} role="member" />, { wrapper });

    await waitFor(() =>
      expect(getXrayMock).toHaveBeenCalledWith("some-doc-uuid", undefined),
    );
  });

  describe("WF-15: placeholder-id X-Ray gate", () => {
    it("does NOT fetch an X-Ray for a scenario:* placeholder id in scope", async () => {
      getXrayMock.mockResolvedValue(fakeXray);

      render(<PdfViewerWidget scope={docScope("scenario:utility")} role="anonymous" />, { wrapper });

      // No fetch fires for a placeholder id — and the widget shows a
      // neutral loading state, never the "COULD NOT LOAD" error flash.
      await act(async () => {
        await Promise.resolve();
      });
      expect(getXrayMock).not.toHaveBeenCalled();
      const root = screen.getByTestId("pdf-viewer-widget");
      expect(root.getAttribute("data-loading")).toBe("true");
      expect(screen.queryByText(/COULD NOT LOAD/i)).not.toBeInTheDocument();
    });

    it("fetches the X-Ray once the scope resolves to a real GroundX documentId", async () => {
      getXrayMock.mockResolvedValue(fakeXray);

      const { rerender } = render(
        <PdfViewerWidget scope={docScope("scenario:utility")} role="anonymous" />,
        { wrapper },
      );
      expect(getXrayMock).not.toHaveBeenCalled();

      rerender(<PdfViewerWidget scope={docScope("c3bfff49-6640-4213-822b-e81c3a771e45")} role="anonymous" />);

      await waitFor(() =>
        expect(getXrayMock).toHaveBeenCalledWith(
          "c3bfff49-6640-4213-822b-e81c3a771e45",
          undefined,
        ),
      );
    });
  });

  it("does NOT render the in-pane filename header (filename now lives in the chat header)", async () => {
    getXrayMock.mockResolvedValue(fakeXray);

    render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });

    // Wait for xray to resolve so we don't race the assertion against
    // a still-loading widget.
    await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
    // The DOCUMENT label + pdf-viewer-filename testid is gone. The
    // filename moved to the chat header to reclaim vertical space in
    // the canvas pane.
    expect(screen.queryByTestId("pdf-viewer-filename")).not.toBeInTheDocument();
    expect(screen.queryByTestId("pdf-viewer-loading")).not.toBeInTheDocument();
  });

  it("exposes the resolved fileName as an aria-label on the widget root", async () => {
    // Keeps the filename available to assistive tech + lets the
    // surrounding shell (chat header) read it via the testid contract
    // when xray data hasn't propagated through DocumentsContext yet.
    getXrayMock.mockResolvedValue(fakeXray);

    render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
    const root = screen.getByTestId("pdf-viewer-widget");
    expect(root.getAttribute("aria-label") ?? "").toContain("utility-bill-april-2026.pdf");
  });

  it("renders one thumbnail per documentPage with the real pageUrls", async () => {
    getXrayMock.mockResolvedValue(fakeXray);

    render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-thumb-1")).toBeInTheDocument());
    expect(screen.getByTestId("pdf-viewer-thumb-2")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer-thumb-3")).toBeInTheDocument();
  });

  it("clicking a thumbnail switches the main image to that page", async () => {
    getXrayMock.mockResolvedValue(fakeXray);
    const user = (await import("@testing-library/user-event")).default.setup();

    render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });

    const thumb2 = await screen.findByTestId("pdf-viewer-thumb-2");
    await user.click(thumb2);

    await waitFor(() =>
      expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[1]?.pageUrl),
    );
  });

  it("renders an error state if the xray call fails", async () => {
    getXrayMock.mockRejectedValue(new Error("boom"));

    render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-error")).toBeInTheDocument());
  });

  // ── clickable-citations Phase 4 — controlled targetPage + bbox overlay
  describe("controlled targetPage + highlightBbox (clickable-citations Phase 4)", () => {
    it("mounts at targetPage when supplied (overrides default initialPage)", async () => {
      getXrayMock.mockResolvedValue(fakeXray);

      render(<PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={3} />, { wrapper });
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[2]?.pageUrl),
      );
    });

    it("re-renders with a new targetPage jumps the page image", async () => {
      getXrayMock.mockResolvedValue(fakeXray);

      const { rerender } = render(<PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={1} />, { wrapper });
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[0]?.pageUrl),
      );

      rerender(<PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={2} />);
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[1]?.pageUrl),
      );
    });

    it("renders a highlight overlay positioned proportionally when highlightBbox is supplied", async () => {
      getXrayMock.mockResolvedValue(fakeXray);

      render(
        <PdfViewerWidget
          scope={docScope("doc-1")}
          role="member"
          targetPage={1}
          highlightBbox={{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }}
        />,
        { wrapper },
      );
      const overlay = await screen.findByTestId("pdf-viewer-highlight");
      const style = overlay.getAttribute("style") ?? "";
      // The overlay uses percent-based positioning derived from the
      // bbox values; assert the four key clauses are present.
      expect(style).toMatch(/left:\s*10%/);
      expect(style).toMatch(/top:\s*20%/);
      expect(style).toMatch(/width:\s*50%/);
      expect(style).toMatch(/height:\s*5%/);
    });

    // WF-06b — the highlight's visual precision is driven by the
    // citation tier. `exact` → tight solid word-level box; `paraphrase`
    // → translucent chunk-region overlay; `ambient` → no inline span
    // (source chip only). The tier is surfaced as a data attribute so
    // the contract is assertable without computing rendered alpha.
    it("renders a SOLID (tight) highlight for an exact-tier citation", async () => {
      getXrayMock.mockResolvedValue(fakeXray);

      render(
        <PdfViewerWidget
          scope={docScope("doc-1")}
          role="member"
          targetPage={1}
          highlightBbox={{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }}
          highlightTier="exact"
        />,
        { wrapper },
      );
      const overlay = await screen.findByTestId("pdf-viewer-highlight");
      expect(overlay.getAttribute("data-highlight-tier")).toBe("exact");
      const style = overlay.getAttribute("style") ?? "";
      // exact → solid border (the tight word-level box).
      expect(style).toMatch(/border:\s*2px solid/);
    });

    it("renders a TRANSLUCENT (chunk-region) highlight for a paraphrase-tier citation", async () => {
      getXrayMock.mockResolvedValue(fakeXray);

      render(
        <PdfViewerWidget
          scope={docScope("doc-1")}
          role="member"
          targetPage={1}
          highlightBbox={{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }}
          highlightTier="paraphrase"
        />,
        { wrapper },
      );
      const overlay = await screen.findByTestId("pdf-viewer-highlight");
      expect(overlay.getAttribute("data-highlight-tier")).toBe("paraphrase");
      const style = overlay.getAttribute("style") ?? "";
      // paraphrase → distinct lower-confidence visual: dashed border,
      // and a strictly more translucent fill than the exact tier.
      expect(style).toMatch(/border:\s*1px dashed/);
    });

    it("renders a SOFT (approximate) highlight for an ambient-tier citation with a bbox", async () => {
      // citation-highlight UX: an answer must always reveal where it came from.
      // For this corpus the backend frequently returns ambient citations (the
      // quote-verification is conservative), so ambient now draws a faint,
      // dashed chunk-region — NOT nothing — whenever a bbox is present.
      getXrayMock.mockResolvedValue(fakeXray);

      render(
        <PdfViewerWidget
          scope={docScope("doc-1")}
          role="member"
          targetPage={1}
          highlightBbox={{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }}
          highlightTier="ambient"
        />,
        { wrapper },
      );
      const overlay = await screen.findByTestId("pdf-viewer-highlight");
      expect(overlay.getAttribute("data-highlight-tier")).toBe("ambient");
      const style = overlay.getAttribute("style") ?? "";
      // ambient → softest visual: dashed border (lower-confidence, looser region).
      expect(style).toMatch(/border:\s*1px dashed/);
    });

    it("does NOT render the highlight overlay when highlightBbox is absent or null", async () => {
      getXrayMock.mockResolvedValue(fakeXray);

      const { rerender } = render(
        <PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={1} />,
        { wrapper },
      );
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      expect(screen.queryByTestId("pdf-viewer-highlight")).not.toBeInTheDocument();

      rerender(
        <PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={1} highlightBbox={null} />,
      );
      expect(screen.queryByTestId("pdf-viewer-highlight")).not.toBeInTheDocument();
    });

    it("thumb clicks still update activePage after a controlled targetPage mount (no lock-out)", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      const user = (await import("@testing-library/user-event")).default.setup();

      render(<PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={1} />, { wrapper });

      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[0]?.pageUrl),
      );
      const thumb3 = await screen.findByTestId("pdf-viewer-thumb-3");
      await user.click(thumb3);
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[2]?.pageUrl),
      );
    });

    it("hides a target-page highlight when the user browses to another page", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      const user = (await import("@testing-library/user-event")).default.setup();

      render(
        <PdfViewerWidget
          scope={docScope("doc-1")}
          role="member"
          targetPage={1}
          highlightBbox={{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }}
        />,
        { wrapper },
      );

      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[0]?.pageUrl),
      );
      expect(screen.getByTestId("pdf-viewer-highlight")).toBeInTheDocument();

      await user.click(await screen.findByTestId("pdf-viewer-thumb-3"));
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[2]?.pageUrl),
      );
      expect(screen.queryByTestId("pdf-viewer-highlight")).not.toBeInTheDocument();
    });
  });

  // WF-01 C5 (2026-05-28). Scan animation overlay appears over the
  // active page image when `showScanAnimation` is true. The default is
  // false so steady-mode + post-thinking F2 don't get a perpetual
  // sweep. Implementation is a CSS-animated bar; we assert by testid.
  describe("WF-01 C5: scan animation overlay", () => {
    it("renders the scan-line overlay + sweep beam when showScanAnimation is true", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(
        <PdfViewerWidget scope={docScope("doc-1")} role="anonymous" showScanAnimation />,
        { wrapper },
      );
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      expect(screen.getByTestId("pdf-viewer-scan-line")).toBeInTheDocument();
      // The animated sweeper element (the one the reduced-motion @media rule
      // zeroes the animation on) is testid'd so the e2e reduced-motion sweep
      // can assert its computed animationName is "none".
      expect(screen.getByTestId("pdf-viewer-scan-beam")).toBeInTheDocument();
    });

    it("omits the overlay by default", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      expect(screen.queryByTestId("pdf-viewer-scan-line")).not.toBeInTheDocument();
      expect(screen.queryByTestId("pdf-viewer-scan-beam")).not.toBeInTheDocument();
    });

    // The prop is surfaced on the widget root as `data-scan-animation`
    // (the prefetch-wiring contract, like `data-role` / `data-target-page`):
    // consumers + tests assert the wiring without waiting on the async xray
    // fetch that the visible overlay needs.
    it("reflects showScanAnimation on the root via data-scan-animation", () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" showScanAnimation />, { wrapper });
      expect(screen.getByTestId("pdf-viewer-widget")).toHaveAttribute("data-scan-animation", "true");
    });

    it("data-scan-animation is 'false' by default", () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });
      expect(screen.getByTestId("pdf-viewer-widget")).toHaveAttribute("data-scan-animation", "false");
    });
  });

  // WF-01 C10 (2026-05-28). Multi-region overlay used by F5 to paint
  // one lit region per citation in the assistant answer. Each region
  // carries a `color` (green / cyan / coral) keyed to the
  // corresponding `[N]` CiteChip in the answer.
  describe("WF-01 C10: litRegions multi-overlay", () => {
    it("paints one overlay per region on the active page", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(
        <PdfViewerWidget
          scope={docScope("doc-1")}
          role="anonymous"
          litRegions={[
            { page: 1, x: 0.1, y: 0.1, w: 0.2, h: 0.05, color: "green" },
            { page: 1, x: 0.3, y: 0.2, w: 0.2, h: 0.05, color: "cyan" },
            { page: 2, x: 0.4, y: 0.3, w: 0.15, h: 0.05, color: "coral" },
          ]}
        />,
        { wrapper },
      );
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      // Page 1 active by default → 2 regions for page 1, 0 for page 2.
      expect(screen.getAllByTestId(/^pdf-viewer-lit-region-/).length).toBe(2);
      expect(screen.getByTestId("pdf-viewer-lit-region-0")).toHaveAttribute("data-color", "green");
      expect(screen.getByTestId("pdf-viewer-lit-region-1")).toHaveAttribute("data-color", "cyan");
    });

    it("omits regions when litRegions is empty / unset", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(<PdfViewerWidget scope={docScope("doc-1")} role="anonymous" />, { wrapper });
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      expect(screen.queryAllByTestId(/^pdf-viewer-lit-region-/).length).toBe(0);
    });
  });

  // add-pdf-zoom-pan — the user-visible behavior, written first (fails until
  // the zoom layer + inline controls exist). The page magnifies on zoom-in,
  // the citation highlight stays mounted inside the zoomed layer, and Fit
  // resets to whole-page.
  describe("zoom & pan", () => {
    it("zoom controls magnify and reset the page; the citation highlight stays mounted", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(
        <PdfViewerWidget
          scope={docScope("doc-1")}
          role="member"
          targetPage={1}
          highlightBbox={{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }}
          highlightTier="exact"
        />,
        { wrapper },
      );
      await screen.findByTestId("pdf-viewer-page-image");

      // Starts at Fit: zoom 1, zoom-out disabled, highlight present.
      const stage = screen.getByTestId("pdf-viewer-stage");
      expect(stage).toHaveAttribute("data-zoom", "1");
      expect(screen.getByTestId("pdf-zoom-out")).toBeDisabled();
      expect(screen.getByTestId("pdf-viewer-highlight")).toBeInTheDocument();

      // Zoom in one step → 1.25, highlight still inside the zoomed layer.
      fireEvent.click(screen.getByTestId("pdf-zoom-in"));
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-stage")).toHaveAttribute("data-zoom", "1.25"),
      );
      const stageEl = screen.getByTestId("pdf-viewer-stage");
      expect(stageEl.querySelector('[data-testid="pdf-viewer-highlight"]')).not.toBeNull();

      // Fit resets to whole page.
      fireEvent.click(screen.getByTestId("pdf-zoom-fit"));
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-stage")).toHaveAttribute("data-zoom", "1"),
      );
    });

    it("plain scroll does nothing — no zoom, no pan", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(<PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={1} />, { wrapper });
      const stage = await screen.findByTestId("pdf-viewer-stage");
      fireEvent.wheel(stage, { deltaY: -200 });
      fireEvent.wheel(stage, { deltaY: 200 });
      expect(stage).toHaveAttribute("data-zoom", "1");
      expect(stage).toHaveAttribute("data-pan", "0,0");
    });

    it("Ctrl/Cmd + wheel zooms the page", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(<PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={1} />, { wrapper });
      const stage = await screen.findByTestId("pdf-viewer-stage");
      fireEvent.wheel(stage, { deltaY: -120, ctrlKey: true }); // zoom in
      await waitFor(() => expect(stage).toHaveAttribute("data-zoom", "1.25"));
      fireEvent.wheel(stage, { deltaY: 120, metaKey: true }); // zoom back out
      await waitFor(() => expect(stage).toHaveAttribute("data-zoom", "1"));
    });

    it("drag pans only when zoomed in", async () => {
      // Drag uses pointer DELTAS, but clampPan needs a measured pane + page
      // dims — inject a ResizeObserver that reports an 800×600 pane.
      const originalRO = globalThis.ResizeObserver;
      globalThis.ResizeObserver = class {
        private cb: ResizeObserverCallback;
        constructor(cb: ResizeObserverCallback) {
          this.cb = cb;
        }
        observe(): void {
          this.cb([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry], this);
        }
        unobserve(): void {}
        disconnect(): void {}
      } as unknown as typeof globalThis.ResizeObserver;
      try {
        getXrayMock.mockResolvedValue(fakeXray);
        render(<PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={1} />, { wrapper });
        const stage = await screen.findByTestId("pdf-viewer-stage");
        // jsdom's PointerEvent drops clientX/Y; a MouseEvent typed as a pointer
        // event carries them and still reaches the pointer handlers.
        const ptr = (type: string, x: number, y: number) =>
          new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });

        // At Fit: a drag does nothing.
        fireEvent(stage, ptr("pointerdown", 100, 100));
        fireEvent(window, ptr("pointermove", 100, 40));
        fireEvent(window, ptr("pointerup", 100, 40));
        expect(stage).toHaveAttribute("data-pan", "0,0");

        // Zoom in, then drag vertically → pan.y moves (clamped).
        fireEvent.click(screen.getByTestId("pdf-zoom-in"));
        await waitFor(() => expect(stage).toHaveAttribute("data-zoom", "1.25"));
        fireEvent(stage, ptr("pointerdown", 100, 100));
        fireEvent(window, ptr("pointermove", 100, 50)); // dy = -50
        fireEvent(window, ptr("pointerup", 100, 50));
        await waitFor(() => expect(stage).toHaveAttribute("data-pan", "0,-50"));
      } finally {
        globalThis.ResizeObserver = originalRO;
      }
    });

    it("keyboard +/-/0 zooms and fits when the viewer is focused", async () => {
      getXrayMock.mockResolvedValue(fakeXray);
      render(<PdfViewerWidget scope={docScope("doc-1")} role="member" targetPage={1} />, { wrapper });
      const stage = await screen.findByTestId("pdf-viewer-stage");
      const root = screen.getByTestId("pdf-viewer-widget");
      fireEvent.keyDown(root, { key: "+" });
      await waitFor(() => expect(stage).toHaveAttribute("data-zoom", "1.25"));
      fireEvent.keyDown(root, { key: "-" });
      await waitFor(() => expect(stage).toHaveAttribute("data-zoom", "1"));
      fireEvent.keyDown(root, { key: "+" });
      await waitFor(() => expect(stage).toHaveAttribute("data-zoom", "1.25"));
      fireEvent.keyDown(root, { key: "0" }); // fit
      await waitFor(() => expect(stage).toHaveAttribute("data-zoom", "1"));
    });
  });
});
