/**
 * PdfViewer — UR-01.
 *
 * Real PDF rendering for the F2 UnderstandView canvas, using
 * `pdfjs-dist` v4. Today F2 ships a flat silhouette placeholder; once a
 * scenario document carries a `previewUrl`, this component swaps in and
 * renders the page to a real <canvas>. SCEN-06 will deliver the real
 * Utility / Loan / Solar PDFs so the URL chain ends in pdfjs actually
 * painting pages.
 *
 * Notes:
 *
 *   • The worker file ships with `pdfjs-dist`. We import it with Vite's
 *     `?url` suffix so the bundler emits a same-origin asset URL and
 *     pdfjs loads it as a Web Worker. Tests stub the `?url` import
 *     (see PdfViewer.test.tsx).
 *
 *   • The component is single-page on purpose — UnderstandView only
 *     shows one page at a time, and the thumbnail strip below the
 *     canvas already drives page selection. Multi-page virtual scroll
 *     is a later concern.
 *
 *   • `onLoadError` lets the caller swap to the silhouette fallback
 *     without this component owning the fallback UI. Keeps it
 *     composable for future surfaces (e.g. source-viewer in F5).
 */

import Box from "@mui/material/Box";
import { useEffect, useRef, useState, type FC } from "react";
import * as pdfjs from "pdfjs-dist";
// `?url` suffix is a Vite-native asset URL import. The worker file is
// shipped by pdfjs-dist; we serve it same-origin so the CSP worker-src
// stays tight. Tests mock this module.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

import { WHITE } from "@/constants";

// Module-level so we only set workerSrc once per page load. pdfjs
// reads this when getDocument() is first called.
if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl as unknown as string;
}

export interface PdfViewerProps {
  /** Same-origin PDF binary URL (typically a /samples/... or /api/... path). */
  url: string;
  /** 1-indexed page to render. Defaults to 1. */
  pageNumber?: number;
  /** Optional render scale; defaults to 1. */
  scale?: number;
  /** Optional error hook so the caller can swap in a fallback. */
  onLoadError?: (err: unknown) => void;
}

export const PdfViewer: FC<PdfViewerProps> = ({
  url,
  pageNumber = 1,
  scale = 1,
  onLoadError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");

    // pdfjs accepts a string url *or* a config object. We pass the
    // config form so future caller-controlled options (httpHeaders,
    // withCredentials) are a one-line change.
    const loadingTask = pdfjs.getDocument({ url });

    loadingTask.promise
      .then(async (doc) => {
        if (cancelled) return;
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (cancelled) return;
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus("error");
        onLoadError?.(err);
      });

    return () => {
      cancelled = true;
    };
  }, [url, pageNumber, scale, onLoadError]);

  return (
    <Box
      data-testid="pdf-viewer"
      data-status={status}
      sx={{
        position: "absolute",
        inset: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        backgroundColor: WHITE,
        overflow: "auto",
      }}
      aria-label="Document preview"
    >
      <canvas
        ref={canvasRef}
        // The intrinsic size is set imperatively from the page
        // viewport during render. CSS keeps it visually capped to the
        // container's content box.
        style={{ maxWidth: "100%", height: "auto", display: "block" }}
      />
    </Box>
  );
};
