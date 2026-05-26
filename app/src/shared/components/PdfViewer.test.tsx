import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the pdfjs worker URL import — Vite resolves `?url` suffix at
// build time and returns a string. In vitest we substitute a fixed
// string so the bundler doesn't need to walk the worker file.
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/__mock_pdf_worker__.mjs",
}));

// Hoisted spies so we can introspect what PdfViewer asks pdfjs to do.
const renderMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getViewportMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({ width: 480, height: 640 }),
);
const getPageMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    getViewport: getViewportMock,
    render: (args: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) =>
      ({ promise: renderMock(args) }) as unknown,
  }),
);
const getDocumentMock = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    promise: Promise.resolve({
      numPages: 3,
      getPage: getPageMock,
    }),
  }),
);

vi.mock("pdfjs-dist", () => ({
  getDocument: getDocumentMock,
  GlobalWorkerOptions: { workerSrc: "" },
}));

import { PdfViewer } from "./PdfViewer";

describe("PdfViewer (UR-01)", () => {
  beforeEach(() => {
    // jsdom canvas getContext returns null by default — stub a
    // minimal CanvasRenderingContext2D so pdf.render() has something
    // to write to. The renderMock above doesn't actually use it, but
    // the component still passes it through.
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      // 2d context surface — empty stubs are fine for the unit test.
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      clearRect: vi.fn(),
    }) as unknown as HTMLCanvasElement["getContext"];
  });

  afterEach(() => {
    renderMock.mockClear();
    getPageMock.mockClear();
    getDocumentMock.mockClear();
  });

  it("invokes pdfjs.getDocument with the given url", async () => {
    render(<PdfViewer url="/samples/utility/april.pdf" />);
    await waitFor(() => {
      expect(getDocumentMock).toHaveBeenCalled();
    });
    // pdfjs supports either a string or a config object — we accept
    // either as long as the url surfaces.
    const arg = getDocumentMock.mock.calls[0]?.[0];
    const url = typeof arg === "string" ? arg : (arg as { url?: string }).url;
    expect(url).toBe("/samples/utility/april.pdf");
  });

  it("renders a canvas inside the viewer container", async () => {
    render(<PdfViewer url="/samples/utility/april.pdf" />);
    await waitFor(() => {
      const container = screen.getByTestId("pdf-viewer");
      expect(container.querySelector("canvas")).toBeTruthy();
    });
  });

  it("paints the requested page via pdfjs page.render()", async () => {
    render(<PdfViewer url="/samples/utility/april.pdf" pageNumber={2} />);
    await waitFor(() => {
      expect(getPageMock).toHaveBeenCalledWith(2);
    });
    await waitFor(() => {
      expect(renderMock).toHaveBeenCalled();
    });
  });

  it("defaults to page 1 when no pageNumber is given", async () => {
    render(<PdfViewer url="/samples/utility/april.pdf" />);
    await waitFor(() => {
      expect(getPageMock).toHaveBeenCalledWith(1);
    });
  });
});
