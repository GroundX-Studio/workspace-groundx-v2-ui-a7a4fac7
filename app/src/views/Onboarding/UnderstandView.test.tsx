import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";
import { utilityTestScenario } from "@/test/scenarioFixtures";

// Stub the pdfjs worker URL import so vite doesn't have to resolve
// the `?url` query in test land.
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/__mock_pdf_worker__.mjs",
}));

// Stub pdfjs itself — the contract for UR-01 from this view's
// perspective is "PdfViewer mounts and asks pdfjs for the URL".
// The PdfViewer test covers the pdfjs internals.
const getDocumentMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 3,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 480, height: 640 }),
        render: () => ({ promise: Promise.resolve() }),
      }),
    }),
  }),
);
vi.mock("pdfjs-dist", () => ({
  getDocument: getDocumentMock,
  GlobalWorkerOptions: { workerSrc: "" },
}));

import { UnderstandView } from "./UnderstandView";

describe("UnderstandView (F2 canvas)", () => {
  it("renders a BYO sign-in placeholder when no scenario has been picked", () => {
    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: null });
    expect(screen.getByText(/sign in to start uploading/i)).toBeInTheDocument();
    expect(screen.queryByTestId("understand-canvas")).not.toBeInTheDocument();
  });

  it("shows the LIVE PARSE label + animated progress bar + processing status", () => {
    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: "utility" });
    expect(screen.getByTestId("understand-live-parse-label")).toHaveTextContent(/LIVE PARSE/i);
    expect(screen.getByTestId("understand-live-parse-label")).toHaveTextContent(/April 2026 Statement\.pdf/i);
    expect(screen.getByTestId("understand-progress-bar")).toBeInTheDocument();
    expect(screen.getByTestId("understand-processing-status")).toHaveTextContent(/processing/i);
  });

  it("renders the PDF silhouette card with the scan-line animation overlay", () => {
    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: "utility" });
    expect(screen.getByTestId("understand-pdf-card")).toBeInTheDocument();
    // The scan line is identifiable by its testid; the visual gradient
    // is a styling detail.
    expect(screen.getByTestId("understand-scan-line")).toBeInTheDocument();
  });

  it("renders the page thumbnails strip below the PDF (one per page)", () => {
    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: "utility" });
    // Utility scenario has 3 pages per the manifest. Each thumbnail
    // carries data-testid="understand-page-thumb-<n>" so a future
    // pdfjs-driven implementation can match the same shape.
    expect(screen.getByTestId("understand-page-thumb-1")).toBeInTheDocument();
    expect(screen.getByTestId("understand-page-thumb-2")).toBeInTheDocument();
    expect(screen.getByTestId("understand-page-thumb-3")).toBeInTheDocument();
    // The first thumb is the "parsing" page; subsequent pages are "queued".
    expect(screen.getByTestId("understand-page-thumb-1")).toHaveAttribute("data-state", "parsing");
    expect(screen.getByTestId("understand-page-thumb-2")).toHaveAttribute("data-state", "queued");
  });

  it("no longer renders thinking notes or an advance CTA on the canvas (those moved to chat)", () => {
    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: "utility" });
    // Thinking notes content is now in OnboardingChatColumn; the canvas
    // must not duplicate it.
    expect(screen.queryByText(/parsing layout/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Show me the extract/)).not.toBeInTheDocument();
  });

  describe("UR-01 PdfViewer wiring", () => {
    it("mounts PdfViewer when the active scenario's first doc carries a previewUrl", async () => {
      // Hand the registry a scenario whose first document points at a
      // real same-origin URL — that's the SCEN-06 contract.
      const withPdf = {
        ...utilityTestScenario,
        documents: [
          {
            ...utilityTestScenario.documents[0]!,
            previewUrl: "/samples/utility/april.pdf",
          },
        ],
      };
      renderWithOnboardingProviders(<UnderstandView />, {
        initialFrame: "f2",
        initialScenario: "utility",
        initialScenarios: [withPdf],
      });
      await waitFor(() => {
        expect(screen.getByTestId("pdf-viewer")).toBeInTheDocument();
      });
      // pdfjs was asked to load the right URL.
      const arg = getDocumentMock.mock.calls[0]?.[0];
      const url = typeof arg === "string" ? arg : (arg as { url?: string }).url;
      expect(url).toBe("/samples/utility/april.pdf");
    });

    it("renders the silhouette placeholder when previewUrl is absent (SCEN-06 not yet wired)", () => {
      // Plain utility fixture — no previewUrl. The scan-line + scaffolding
      // around the silhouette is still the visible canvas.
      renderWithOnboardingProviders(<UnderstandView />, {
        initialFrame: "f2",
        initialScenario: "utility",
      });
      expect(screen.queryByTestId("pdf-viewer")).not.toBeInTheDocument();
      // The pdf card + scan line still render around the silhouette.
      expect(screen.getByTestId("understand-pdf-card")).toBeInTheDocument();
    });
  });
});
