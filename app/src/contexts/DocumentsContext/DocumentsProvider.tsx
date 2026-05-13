import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { GroundXRequestOptions, PaginationParams } from "@/api/common";
import {
  CopyDocumentsInput,
  CrawlWebsiteInput,
  DeleteDocumentsInput,
  IngestDocumentsInput,
  UpdateDocumentsInput,
} from "@/api/entities/groundxDocumentsEntity";
import { GroundXDocument, IngestProcess } from "@/api/entities/sdkTypes";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { createSdkResult } from "@/contexts/sdkContextTypes";

import { DocumentsContext } from "./DocumentsContext";

export const DocumentsProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage, setSuccessMessage } = useMessageContext();
  const [documents, setDocuments] = useState<GroundXDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<GroundXDocument | null>(null);
  const [processes, setProcesses] = useState<IngestProcess[]>([]);

  const run = useCallback(
    async <T,>(work: () => Promise<T>, successMessage?: string) => {
      const result = createSdkResult<T>();
      setIsLoading(true);
      try {
        result.response = await work();
        result.isSuccess = true;
        if (successMessage) setSuccessMessage(successMessage);
      } catch (error) {
        result.error = error;
        setErrorMessage("Document operation failed.");
      } finally {
        setIsLoading(false);
      }
      return result;
    },
    [setErrorMessage, setIsLoading, setSuccessMessage]
  );

  const listDocuments = useCallback(
    (params?: PaginationParams, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxDocuments.listGroundXDocuments(params, options);
        setDocuments(response.documents);
        return response.documents;
      }),
    [run]
  );

  const ingestRemoteDocuments = useCallback(
    (input: IngestDocumentsInput, options?: GroundXRequestOptions) =>
      run(async () => (await api.groundxDocuments.ingestGroundXRemoteDocuments(input, options)).ingest, "Ingest started."),
    [run]
  );

  const crawlWebsite = useCallback(
    (input: CrawlWebsiteInput, options?: GroundXRequestOptions) =>
      run(async () => (await api.groundxDocuments.crawlGroundXWebsite(input, options)).ingest, "Crawl started."),
    [run]
  );

  const copyDocuments = useCallback(
    (input: CopyDocumentsInput, options?: GroundXRequestOptions) =>
      run(async () => (await api.groundxDocuments.copyGroundXDocuments(input, options)).ingest, "Copy started."),
    [run]
  );

  const updateDocuments = useCallback(
    (input: UpdateDocumentsInput, options?: GroundXRequestOptions) =>
      run(async () => (await api.groundxDocuments.updateGroundXDocuments(input, options)).ingest, "Documents updated."),
    [run]
  );

  const deleteDocuments = useCallback(
    (input: DeleteDocumentsInput, options?: GroundXRequestOptions) =>
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
    (documentId: string, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxDocuments.getGroundXDocument(documentId, options);
        setSelectedDocument(response.document);
        return response.document;
      }),
    [run]
  );

  const lookupDocument = useCallback(
    (id: string, options?: GroundXRequestOptions) =>
      run(async () => {
        const response = await api.groundxDocuments.lookupGroundXDocument(id, options);
        setSelectedDocument(response.document);
        return response.document;
      }),
    [run]
  );

  const deleteDocument = useCallback(
    (documentId: string, options?: GroundXRequestOptions) =>
      run(async () => {
        await api.groundxDocuments.deleteGroundXDocument(documentId, options);
        setDocuments((items) => items.filter((document) => document.documentId !== documentId));
        setSelectedDocument((document) => (document?.documentId === documentId ? null : document));
      }, "Document deleted."),
    [run]
  );

  const getProcessingStatus = useCallback(
    (processId: string, options?: GroundXRequestOptions) =>
      run(async () => (await api.groundxDocuments.getGroundXProcessingStatus(processId, options)).ingest),
    [run]
  );

  const cancelProcess = useCallback(
    (processId: string, options?: GroundXRequestOptions) =>
      run(async () => {
        await api.groundxDocuments.cancelGroundXProcess(processId, options);
      }, "Process cancelled."),
    [run]
  );

  const listProcesses = useCallback(
    (options?: GroundXRequestOptions) =>
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
        getProcessingStatus,
        cancelProcess,
        listProcesses,
      }}
    >
      {children}
    </DocumentsContext.Provider>
  );
};
