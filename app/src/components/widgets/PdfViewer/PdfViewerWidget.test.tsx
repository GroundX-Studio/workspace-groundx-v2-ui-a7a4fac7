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

    // While the call is in flight the widget shows the placeholder /
    // scan-line UX, not a real image.
    expect(screen.getByTestId("pdf-viewer-widget")).toBeInTheDocument();
    expect(screen.getByTestId("pdf-viewer-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("pdf-viewer-page-image")).not.toBeInTheDocument();

    await act(async () => {
      resolveXray(fakeXray);
    });

    const pageImage = await screen.findByTestId("pdf-viewer-page-image");
    expect(pageImage.getAttribute("src")).toBe(fakeXray.documentPages[0]?.pageUrl);
  });

  it("renders the LIVE PARSE label with the real fileName from xray", async () => {
    (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue(fakeXray);

    render(<PdfViewerWidget documentId="doc-1" mode="onboarding" />, { wrapper });

    const label = await screen.findByTestId("pdf-viewer-filename");
    expect(label).toHaveTextContent("utility-bill-april-2026.pdf");
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
