import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

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
});
