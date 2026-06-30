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
import type { IngestProcess, IngestProcessDocument } from "./sdkTypes";

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

  // 2026-06-01-data-model-tail item 6 — IngestProcess reconciled to the
  // probe-verified shape (GET /v1/ingest/{processId}, captured 2026-06-01),
  // and listGroundXProcesses collapses the mutually-exclusive ingests?/processes?
  // keys to a single normalized array at the reader boundary.
  it("reconciles IngestProcess to the probe-verified status shape (type-level)", () => {
    // The live status response (GET /v1/ingest/{processId}) — must type-check
    // against IngestProcess. RED before the type carries id/statusMessage/progress.
    const heavy: IngestProcess = {
      processId: "567e37f4-21a1-4059-a847-c60de75d89b3",
      status: "complete",
      id: 25903,
      statusMessage: "",
      progress: {
        complete: {
          total: 1,
          documents: [
            {
              documentId: "5a64053d-0276-493a-ae35-4dfbb76e35ee",
              bucketId: 25903,
              fileName: "table-and-figure-eng.pdf",
              fileType: "pdf",
              fileSize: "71 KB",
              fileTokens: 24280,
              processId: "567e37f4-21a1-4059-a847-c60de75d89b3",
              processLevel: "full",
              sourceUrl: "https://upload.eyelevel.ai/prod/file/ssp/x.pdf",
              xrayUrl: "https://upload.eyelevel.ai/layout/processed/x/y-xray.json",
              status: "complete",
              extracted: false,
              created: "2026-05-21T19:40:35Z",
              updated: "2026-05-21T19:42:27Z",
            },
          ],
        },
        queued: { total: 0, documents: [] },
        processing: { total: 0, documents: [] },
        errors: { total: 0, documents: [] },
        cancelled: { total: 0, documents: [] },
      },
    };
    const completeBucket = heavy.progress?.complete;
    const firstDoc: IngestProcessDocument | undefined = completeBucket?.documents[0];
    expect(firstDoc?.documentId).toBe("5a64053d-0276-493a-ae35-4dfbb76e35ee");
    expect(heavy.statusMessage).toBe("");

    // The light submit/poll shape (GET /v1/ingest list item, POST /v1/ingest/*)
    // is the SAME type with everything past processId/status optional.
    const light: IngestProcess = { processId: "p", status: "queued" };
    expect(light.progress).toBeUndefined();
  });

  it("collapses the list response to a single normalized array (processes key)", async () => {
    // Live GET /v1/ingest returns the top-level `processes` key.
    axiosMock.get.mockResolvedValue({
      data: { processes: [{ id: 25903, processId: "a", status: "complete" }] },
    });
    const fromProcesses = await listGroundXProcesses();
    expect(fromProcesses).toEqual([{ id: 25903, processId: "a", status: "complete" }]);

    // Defensive: a legacy/phantom `ingests` key still collapses to the same array.
    axiosMock.get.mockResolvedValue({
      data: { ingests: [{ processId: "b", status: "queued" }] },
    });
    const fromIngests = await listGroundXProcesses();
    expect(fromIngests).toEqual([{ processId: "b", status: "queued" }]);

    // Empty/absent → empty array, never undefined.
    axiosMock.get.mockResolvedValue({ data: {} });
    expect(await listGroundXProcesses()).toEqual([]);
  });
});
