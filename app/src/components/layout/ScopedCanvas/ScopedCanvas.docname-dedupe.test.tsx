/**
 * viewer-nav-redesign dedupe — the doc-viewer nav title resolves the document
 * name from the SAME X-Ray the PdfViewer already fetches (it reports the
 * fileName up), so the shell no longer issues a second lightweight
 * `getDocument` round-trip just for the nav. One document → one network call.
 *
 * The previous behavior fetched the name twice (a `getDocument` for the nav +
 * a `getDocumentXray` for the viewer). This guards that the duplicate is gone
 * AND that the nav still shows the real name.
 */
import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ContentScope } from "@groundx/shared";

import type { ViewerStep } from "@/contexts/ChatStoreContext";
import { renderWithOnboardingProviders } from "@/test/renderWithOnboardingProviders";

import { ScopedCanvas } from "./ScopedCanvas";

const DOC_SCOPE: ContentScope = { type: "documents", documentIds: ["doc-1"] };
const header = () => screen.getByTestId("viewer-frame-header");

/** A valid X-Ray payload carrying the document's fileName (mirrors the real shape). */
const xrayWithName = {
  fileName: "windom-utility-april.pdf",
  fileType: "pdf",
  fileSummary: "City of Windom utility bill",
  language: "English",
  sourceUrl: "https://upload.eyelevel.ai/prod/file/ssp/abc.pdf",
  documentPages: [
    { pageNumber: 1, pageUrl: "https://upload.eyelevel.ai/prod/page/1.jpg", width: 1700, height: 2200, chunks: [] },
  ],
  chunks: [],
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("doc-viewer nav name — single source (no duplicate fetch)", () => {
  it("shows the viewer-reported fileName in the nav title WITHOUT a second getDocument fetch", async () => {
    const getGroundXDocument = vi.fn();
    const getGroundXDocumentXray = vi.fn().mockResolvedValue(xrayWithName);
    const step: ViewerStep = { kind: "doc-viewer", documentId: "doc-1" };

    renderWithOnboardingProviders(
      <ScopedCanvas scope={DOC_SCOPE} step={step} role="anonymous" experience="onboarding" />,
      { api: { groundxDocuments: { getGroundXDocument, getGroundXDocumentXray } } },
    );

    // The nav title resolves to the name carried by the viewer's X-Ray.
    await waitFor(() =>
      expect(within(header()).getByText("windom-utility-april.pdf")).toBeInTheDocument(),
    );
    // The X-Ray fetch is the ONLY round-trip for this document — the nav no
    // longer issues its own lightweight metadata fetch.
    expect(getGroundXDocumentXray).toHaveBeenCalledWith("doc-1", undefined);
    expect(getGroundXDocument).not.toHaveBeenCalled();
  });
});
