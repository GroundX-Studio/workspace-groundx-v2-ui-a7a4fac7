import { documentXrayResponseSchema } from "@groundx/shared";
import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { RequestOptions, PaginationParams } from "@/api/common";
import {
  CopyDocumentsInput,
  CrawlWebsiteInput,
  DeleteDocumentsInput,
  IngestDocumentsInput,
  UpdateDocumentsInput,
} from "@/api/entities/groundxDocumentsEntity";
import { GroundXDocument, IngestProcess } from "@/api/entities/sdkTypes";
import { useSdkRunner } from "@/contexts/createEntityContext";

import { DocumentsContext } from "./DocumentsContext";

export const DocumentsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const run = useSdkRunner("Document operation failed.");
  const [documents, setDocuments] = useState<GroundXDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<GroundXDocument | null>(null);
  const [processes, setProcesses] = useState<IngestProcess[]>([]);

  const listDocuments = useCallback(
    (params?: PaginationParams, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxDocuments.listGroundXDocuments(params, options);
        setDocuments(response.documents);
        return response.documents;
      }),
    [run]
  );

  const ingestRemoteDocuments = useCallback(
    (input: IngestDocumentsInput, options?: RequestOptions) =>
      run(async () => (await api.groundxDocuments.ingestGroundXRemoteDocuments(input, options)).ingest, "Ingest started."),
    [run]
  );

  const crawlWebsite = useCallback(
    (input: CrawlWebsiteInput, options?: RequestOptions) =>
      run(async () => (await api.groundxDocuments.crawlGroundXWebsite(input, options)).ingest, "Crawl started."),
    [run]
  );

  const copyDocuments = useCallback(
    (input: CopyDocumentsInput, options?: RequestOptions) =>
      run(async () => (await api.groundxDocuments.copyGroundXDocuments(input, options)).ingest, "Copy started."),
    [run]
  );

  const updateDocuments = useCallback(
    (input: UpdateDocumentsInput, options?: RequestOptions) =>
      run(async () => (await api.groundxDocuments.updateGroundXDocuments(input, options)).ingest, "Documents updated."),
    [run]
  );

  const deleteDocuments = useCallback(
    (input: DeleteDocumentsInput, options?: RequestOptions) =>
      run(async () => {
        await api.groundxDocuments.deleteGroundXDocuments(input, options);
        setDocuments((items) => items.filter((document) => !input.documentIds.includes(document.documentId)));
        setSelectedDocument((document) =>
          document && input.documentIds.includes(document.documentId) ? null : document
        );
      }, "Documents deleted."),
    [run]
  );

  const getDocument = useCallback(
    (documentId: string, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxDocuments.getGroundXDocument(documentId, options);
        setSelectedDocument(response.document);
        return response.document;
      }),
    [run]
  );

  const lookupDocument = useCallback(
    (id: string, options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxDocuments.lookupGroundXDocument(id, options);
        setSelectedDocument(response.document);
        return response.document;
      }),
    [run]
  );

  const deleteDocument = useCallback(
    (documentId: string, options?: RequestOptions) =>
      run(async () => {
        await api.groundxDocuments.deleteGroundXDocument(documentId, options);
        setDocuments((items) => items.filter((document) => document.documentId !== documentId));
        setSelectedDocument((document) => (document?.documentId === documentId ? null : document));
      }, "Document deleted."),
    [run]
  );

  const getDocumentXray = useCallback(
    (documentId: string, options?: RequestOptions) =>
      run(async () => {
        // 2026-06-01-data-model-tail item 5 — runtime-narrow the SDK-boundary
        // response against the canonical `@groundx/shared` X-Ray schema instead
        // of blind-casting (`as unknown as DocumentXrayResponse`). The real API
        // returns the response object at top level (verified 2026-05-25; see
        // docs/agents/groundx-real-api-shapes.md). A malformed payload now
        // throws here and surfaces as an `SdkActionResult` failure rather than
        // being passed straight through as if it were well-formed.
        const raw = await api.groundxDocuments.getGroundXDocumentXray(documentId, options);
        return documentXrayResponseSchema.parse(raw);
      }),
    [run]
  );

  const getDocumentExtract = useCallback(
    (documentId: string, options?: RequestOptions) =>
      run(async () => {
        // Returns the raw extract JSON as `Metadata` already — no cast needed.
        return await api.groundxDocuments.getGroundXDocumentExtract(documentId, options);
      }),
    [run]
  );

  const getProcessingStatus = useCallback(
    (processId: string, options?: RequestOptions) =>
      run(async () => (await api.groundxDocuments.getGroundXProcessingStatus(processId, options)).ingest),
    [run]
  );

  const cancelProcess = useCallback(
    (processId: string, options?: RequestOptions) =>
      run(async () => {
        await api.groundxDocuments.cancelGroundXProcess(processId, options);
      }, "Process cancelled."),
    [run]
  );

  const listProcesses = useCallback(
    (options?: RequestOptions) =>
      run(async () => {
        const response = await api.groundxDocuments.listGroundXProcesses(options);
        const nextProcesses = response.ingests || response.processes || [];
        setProcesses(nextProcesses);
        return nextProcesses;
      }),
    [run]
  );

  return (
    <DocumentsContext.Provider
      value={{
        documents,
        selectedDocument,
        processes,
        listDocuments,
        ingestRemoteDocuments,
        crawlWebsite,
        copyDocuments,
        updateDocuments,
        deleteDocuments,
        getDocument,
        lookupDocument,
        deleteDocument,
        getDocumentXray,
        getDocumentExtract,
        getProcessingStatus,
        cancelProcess,
        listProcesses,
      }}
    >
      {children}
    </DocumentsContext.Provider>
  );
};
