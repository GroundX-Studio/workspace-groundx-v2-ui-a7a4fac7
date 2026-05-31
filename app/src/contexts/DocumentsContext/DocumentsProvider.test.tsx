import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { api } from "@/api";
import { useDocumentsContext } from "@/contexts/DocumentsContext";
import { DocumentsProvider } from "@/contexts/DocumentsContext/DocumentsProvider";
import { LoadingProvider } from "@/contexts/LoadingContext/LoadingContext";
import {
  MessageBarProvider,
  useMessageContext,
} from "@/contexts/MessageBarContext/MessageBarContext";

/**
 * TS-02 — DocumentsProvider coverage. Wraps `api.groundxDocuments.*`
 * calls in `run()`. Three contracts: list populates state,
 * ingestRemoteDocuments emits the "Ingest started." success, error
 * path surfaces the "Document operation failed." copy.
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
    },
  },
}));

beforeEach(() => {
  for (const fn of Object.values(api.groundxDocuments)) (fn as Mock).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LoadingProvider>
    <MessageBarProvider>
      <DocumentsProvider>{children}</DocumentsProvider>
    </MessageBarProvider>
  </LoadingProvider>
);

describe("DocumentsProvider (TS-02)", () => {
  it("listDocuments populates `documents` state on success", async () => {
    const fake = [
      { documentId: "d-1", fileName: "alpha.pdf" },
      { documentId: "d-2", fileName: "beta.pdf" },
    ];
    (api.groundxDocuments.listGroundXDocuments as Mock).mockResolvedValue({ documents: fake });

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
    (api.groundxDocuments.ingestGroundXRemoteDocuments as Mock).mockResolvedValue({
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

  it("a thrown API error surfaces 'Document operation failed.' and isSuccess=false", async () => {
    (api.groundxDocuments.listGroundXDocuments as Mock).mockRejectedValue(new Error("boom"));

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
