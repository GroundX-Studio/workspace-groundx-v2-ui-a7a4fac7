import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiProvider } from "@/contexts/ApiContext";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import { DocumentsProvider } from "@/contexts/DocumentsContext/DocumentsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import {
  MessageBarProvider,
  useMessageContext,
} from "@/contexts/MessageBarContext/MessageBarContext";
import { makeFakeApi } from "@/test/makeFakeApi";

/**
 * TS-02 — DocumentsProvider coverage. Wraps injected `api.groundxDocuments.*`
 * calls in `run()`. Three contracts: list populates state,
 * ingestRemoteDocuments emits the "Ingest started." success, error
 * path surfaces the "Document operation failed." copy.
 */
let api: ReturnType<typeof makeFakeApi>;

beforeEach(() => {
  api = makeFakeApi();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ApiProvider value={api}>
    <LoadingProvider>
      <MessageBarProvider>
        <DocumentsProvider>{children}</DocumentsProvider>
      </MessageBarProvider>
    </LoadingProvider>
  </ApiProvider>
);

describe("DocumentsProvider (TS-02)", () => {
  it("listDocuments populates `documents` state on success", async () => {
    const fake = [
      { documentId: "d-1", fileName: "alpha.pdf" },
      { documentId: "d-2", fileName: "beta.pdf" },
    ];
    vi.mocked(api.groundxDocuments.listGroundXDocuments).mockResolvedValue({ documents: fake });

    const { result } = renderHook(() => useDocumentsContext(), { wrapper });
    let actionResult: unknown;
    await act(async () => {
      actionResult = await result.current.listDocuments();
    });

    expect(api.groundxDocuments.listGroundXDocuments).toHaveBeenCalledTimes(1);
    expect((actionResult as { isSuccess: boolean }).isSuccess).toBe(true);
    expect(result.current.documents).toEqual(fake);
  });

  it("ingestRemoteDocuments emits 'Ingest started.' on success", async () => {
    vi.mocked(api.groundxDocuments.ingestGroundXRemoteDocuments).mockResolvedValue({
      ingest: { processId: "p-9", status: "queued" },
    });

    const { result } = renderHook(
      () => ({ docs: useDocumentsContext(), msg: useMessageContext() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.docs.ingestRemoteDocuments({
        documents: [{ sourceUrl: "https://x/y.pdf", bucketId: 1, fileName: "y.pdf", fileType: "pdf" }],
      });
    });

    expect(api.groundxDocuments.ingestGroundXRemoteDocuments).toHaveBeenCalledTimes(1);
    expect(result.current.msg.successMessage).toBe("Ingest started.");
  });

  // 2026-06-01-data-model-tail item 5 — `getDocumentXray` must runtime-narrow
  // the SDK-boundary response against the shared `documentXrayResponseSchema`
  // instead of blind-casting it through `as unknown as DocumentXrayResponse`.
  describe("getDocumentXray (item 5 — runtime-narrow the SDK boundary)", () => {
    const validXray = {
      fileName: "utility-bill-april-2026.pdf",
      fileType: "pdf",
      sourceUrl: "https://upload.eyelevel.ai/prod/file/ssp/abc.pdf",
      documentPages: [
        { pageNumber: 1, pageUrl: "https://upload.eyelevel.ai/prod/page/1.jpg", width: 1700, height: 2200, chunks: [] },
      ],
      chunks: [],
    };

    it("returns the parsed X-Ray response for a valid SDK payload (behavior-preserving)", async () => {
      vi.mocked(api.groundxDocuments.getGroundXDocumentXray).mockResolvedValue(validXray);

      const { result } = renderHook(() => useDocumentsContext(), { wrapper });
      let actionResult: { isSuccess: boolean; response?: unknown } | undefined;
      await act(async () => {
        actionResult = await result.current.getDocumentXray("doc-1");
      });

      expect(actionResult?.isSuccess).toBe(true);
      expect(actionResult?.response).toEqual(validXray);
    });

    it("rejects a malformed SDK response (does not blind-cast it through)", async () => {
      // Missing required `documentPages`/`chunks`/`sourceUrl` — today's
      // `as unknown as DocumentXrayResponse` would pass this straight through.
      vi.mocked(api.groundxDocuments.getGroundXDocumentXray).mockResolvedValue({
        fileName: "broken.pdf",
        fileType: "pdf",
      } as Awaited<ReturnType<typeof api.groundxDocuments.getGroundXDocumentXray>>);

      const { result } = renderHook(() => useDocumentsContext(), { wrapper });
      let actionResult: { isSuccess: boolean; error?: unknown } | undefined;
      await act(async () => {
        actionResult = await result.current.getDocumentXray("doc-1");
      });

      expect(actionResult?.isSuccess).toBe(false);
      expect(actionResult?.error).toBeInstanceOf(Error);
    });
  });

  it("a thrown API error surfaces 'Document operation failed.' and isSuccess=false", async () => {
    vi.mocked(api.groundxDocuments.listGroundXDocuments).mockRejectedValue(new Error("boom"));

    const { result } = renderHook(
      () => ({ docs: useDocumentsContext(), msg: useMessageContext() }),
      { wrapper },
    );

    let actionResult: { isSuccess: boolean; response?: unknown; error?: unknown } | undefined;
    await act(async () => {
      actionResult = await result.current.docs.listDocuments();
    });

    expect(actionResult?.isSuccess).toBe(false);
    expect(actionResult?.error).toBeInstanceOf(Error);
    await waitFor(() => {
      expect(result.current.msg.errorMessage).toBe("Document operation failed.");
    });
    expect(result.current.docs.documents).toEqual([]);
  });
});
