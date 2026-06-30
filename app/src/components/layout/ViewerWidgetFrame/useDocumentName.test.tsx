import { renderHook, waitFor } from "@testing-library/react";
import type { FC, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DocumentsContextI } from "@/contexts/DocumentsContext/DocumentsContext";
import { DocumentsContext } from "@/contexts/DocumentsContext/DocumentsContext";

import { useDocumentName } from "./useDocumentName";

/** Minimal DocumentsContext value — only the read fields the hook touches. */
function docsValue(partial: Partial<DocumentsContextI>): DocumentsContextI {
  return { documents: [], selectedDocument: null, ...partial } as DocumentsContextI;
}

function wrapperFor(value: DocumentsContextI): FC<{ children: ReactNode }> {
  return ({ children }) => (
    <DocumentsContext.Provider value={value}>{children}</DocumentsContext.Provider>
  );
}

describe("useDocumentName", () => {
  it("returns undefined when no provider is mounted (bare-render safe)", () => {
    const { result } = renderHook(() => useDocumentName("doc-1"));
    expect(result.current).toBeUndefined();
  });

  it("returns undefined when no documentId is given", () => {
    const { result } = renderHook(() => useDocumentName(undefined));
    expect(result.current).toBeUndefined();
  });

  it("resolves the name from the DocumentsContext documents[] (no fetch)", () => {
    const wrapper = wrapperFor(
      docsValue({ documents: [{ documentId: "doc-1", fileName: "alpha.pdf" }] }),
    );
    const { result } = renderHook(() => useDocumentName("doc-1"), { wrapper });
    expect(result.current).toBe("alpha.pdf");
  });

  it("prefers the selectedDocument when it matches the id", () => {
    const wrapper = wrapperFor(
      docsValue({
        selectedDocument: { documentId: "doc-7", fileName: "selected.pdf" },
        documents: [{ documentId: "doc-7", fileName: "stale.pdf" }],
      }),
    );
    const { result } = renderHook(() => useDocumentName("doc-7"), { wrapper });
    expect(result.current).toBe("selected.pdf");
  });

  it("returns undefined for an unknown id (caller shows the placeholder)", () => {
    const wrapper = wrapperFor(
      docsValue({ documents: [{ documentId: "doc-1", fileName: "alpha.pdf" }] }),
    );
    const { result } = renderHook(() => useDocumentName("missing"), { wrapper });
    expect(result.current).toBeUndefined();
  });

  it("falls back to the authoritative getDocument fetch when state carries no name (the onboarding case)", async () => {
    // Mirrors onboarding: the doc is referenced by id but its fileName is NOT in
    // any loaded list/scenario state — only the document-metadata fetch has it.
    const getDocument = vi.fn().mockResolvedValue({
      isSuccess: true,
      response: { documentId: "doc-x", fileName: "utility-bill-april-2026.pdf" },
    });
    const wrapper = wrapperFor(docsValue({ documents: [], getDocument }));
    const { result } = renderHook(() => useDocumentName("doc-x"), { wrapper });

    await waitFor(() => expect(result.current).toBe("utility-bill-april-2026.pdf"));
    expect(getDocument).toHaveBeenCalledWith("doc-x");
    // Cached — resolving the same id again does not refetch.
    expect(getDocument).toHaveBeenCalledTimes(1);
  });

  it("with { fetchFallback: false }: resolves synchronously from state but NEVER fetches", async () => {
    // viewer-nav-redesign dedupe — on the doc-viewer surface the PdfViewer
    // already fetches the X-Ray (which carries the fileName) and reports it up,
    // so the shell opts OUT of this hook's authoritative fetch to avoid a
    // duplicate round-trip. The synchronous state resolution (steady's instant
    // title) stays; only the fetch fallback is suppressed.
    const getDocument = vi.fn().mockResolvedValue({
      isSuccess: true,
      response: { documentId: "doc-x", fileName: "should-not-be-fetched.pdf" },
    });

    // (a) state HAS the name → resolves synchronously, still no fetch.
    const withName = wrapperFor(
      docsValue({ documents: [{ documentId: "doc-1", fileName: "alpha.pdf" }], getDocument }),
    );
    const synced = renderHook(() => useDocumentName("doc-1", { fetchFallback: false }), {
      wrapper: withName,
    });
    expect(synced.result.current).toBe("alpha.pdf");

    // (b) state LACKS the name → stays undefined (the caller's other source
    // fills it) and the fetch is NEVER issued.
    const withoutName = wrapperFor(docsValue({ documents: [], getDocument }));
    const { result } = renderHook(() => useDocumentName("doc-x", { fetchFallback: false }), {
      wrapper: withoutName,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocument).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });

  it("does NOT fetch an unresolved scenario-placeholder id (the bug the gate fixes)", async () => {
    // The canvas mounts with `scenario:utility` before the real UUID resolves;
    // fetching it 406s. The hook must skip the fetch and stay on the placeholder.
    const getDocument = vi.fn().mockResolvedValue({
      isSuccess: true,
      response: { documentId: "scenario:utility", fileName: "should-not-be-used.pdf" },
    });
    const wrapper = wrapperFor(docsValue({ documents: [], getDocument }));
    const { result } = renderHook(() => useDocumentName("scenario:utility"), { wrapper });

    // Give any (incorrect) async fetch a chance to fire, then assert none did.
    await new Promise((r) => setTimeout(r, 20));
    expect(getDocument).not.toHaveBeenCalled();
    expect(result.current).toBeUndefined();
  });
});
