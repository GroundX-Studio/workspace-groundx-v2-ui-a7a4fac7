import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { UnderstandView } from "./UnderstandView";

/**
 * UnderstandView is now a thin layout wrapper that mounts the
 * production `PdfViewerWidget`. The widget itself is tested under
 * `src/components/viewer-widgets/PdfViewer/`. Here we only assert:
 *
 *   1. BYO branch (no scenario) → sign-in placeholder.
 *   2. With a scenario, the widget mounts with the right documentId
 *      and onboarding mode.
 *   3. The widget's xray call fires (real-data wiring is live).
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
  // The widget will reject if no xray response is mocked; default to a
  // benign resolution so the BYO test doesn't accidentally render the
  // error state.
  (api.groundxDocuments.getGroundXDocumentXray as Mock).mockResolvedValue({
    fileName: "x.pdf",
    fileType: "pdf",
    sourceUrl: "https://example.com/x.pdf",
    documentPages: [],
    chunks: [],
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("UnderstandView (F2 canvas)", () => {
  it("renders a BYO sign-in placeholder when no scenario has been picked", () => {
    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: null });
    expect(screen.getByText(/sign in to start uploading/i)).toBeInTheDocument();
    expect(screen.queryByTestId("understand-canvas")).not.toBeInTheDocument();
  });

  it("mounts the production PdfViewerWidget with onboarding mode when a scenario is active", async () => {
    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: "utility" });
    expect(screen.getByTestId("understand-canvas")).toBeInTheDocument();
    const widget = await screen.findByTestId("pdf-viewer-widget");
    expect(widget).toHaveAttribute("data-role", "anonymous");
  });

  it("calls getGroundXDocumentXray with the active document id (real data wiring)", async () => {
    renderWithOnboardingProviders(<UnderstandView />, { initialFrame: "f2", initialScenario: "utility" });
    await waitFor(() => {
      expect(api.groundxDocuments.getGroundXDocumentXray).toHaveBeenCalled();
    });
    // The utility test scenario ships at least one document; the call
    // happens with that doc's documentId.
    const calls = (api.groundxDocuments.getGroundXDocumentXray as Mock).mock.calls;
    expect(calls[0]?.[0]).toBeTruthy();
    expect(typeof calls[0]?.[0]).toBe("string");
  });
});
