import axios from "@/api/axios";
import {
  GroundXRequestOptions,
  MessageResponse,
  Metadata,
  PaginationParams,
  groundxRequestConfig,
  groundxUrl,
  paramsWithPagination,
} from "@/api/common";

import { DocumentSource, GroundXDocument, IngestProcess, WebsiteSource } from "./sdkTypes";

export interface IngestResponse {
  ingest: IngestProcess;
}

export interface IngestProcessesResponse {
  ingests?: IngestProcess[];
  processes?: IngestProcess[];
}

export interface DocumentsResponse {
  documents: GroundXDocument[];
  count?: number;
  total?: number;
  remaining?: number;
  nextToken?: string;
}

export interface DocumentResponse {
  document: GroundXDocument;
}

export interface DocumentExtractResponse {
  extract: Metadata;
}

export interface DocumentXrayResponse {
  xray: Metadata;
}

export interface IngestDocumentsInput {
  documents: DocumentSource[];
  callbackUrl?: string;
  callbackData?: string;
}

export interface CrawlWebsiteInput {
  websites: WebsiteSource[];
  callbackUrl?: string;
  callbackData?: string;
}

export interface CopyDocumentsInput {
  documentIds: string[];
  bucketId: number;
}

export interface UpdateDocumentsInput {
  documents: Array<{
    documentId: string;
    searchData?: Metadata;
    filter?: Metadata;
  }>;
  callbackUrl?: string;
  callbackData?: string;
}

export interface DeleteDocumentsInput {
  documentIds: string[];
}

export const copyGroundXDocuments = async (
  input: CopyDocumentsInput,
  options?: GroundXRequestOptions
): Promise<IngestResponse> => {
  const response = await axios.post<IngestResponse>(groundxUrl("/v1/ingest/copy"), input, groundxRequestConfig(options));
  return response.data;
};

export const ingestGroundXRemoteDocuments = async (
  input: IngestDocumentsInput,
  options?: GroundXRequestOptions
): Promise<IngestResponse> => {
  const response = await axios.post<IngestResponse>(
    groundxUrl("/v1/ingest/documents/remote"),
    input,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const ingestGroundXLocalDocument = async (
  formData: FormData,
  options?: GroundXRequestOptions
): Promise<IngestResponse> => {
  const response = await axios.post<IngestResponse>(
    groundxUrl("/v1/ingest/documents/local"),
    formData,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const crawlGroundXWebsite = async (
  input: CrawlWebsiteInput,
  options?: GroundXRequestOptions
): Promise<IngestResponse> => {
  const response = await axios.post<IngestResponse>(
    groundxUrl("/v1/ingest/documents/website"),
    input,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const listGroundXDocuments = async (
  params?: PaginationParams,
  options?: GroundXRequestOptions
): Promise<DocumentsResponse> => {
  const response = await axios.get<DocumentsResponse>(groundxUrl("/v1/ingest/documents"), {
    ...groundxRequestConfig(options),
    params: paramsWithPagination(params),
  });
  return response.data;
};

export const updateGroundXDocuments = async (
  input: UpdateDocumentsInput,
  options?: GroundXRequestOptions
): Promise<IngestResponse> => {
  const response = await axios.put<IngestResponse>(
    groundxUrl("/v1/ingest/documents"),
    input,
    groundxRequestConfig(options)
  );
  return response.data;
};

export const deleteGroundXDocuments = async (
  input: DeleteDocumentsInput,
  options?: GroundXRequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(groundxUrl("/v1/ingest/documents"), {
    ...groundxRequestConfig(options),
    data: input,
  });
  return response.data;
};

export const lookupGroundXDocument = async (
  id: string,
  options?: GroundXRequestOptions
): Promise<DocumentResponse> => {
  const response = await axios.get<DocumentResponse>(
    groundxUrl(`/v1/ingest/documents/${encodeURIComponent(id)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const getGroundXDocument = async (
  documentId: string,
  options?: GroundXRequestOptions
): Promise<DocumentResponse> => {
  const response = await axios.get<DocumentResponse>(
    groundxUrl(`/v1/ingest/document/${encodeURIComponent(documentId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const deleteGroundXDocument = async (
  documentId: string,
  options?: GroundXRequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    groundxUrl(`/v1/ingest/document/${encodeURIComponent(documentId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const getGroundXDocumentExtract = async (
  documentId: string,
  options?: GroundXRequestOptions
): Promise<DocumentExtractResponse> => {
  const response = await axios.get<DocumentExtractResponse>(
    groundxUrl(`/v1/ingest/document/extract/${encodeURIComponent(documentId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const getGroundXDocumentXray = async (
  documentId: string,
  options?: GroundXRequestOptions
): Promise<DocumentXrayResponse> => {
  const response = await axios.get<DocumentXrayResponse>(
    groundxUrl(`/v1/ingest/document/xray/${encodeURIComponent(documentId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const getGroundXProcessingStatus = async (
  processId: string,
  options?: GroundXRequestOptions
): Promise<IngestResponse> => {
  const response = await axios.get<IngestResponse>(
    groundxUrl(`/v1/ingest/${encodeURIComponent(processId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const cancelGroundXProcess = async (
  processId: string,
  options?: GroundXRequestOptions
): Promise<MessageResponse> => {
  const response = await axios.delete<MessageResponse>(
    groundxUrl(`/v1/ingest/${encodeURIComponent(processId)}`),
    groundxRequestConfig(options)
  );
  return response.data;
};

export const listGroundXProcesses = async (options?: GroundXRequestOptions): Promise<IngestProcessesResponse> => {
  const response = await axios.get<IngestProcessesResponse>(groundxUrl("/v1/ingest"), groundxRequestConfig(options));
  return response.data;
};

