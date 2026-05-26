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
});
