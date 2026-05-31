import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { DocumentsProvider } from "@/contexts/DocumentsContext/DocumentsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import { MessageBarProvider } from "@/contexts/MessageBarContext/MessageBarContext";

/**
 * PdfViewerWidget — the production PDF viewer.
 *
 * Used identically in onboarding (F2) and steady-mode source viewer.
 * Reads `documentId` + `mode` props; pulls real xray data from
 * GroundX via DocumentsContext; renders pre-rasterized page images
 * from `xray.documentPages[].pageUrl`.
 *
 * Per the no-onboarding-duplicates rule
 * (`memory/feedback_no_onboarding_duplicates.md`): this is the one
 * production widget for PDF rendering. The onboarding view
 * (`UnderstandView`) is a thin layout wrapper that mounts this with
 * `mode="onboarding"`.
 */

vi.mock("@/api", () => ({
  api: {
    groundxDocuments: {
      listGroundXDocuments: vi.fn(),
      getGroundXDocument: vi.fn(),
      ingestGroundXRemoteDocuments: vi.fn(),
      crawlGroundXWebsite: vi.fn(),
      copyGroundXDocuments: vi.fn(),
      updateGroundXDocuments: vi.fn(),
      deleteGroundXDocument: vi.fn(),
      deleteGroundXDocuments: vi.fn(),
      lookupGroundXDocument: vi.fn(),
      listGroundXProcesses: vi.fn(),
      getGroundXProcessingStatus: vi.fn(),
      cancelGroundXProcess: vi.fn(),
      getGroundXDocumentXray: vi.fn(),
      getGroundXDocumentExtract: vi.fn(),
    },
  },
}));

beforeEach(() => {
  for (const fn of Object.values(api.groundxDocuments)) (fn as Mock).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

import { PdfViewerWidget } from "./PdfViewerWidget";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LoadingProvider>
    <MessageBarProvider>
      <DocumentsProvider>{children}</DocumentsProvider>
    </MessageBarProvider>
  </LoadingProvider>
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
  it("renders a loading state immediately and then the first page image once xray resolves", async () => {
    let resolveXray: (v: unknown) => void = () => {};
    (api.groundxDocuments.getGroundXDocumentXray as Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveXray = resolve;
      }),
    );

    render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });

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

  describe("WF-15: placeholder-id X-Ray gate", () => {
    it("does NOT fetch an X-Ray for a scenario:* placeholder id", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

      render(<PdfViewerWidget documentId="scenario:utility" mode="onboarding" />, { wrapper });

      // No fetch fires for a placeholder id — and the widget shows a
      // neutral loading state, never the "COULD NOT LOAD" error flash.
      await act(async () => {
        await Promise.resolve();
      });
      expect(api.groundxDocuments.getGroundXDocumentXray).not.toHaveBeenCalled();
      const root = screen.getByTestId("pdf-viewer-widget");
      expect(root.getAttribute("data-loading")).toBe("true");
      expect(screen.queryByText(/COULD NOT LOAD/i)).not.toBeInTheDocument();
    });

    it("fetches the X-Ray once the id resolves to a real GroundX documentId", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

      const { rerender } = render(
        <PdfViewerWidget documentId="scenario:utility" mode="onboarding" />,
        { wrapper },
      );
      expect(api.groundxDocuments.getGroundXDocumentXray).not.toHaveBeenCalled();

      rerender(<PdfViewerWidget documentId="c3bfff49-6640-4213-822b-e81c3a771e45" mode="onboarding" />);

      await waitFor(() =>
        expect(api.groundxDocuments.getGroundXDocumentXray).toHaveBeenCalledWith(
          "c3bfff49-6640-4213-822b-e81c3a771e45",
          undefined,
        ),
      );
    });
  });

  it("does NOT render the in-pane filename header (filename now lives in the chat header)", async () => {
    (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

    render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });

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
    (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

    render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
    const root = screen.getByTestId("pdf-viewer-widget");
    expect(root.getAttribute("aria-label") ?? "").toContain("utility-bill-april-2026.pdf");
  });

  it("renders one thumbnail per documentPage with the real pageUrls", async () => {
    (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

    render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-thumb-1")).toBeInTheDocument());
    expect(screen.getByTestId("pdf-viewer-thumb-2")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer-thumb-3")).toBeInTheDocument();
  });

  it("calls getGroundXDocumentXray with the supplied documentId on mount", async () => {
    (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

    render(<PdfViewerWidget documentId="some-doc-uuid" mode="onboarding" />, { wrapper });

    await waitFor(() =>
      expect(api.groundxDocuments.getGroundXDocumentXray).toHaveBeenCalledWith("some-doc-uuid", undefined),
    );
  });

  it("clicking a thumbnail switches the main image to that page", async () => {
    (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);
    const user = (await import("@testing-library/user-event")).default.setup();

    render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });

    const thumb2 = await screen.findByTestId("pdf-viewer-thumb-2");
    await user.click(thumb2);

    await waitFor(() =>
      expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[1]?.pageUrl),
    );
  });

  it("renders an error state if the xray call fails", async () => {
    (api.groundxDocuments.getGroundXDocumentXray as Mock).mockRejectedValue(new Error("boom"));

    render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });

    await waitFor(() => expect(screen.getByTestId("pdf-viewer-error")).toBeInTheDocument());
  });

  it("data-mode attribute reflects the mode prop (so locked-feature CSS / tests can branch)", async () => {
    (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

    const { rerender } = render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });
    await waitFor(() =>
      expect(screen.getByTestId("pdf-viewer-widget")).toHaveAttribute("data-mode", "onboarding"),
    );

    rerender(<PdfViewerWidget documentId="doc-1" mode="steady" />);
    await waitFor(() =>
      expect(screen.getByTestId("pdf-viewer-widget")).toHaveAttribute("data-mode", "steady"),
    );
  });

  // ── clickable-citations Phase 4 — controlled targetPage + bbox overlay
  describe("controlled targetPage + highlightBbox (clickable-citations Phase 4)", () => {
    it("mounts at targetPage when supplied (overrides default initialPage)", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

      render(<PdfViewerWidget documentId="doc-1" mode="steady" targetPage={3} />, { wrapper });
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[2]?.pageUrl),
      );
    });

    it("re-renders with a new targetPage jumps the page image", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

      const { rerender } = render(<PdfViewerWidget documentId="doc-1" mode="steady" targetPage={1} />, { wrapper });
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[0]?.pageUrl),
      );

      rerender(<PdfViewerWidget documentId="doc-1" mode="steady" targetPage={2} />);
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[1]?.pageUrl),
      );
    });

    it("renders a highlight overlay positioned proportionally when highlightBbox is supplied", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

      render(
        <PdfViewerWidget
          documentId="doc-1"
          mode="steady"
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
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

      render(
        <PdfViewerWidget
          documentId="doc-1"
          mode="steady"
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
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

      render(
        <PdfViewerWidget
          documentId="doc-1"
          mode="steady"
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

    it("renders NO inline highlight for an ambient-tier citation (source chip only)", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

      render(
        <PdfViewerWidget
          documentId="doc-1"
          mode="steady"
          targetPage={1}
          highlightBbox={{ x: 0.1, y: 0.2, w: 0.5, h: 0.05 }}
          highlightTier="ambient"
        />,
        { wrapper },
      );
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      // Ambient renders no auto inline span even when a bbox is present.
      expect(screen.queryByTestId("pdf-viewer-highlight")).not.toBeInTheDocument();
    });

    it("does NOT render the highlight overlay when highlightBbox is absent or null", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

      const { rerender } = render(
        <PdfViewerWidget documentId="doc-1" mode="steady" targetPage={1} />,
        { wrapper },
      );
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      expect(screen.queryByTestId("pdf-viewer-highlight")).not.toBeInTheDocument();

      rerender(
        <PdfViewerWidget documentId="doc-1" mode="steady" targetPage={1} highlightBbox={null} />,
      );
      expect(screen.queryByTestId("pdf-viewer-highlight")).not.toBeInTheDocument();
    });

    it("thumb clicks still update activePage after a controlled targetPage mount (no lock-out)", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);
      const user = (await import("@testing-library/user-event")).default.setup();

      render(<PdfViewerWidget documentId="doc-1" mode="steady" targetPage={1} />, { wrapper });

      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[0]?.pageUrl),
      );
      const thumb3 = await screen.findByTestId("pdf-viewer-thumb-3");
      await user.click(thumb3);
      await waitFor(() =>
        expect(screen.getByTestId("pdf-viewer-page-image").getAttribute("src")).toBe(fakeXray.documentPages[2]?.pageUrl),
      );
    });
  });

  // WF-01 C5 (2026-05-28). Scan animation overlay appears over the
  // active page image when `showScanAnimation` is true. The default is
  // false so steady-mode + post-thinking F2 don't get a perpetual
  // sweep. Implementation is a CSS-animated bar; we assert by testid.
  describe("WF-01 C5: scan animation overlay", () => {
    it("renders the scan-line overlay when showScanAnimation is true", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);
      render(
        <PdfViewerWidget documentId="doc-1" mode="onboarding" showScanAnimation />,
        { wrapper },
      );
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      expect(screen.getByTestId("pdf-viewer-scan-line")).toBeInTheDocument();
    });

    it("omits the overlay by default", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);
      render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      expect(screen.queryByTestId("pdf-viewer-scan-line")).not.toBeInTheDocument();
    });
  });

  // WF-01 C10 (2026-05-28). Multi-region overlay used by F5 to paint
  // one lit region per citation in the assistant answer. Each region
  // carries a `color` (green / cyan / coral) keyed to the
  // corresponding `[N]` CiteChip in the answer.
  describe("WF-01 C10: litRegions multi-overlay", () => {
    it("paints one overlay per region on the active page", async () => {
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);
      render(
        <PdfViewerWidget
          documentId="doc-1"
          mode="onboarding"
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
      (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);
      render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });
      await waitFor(() => expect(screen.getByTestId("pdf-viewer-page-image")).toBeInTheDocument());
      expect(screen.queryAllByTestId(/^pdf-viewer-lit-region-/).length).toBe(0);
    });
  });
});
