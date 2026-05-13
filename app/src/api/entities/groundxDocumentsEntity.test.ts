import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/api/axios", () => ({ default: axiosMock }));

import {
  cancelGroundXProcess,
  copyGroundXDocuments,
  crawlGroundXWebsite,
  deleteGroundXDocument,
  deleteGroundXDocuments,
  getGroundXDocument,
  getGroundXDocumentExtract,
  getGroundXDocumentXray,
  getGroundXProcessingStatus,
  ingestGroundXLocalDocument,
  ingestGroundXRemoteDocuments,
  listGroundXDocuments,
  listGroundXProcesses,
  lookupGroundXDocument,
  updateGroundXDocuments,
} from "./groundxDocumentsEntity";

describe("groundxDocumentsEntity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    axiosMock.get.mockResolvedValue({ data: {} });
    axiosMock.post.mockResolvedValue({ data: {} });
    axiosMock.put.mockResolvedValue({ data: {} });
    axiosMock.delete.mockResolvedValue({ data: {} });
  });

  it("wraps ingest endpoints and returns response data", async () => {
    const ingest = { ingest: { processId: "proc-1", status: "queued" } };
    axiosMock.post.mockResolvedValue({ data: ingest });

    await expect(copyGroundXDocuments({ documentIds: ["doc"], bucketId: 1 })).resolves.toBe(ingest);
    await ingestGroundXRemoteDocuments({ documents: [{ bucketId: 1, sourceUrl: "https://example.com/a.pdf" }] });
    await ingestGroundXLocalDocument(new FormData());
    await crawlGroundXWebsite({ websites: [{ bucketId: 1, sourceUrl: "https://example.com" }] });

    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/ingest/copy", { documentIds: ["doc"], bucketId: 1 }, expect.any(Object));
    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/ingest/documents/remote", expect.any(Object), expect.any(Object));
    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/ingest/documents/local", expect.any(FormData), expect.any(Object));
    expect(axiosMock.post).toHaveBeenCalledWith("/api/v1/ingest/documents/website", expect.any(Object), expect.any(Object));
  });

  it("lists, updates, and deletes document collections", async () => {
    await listGroundXDocuments({ n: 10, nextToken: "next" });
    await updateGroundXDocuments({ documents: [{ documentId: "doc", filter: { type: "contract" } }] });
    await deleteGroundXDocuments({ documentIds: ["doc"] });

    expect(axiosMock.get).toHaveBeenCalledWith(
      "/api/v1/ingest/documents",
      expect.objectContaining({ params: { n: 10, nextToken: "next" } })
    );
    expect(axiosMock.put).toHaveBeenCalledWith("/api/v1/ingest/documents", expect.any(Object), expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/ingest/documents", expect.objectContaining({ data: { documentIds: ["doc"] } }));
  });

  it("uses encoded identifiers for document detail endpoints", async () => {
    await lookupGroundXDocument("folder/doc 1.pdf");
    await getGroundXDocument("folder/doc 1.pdf");
    await deleteGroundXDocument("folder/doc 1.pdf");
    await getGroundXDocumentExtract("folder/doc 1.pdf");
    await getGroundXDocumentXray("folder/doc 1.pdf");

    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/ingest/documents/folder%2Fdoc%201.pdf", expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/ingest/document/folder%2Fdoc%201.pdf", expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/ingest/document/folder%2Fdoc%201.pdf", expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/ingest/document/extract/folder%2Fdoc%201.pdf", expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/ingest/document/xray/folder%2Fdoc%201.pdf", expect.any(Object));
  });

  it("wraps ingest process endpoints", async () => {
    await getGroundXProcessingStatus("proc/1");
    await cancelGroundXProcess("proc/1");
    await listGroundXProcesses();

    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/ingest/proc%2F1", expect.any(Object));
    expect(axiosMock.delete).toHaveBeenCalledWith("/api/v1/ingest/proc%2F1", expect.any(Object));
    expect(axiosMock.get).toHaveBeenCalledWith("/api/v1/ingest", expect.any(Object));
  });
});
